import type { ControlRoomService } from '../control-room/service.ts';
import type { ManagerRuntime } from '../manager/runtime.ts';
import { normalizeChatDisplayAnswer } from './format.ts';
import type { ManagerProgressEvent } from '../manager/types.ts';
import { createId } from '../utils/id.ts';
import type {
  ChatMessageRequest,
  ChatMessageResponse,
  ChatRunSnapshot,
  ChatStreamEnvelope,
} from './types.ts';

export interface ChatServiceOptions {
  managerFactory: () => Promise<ManagerRuntime> | ManagerRuntime;
  controlRoom?: ControlRoomService | null;
}

export class ChatService {
  private readonly managerFactory: ChatServiceOptions['managerFactory'];
  private readonly controlRoom: ControlRoomService | null;
  private readonly runs = new Map<string, ChatRunSnapshot>();
  private readonly runTtlMs = 15 * 60 * 1000;

  constructor(options: ChatServiceOptions) {
    this.managerFactory = options.managerFactory;
    this.controlRoom = options.controlRoom ?? null;
  }

  private async processMessage(
    request: ChatMessageRequest,
    onProgress?: (event: ManagerProgressEvent) => void | Promise<void>,
  ): Promise<ChatMessageResponse> {
    const message = request.message.trim();
    if (!message) {
      throw new Error('chat message is required');
    }

    const activityLog: ManagerProgressEvent[] = [];
    let nextSeq = 1;
    const recordProgress = async (event: ManagerProgressEvent): Promise<void> => {
      const seq = event.seq ?? nextSeq;
      const normalizedEvent: ManagerProgressEvent = {
        ...event,
        seq,
      };
      nextSeq = seq + 1;
      activityLog.push(normalizedEvent);
      await onProgress?.(normalizedEvent);
    };

    const manager = await this.managerFactory();
    try {
      const result = await manager.run({
        goal: message,
        worker_preference: 'auto',
        output_mode: 'json',
      }, {
        onProgress: recordProgress,
      });

      let missionId: string | null = null;
      let missionStatus: ChatMessageResponse['mission_status'] = null;
      let controlRoomPath: string | null = null;
      if (result.decision.kind !== 'chat' && this.controlRoom) {
        const view = this.controlRoom.recordManagerResult(message, result);
        missionId = view.mission_id;
        missionStatus = view.status;
        controlRoomPath = `/control-room?mission_id=${encodeURIComponent(view.mission_id)}`;
        await recordProgress({
          stage: 'control_room',
          kind: 'result',
          status: 'completed',
          actor: 'control_room',
          title: 'Mission recorded in control room',
          detail: `Mission ${view.mission_id} is now available for inspection.`,
          timestamp: Date.now(),
          mission_id: view.mission_id,
          task_id: null,
          decision_kind: result.decision.kind,
          requested_worker: result.decision.selected_worker,
          executed_worker: result.worker_result?.executed_worker ?? null,
          blocked_reason_code: result.decision.blocked_reason_code,
        });
      }

      return {
        user_message: message,
        answer: normalizeChatDisplayAnswer(result.owner_response),
        decision_kind: result.decision.kind,
        blocked_reason: result.decision.blocked_reason,
        mission_id: missionId,
        mission_status: missionStatus,
        control_room_path: controlRoomPath,
        trace_id: result.mission_brief.brain_trace_id,
        citations: result.mission_brief.brain_citations,
        activity_log: activityLog,
      };
    } finally {
      await manager.dispose();
    }
  }

  async sendMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    return await this.processMessage(request);
  }

  startMessageRun(request: ChatMessageRequest): ChatRunSnapshot {
    const now = Date.now();
    this.pruneRuns(now);
    const runId = createId('chatrun');
    const snapshot: ChatRunSnapshot = {
      run_id: runId,
      run_status: 'pending',
      request,
      response: null,
      trace_events: [],
      final_answer: null,
      error: null,
      created_at: now,
      updated_at: now,
    };
    this.runs.set(runId, snapshot);

    void this.processRun(runId, request);
    return this.getRunSnapshot(runId)!;
  }

  getRunSnapshot(runId: string): ChatRunSnapshot | null {
    const snapshot = this.runs.get(runId);
    return snapshot ? {
      ...snapshot,
      request: { ...snapshot.request },
      response: snapshot.response ? {
        ...snapshot.response,
        citations: [...snapshot.response.citations],
        activity_log: [...snapshot.response.activity_log],
      } : null,
      trace_events: [...snapshot.trace_events],
    } : null;
  }

  private async processRun(runId: string, request: ChatMessageRequest): Promise<void> {
    const snapshot = this.runs.get(runId);
    if (!snapshot) {
      return;
    }

    snapshot.run_status = 'running';
    snapshot.updated_at = Date.now();

    try {
      const response = await this.processMessage(request, async (event) => {
        const active = this.runs.get(runId);
        if (!active) {
          return;
        }
        active.trace_events.push(event);
        active.updated_at = Date.now();
      });
      const active = this.runs.get(runId);
      if (!active) {
        return;
      }
      active.response = response;
      active.final_answer = response.answer;
      active.trace_events = [...response.activity_log];
      active.run_status = 'completed';
      active.updated_at = Date.now();
    } catch (error) {
      const active = this.runs.get(runId);
      if (!active) {
        return;
      }
      active.error = error instanceof Error ? error.message : String(error);
      active.run_status = 'failed';
      active.updated_at = Date.now();
    }
  }

  private pruneRuns(now: number): void {
    for (const [runId, snapshot] of this.runs.entries()) {
      if (now - snapshot.updated_at > this.runTtlMs) {
        this.runs.delete(runId);
      }
    }
  }

  async streamMessage(
    request: ChatMessageRequest,
    onEvent: (event: ChatStreamEnvelope) => void | Promise<void>,
  ): Promise<void> {
    try {
      const response = await this.processMessage(request, async (progressEvent) => {
        await onEvent({
          type: 'status',
          event: progressEvent,
        });
      });
      await onEvent({
        type: 'result',
        payload: response,
      });
    } catch (error) {
      await onEvent({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

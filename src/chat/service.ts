import type { ControlRoomService } from '../control-room/service.ts';
import type { ManagerRuntime } from '../manager/runtime.ts';
import { normalizeChatDisplayAnswer } from './format.ts';
import type { ManagerProgressEvent } from '../manager/types.ts';
import type { ChatMessageRequest, ChatMessageResponse, ChatStreamEnvelope } from './types.ts';

export interface ChatServiceOptions {
  managerFactory: () => Promise<ManagerRuntime> | ManagerRuntime;
  controlRoom?: ControlRoomService | null;
}

export class ChatService {
  private readonly managerFactory: ChatServiceOptions['managerFactory'];
  private readonly controlRoom: ControlRoomService | null;

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
    const recordProgress = async (event: ManagerProgressEvent): Promise<void> => {
      activityLog.push(event);
      await onProgress?.(event);
    };

    const manager = await this.managerFactory();
    try {
      await recordProgress({
        stage: 'chat_receive',
        status: 'started',
        actor: 'manager',
        title: 'Received your message',
        detail: 'best-brain is deciding whether to answer directly or run a mission.',
        timestamp: Date.now(),
        mission_id: null,
        task_id: null,
        decision_kind: null,
        requested_worker: null,
        executed_worker: null,
        blocked_reason_code: null,
      });
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

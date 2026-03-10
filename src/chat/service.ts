import type { ControlRoomService } from '../control-room/service.ts';
import type { ManagerRuntime } from '../manager/runtime.ts';
import type { ChatMessageRequest, ChatMessageResponse } from './types.ts';

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

  async sendMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    const message = request.message.trim();
    if (!message) {
      throw new Error('chat message is required');
    }

    const manager = await this.managerFactory();
    try {
      const result = await manager.run({
        goal: message,
        worker_preference: 'auto',
        output_mode: 'json',
      });

      let missionId: string | null = null;
      let missionStatus: ChatMessageResponse['mission_status'] = null;
      let controlRoomPath: string | null = null;
      if (result.decision.kind !== 'chat' && this.controlRoom) {
        const view = this.controlRoom.recordManagerResult(message, result);
        missionId = view.mission_id;
        missionStatus = view.status;
        controlRoomPath = `/control-room?mission_id=${encodeURIComponent(view.mission_id)}`;
      }

      return {
        user_message: message,
        answer: result.owner_response,
        decision_kind: result.decision.kind,
        blocked_reason: result.decision.blocked_reason,
        mission_id: missionId,
        mission_status: missionStatus,
        control_room_path: controlRoomPath,
        trace_id: result.mission_brief.brain_trace_id,
        citations: result.mission_brief.brain_citations,
      };
    } finally {
      await manager.dispose();
    }
  }
}

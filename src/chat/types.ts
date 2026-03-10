import type { ConsultCitation, MissionStatus } from '../types.ts';
import type { ManagerDecisionKind } from '../manager/types.ts';

export interface ChatMessageRequest {
  message: string;
}

export interface ChatMessageResponse {
  user_message: string;
  answer: string;
  decision_kind: ManagerDecisionKind;
  blocked_reason: string | null;
  mission_id: string | null;
  mission_status: MissionStatus | null;
  control_room_path: string | null;
  trace_id: string;
  citations: ConsultCitation[];
}

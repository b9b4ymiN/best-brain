import type { ConsultCitation, MissionStatus } from '../types.ts';
import type { ManagerDecisionKind, ManagerProgressEvent } from '../manager/types.ts';

export interface ChatMessageRequest {
  message: string;
}

export interface ChatPromotionSuggestion {
  can_promote: boolean;
  reason: string | null;
  control_room_prefill_path: string | null;
}

export interface ChatMessageResponse {
  user_message: string;
  answer: string;
  decision_kind: ManagerDecisionKind;
  blocked_reason: string | null;
  mission_id: string | null;
  mission_status: MissionStatus | null;
  control_room_path: string | null;
  promotion: ChatPromotionSuggestion;
  trace_id: string;
  citations: ConsultCitation[];
  activity_log: ManagerProgressEvent[];
}

export type ChatRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ChatRunSnapshot {
  run_id: string;
  run_status: ChatRunStatus;
  request: ChatMessageRequest;
  response: ChatMessageResponse | null;
  trace_events: ManagerProgressEvent[];
  final_answer: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChatStreamStatusEnvelope {
  type: 'status';
  event: ManagerProgressEvent;
}

export interface ChatStreamResultEnvelope {
  type: 'result';
  payload: ChatMessageResponse;
}

export interface ChatStreamErrorEnvelope {
  type: 'error';
  error: string;
}

export type ChatStreamEnvelope =
  | ChatStreamStatusEnvelope
  | ChatStreamResultEnvelope
  | ChatStreamErrorEnvelope;

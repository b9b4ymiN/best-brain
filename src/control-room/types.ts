import type { MissionStatus } from '../types.ts';
import type { MissionTaskGraph } from '../manager/graph.ts';
import type { WorkerId } from '../workers/types.ts';
import type { RuntimeArtifactRecord } from '../runtime/types.ts';

export const CONTROL_ROOM_ACTIONS = [
  'launch_mission',
  'retry_mission',
  'approve_verdict',
  'reject_verdict',
  'cancel_mission',
  'resume_mission',
] as const;

export type ControlRoomAction = (typeof CONTROL_ROOM_ACTIONS)[number];

export const CONTROL_ROOM_MODES = ['auto', 'chat', 'task', 'mission'] as const;
export type ControlRoomMode = (typeof CONTROL_ROOM_MODES)[number];

export const WORKER_CARD_STATUSES = [
  'idle',
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
] as const;

export type WorkerCardStatus = (typeof WORKER_CARD_STATUSES)[number];

export interface ControlRoomLaunchRequest {
  goal: string;
  mode: ControlRoomMode;
  worker_preference: 'auto' | WorkerId;
  dry_run: boolean;
  no_execute?: boolean;
}

export interface ControlRoomMissionSummary {
  mission_id: string;
  goal: string;
  status: MissionStatus;
  selected_worker: WorkerId | null;
  retryable: boolean;
  final_message: string;
  updated_at: number;
}

export interface MissionTimelineEntry {
  id: string;
  mission_id: string;
  source: 'manager' | 'worker' | 'runtime' | 'verifier' | 'operator';
  status: string;
  title: string;
  detail: string;
  artifact_ids: string[];
  created_at: number;
}

export interface WorkerStatusCard {
  worker: WorkerId;
  status: WorkerCardStatus;
  current_task_id: string | null;
  current_task_title: string | null;
  last_update_at: number;
}

export interface JudgeVerdictView {
  mission_id: string;
  status: Extract<MissionStatus, 'awaiting_verification' | 'verification_failed' | 'verified_complete' | 'rejected'>;
  summary: string;
  evidence_count: number;
  checks_passed: number;
  checks_total: number;
}

export interface OperatorReviewView {
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  updated_at: number | null;
}

export interface MissionConsoleView {
  mission_id: string;
  goal: string;
  status: MissionStatus;
  mission_graph: MissionTaskGraph;
  plan_overview: string[];
  timeline: MissionTimelineEntry[];
  workers: WorkerStatusCard[];
  artifacts: RuntimeArtifactRecord[];
  final_report_artifact: RuntimeArtifactRecord | null;
  verdict: JudgeVerdictView | null;
  operator_review: OperatorReviewView;
  allowed_actions: ControlRoomAction[];
  updated_at: number;
}

export interface ControlRoomDashboardView {
  latest_mission_id: string | null;
  missions: ControlRoomMissionSummary[];
}

export interface ControlRoomActionRequest {
  action: ControlRoomAction;
  note?: string;
}

export interface ControlRoomActionResult {
  accepted: boolean;
  mission_id: string;
  action: ControlRoomAction;
  message: string;
  view: MissionConsoleView;
}

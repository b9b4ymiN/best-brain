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

export const WORKER_CARD_STATUSES = [
  'idle',
  'queued',
  'running',
  'blocked',
  'completed',
  'failed',
] as const;

export type WorkerCardStatus = (typeof WORKER_CARD_STATUSES)[number];

export const MISSION_PHASE_KEYS = [
  'goal',
  'consult',
  'compile',
  'dispatch',
  'execute',
  'verify',
  'report',
] as const;

export type MissionPhaseKey = (typeof MISSION_PHASE_KEYS)[number];

export const MISSION_PHASE_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
] as const;

export type MissionPhaseStatus = (typeof MISSION_PHASE_STATUSES)[number];

export interface ControlRoomLaunchRequest {
  goal: string;
  dry_run: boolean;
  no_execute?: boolean;
}

export interface ControlRoomMissionSummary {
  mission_id: string;
  goal: string;
  mission_kind: string;
  status: MissionStatus;
  selected_worker: WorkerId | null;
  duration_ms: number | null;
  checks_passed: number;
  checks_total: number;
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
  artifact_count: number;
  last_summary: string | null;
  last_update_at: number;
}

export interface MissionPhaseSummary {
  phase: MissionPhaseKey;
  title: string;
  status: MissionPhaseStatus;
  started_at: number | null;
  ended_at: number | null;
  duration_ms: number | null;
  detail: string;
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
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string | null;
  updated_at: number | null;
}

export interface MissionConsoleView {
  mission_id: string;
  goal: string;
  status: MissionStatus;
  mission_graph: MissionTaskGraph;
  plan_overview: string[];
  phase_timeline: MissionPhaseSummary[];
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
  available_statuses: MissionStatus[];
  available_mission_kinds: string[];
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

export interface ControlRoomHistoryFilter {
  status?: MissionStatus | 'all';
  mission_kind?: string | 'all';
  date_from?: string | null;
  date_to?: string | null;
}

export interface MissionComparisonSummary {
  has_previous: boolean;
  status_changed: boolean;
  duration_delta_ms: number | null;
  checks_passed_delta: number;
}

export interface ControlRoomHistoryItem extends ControlRoomMissionSummary {
  run_count: number;
  comparison: MissionComparisonSummary;
}

export interface ControlRoomHistoryView {
  filters: ControlRoomHistoryFilter;
  total: number;
  items: ControlRoomHistoryItem[];
}

import type { MemoryQualityMetrics, MissionStatus } from '../types.ts';
import type { MissionTaskGraph } from '../manager/graph.ts';
import type { WorkerId } from '../workers/types.ts';
import type { RuntimeArtifactRecord } from '../runtime/types.ts';
import type { AutonomyDecision, AutonomyLevel, AutonomyPolicyConfig } from '../policies/autonomy.ts';
import type { SystemHealthAlert, SystemHealthSnapshot } from '../runtime/health.ts';
import type { ScheduledMissionRecord, TaskQueueItemRecord } from '../runtime/types.ts';
import type { OperatorSafetyState } from '../runtime/safety.ts';
import type { WorkerDiagnosticsSnapshot } from '../runtime/worker-diagnostics.ts';

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
  worker_preference?: Exclude<WorkerId, 'verifier'> | 'auto';
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
  autonomy: AutonomyDecision | null;
  operator_review: OperatorReviewView;
  allowed_actions: ControlRoomAction[];
  updated_at: number;
}

export interface ControlRoomDashboardView {
  latest_mission_id: string | null;
  missions: ControlRoomMissionSummary[];
  available_statuses: MissionStatus[];
  available_mission_kinds: string[];
  autonomy_policy: AutonomyPolicyConfig;
  system_health: SystemHealthSnapshot | null;
  recent_alerts: SystemHealthAlert[];
  memory_health: MemoryQualityMetrics | null;
}

export interface OperatorActiveMissionView extends ControlRoomMissionSummary {
  autonomy_level: AutonomyLevel | null;
  override_allowed: boolean;
  override_action: 'cancel_mission' | null;
}

export interface OperatorApprovalQueueItem {
  mission_id: string;
  goal: string;
  status: MissionStatus;
  mission_kind: string;
  reason: string;
  allowed_actions: ControlRoomAction[];
  operator_review: OperatorReviewView;
  updated_at: number;
}

export interface OperatorRecoveryAction {
  id: string;
  kind: 'safety' | 'worker_cli_unavailable' | 'health_alert';
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  command_hint: string | null;
}

export interface OperatorDashboardView {
  generated_at: number;
  active_missions: OperatorActiveMissionView[];
  approval_queue: OperatorApprovalQueueItem[];
  safety_state: OperatorSafetyState | null;
  worker_diagnostics: WorkerDiagnosticsSnapshot | null;
  recovery_actions: OperatorRecoveryAction[];
  autonomy_policy: AutonomyPolicyConfig;
  system_health: SystemHealthSnapshot | null;
  recent_alerts: SystemHealthAlert[];
  scheduled_missions: ScheduledMissionRecord[];
  queued_tasks: TaskQueueItemRecord[];
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
  autonomy_level: AutonomyLevel | null;
  comparison: MissionComparisonSummary;
}

export interface ControlRoomHistoryView {
  filters: ControlRoomHistoryFilter;
  total: number;
  items: ControlRoomHistoryItem[];
}

export interface ControlRoomAutonomyPolicyUpdateRequest {
  default_level?: AutonomyLevel;
  mission_kind_levels?: Record<string, AutonomyLevel>;
  routine_min_verified_runs?: number;
}

export interface OperatorOverrideRequest {
  mission_id: string;
  note?: string;
}

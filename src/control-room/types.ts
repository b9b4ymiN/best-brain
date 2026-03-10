import type { MissionStatus } from '../types.ts';
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

export interface MissionConsoleView {
  mission_id: string;
  goal: string;
  status: MissionStatus;
  plan_overview: string[];
  timeline: MissionTimelineEntry[];
  workers: WorkerStatusCard[];
  artifacts: RuntimeArtifactRecord[];
  verdict: JudgeVerdictView | null;
  allowed_actions: ControlRoomAction[];
}

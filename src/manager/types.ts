import type {
  CompletionProofState,
  ConsultCitation,
  ConsultResponse,
  MissionContextBundle,
  VerificationArtifact,
  VerificationCheck,
} from '../types.ts';

export const MANAGER_WORKER_PREFERENCES = ['auto', 'claude', 'codex'] as const;
export type ManagerWorkerPreference = (typeof MANAGER_WORKER_PREFERENCES)[number];

export const MANAGER_WORKERS = ['claude', 'codex'] as const;
export type ManagerWorker = (typeof MANAGER_WORKERS)[number];

export const MANAGER_DECISION_KINDS = ['chat', 'task', 'mission'] as const;
export type ManagerDecisionKind = (typeof MANAGER_DECISION_KINDS)[number];

export const MANAGER_OUTPUT_MODES = ['human', 'json'] as const;
export type ManagerOutputMode = (typeof MANAGER_OUTPUT_MODES)[number];

export interface ManagerInput {
  goal: string;
  worker_preference: ManagerWorkerPreference;
  mission_id: string | null;
  cwd: string;
  dry_run: boolean;
  no_execute: boolean;
  output_mode: ManagerOutputMode;
}

export interface ManagerDecision {
  kind: ManagerDecisionKind;
  should_execute: boolean;
  selected_worker: ManagerWorker | null;
  reason: string;
  verification_required: boolean;
}

export interface MissionBrief {
  mission_id: string;
  goal: string;
  kind: ManagerDecisionKind;
  selected_worker: ManagerWorker | null;
  success_criteria: string[];
  constraints: string[];
  preferred_format: string;
  planning_hints: string[];
  brain_citations: ConsultCitation[];
  brain_trace_id: string;
  execution_plan: string[];
}

export interface ExecutionRequest {
  mission_id: string;
  selected_worker: ManagerWorker;
  prompt: string;
  cwd: string;
  expected_artifacts: Array<VerificationArtifact['type']>;
  verification_required: boolean;
}

export interface VerificationRequest {
  mission_id: string;
  summary: string;
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
  status: 'verified_complete' | 'verification_failed' | 'rejected';
}

export interface WorkerExecutionResult {
  summary: string;
  artifacts: VerificationArtifact[];
  proposed_checks: VerificationCheck[];
  raw_output: string;
  status: 'success' | 'needs_retry' | 'failed';
}

export interface BrainWriteRecord {
  action: 'save_outcome' | 'save_failure' | 'start_verification' | 'complete_verification';
  status: 'success' | 'skipped';
  detail: string;
  payload?: unknown;
}

export interface ManagerRunResult {
  input: ManagerInput;
  decision: ManagerDecision;
  mission_brief: MissionBrief;
  worker_result: WorkerExecutionResult | null;
  verification_result: CompletionProofState | null;
  brain_writes: BrainWriteRecord[];
  final_message: string;
  retryable: boolean;
  started_brain_server: boolean;
}

export interface RoutedManagerContext {
  input: ManagerInput;
  consult: ConsultResponse;
  context: MissionContextBundle;
  decision: ManagerDecision;
}

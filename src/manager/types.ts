import type {
  CompletionProofState,
  ConsultCitation,
  ConsultResponse,
  MissionContextBundle,
  VerificationArtifact,
  VerificationCheck,
} from '../types.ts';
import type { MissionPlaybook } from '../playbooks/types.ts';
import type {
  InputAdapterDecision,
  MissionBlockedReason,
  MissionReportContract,
  ProvingMissionDefinition,
} from '../proving/types.ts';
import type { RuntimeSessionBundle } from '../runtime/types.ts';
import type { MissionTaskGraph } from './graph.ts';

export const MANAGER_WORKER_PREFERENCES = ['auto', 'claude', 'codex', 'shell'] as const;
export type ManagerWorkerPreference = (typeof MANAGER_WORKER_PREFERENCES)[number];

export const MANAGER_WORKERS = ['claude', 'codex', 'shell'] as const;
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

export const MANAGER_PROGRESS_STATUSES = [
  'started',
  'completed',
  'info',
  'blocked',
  'failed',
] as const;

export type ManagerProgressStatus = (typeof MANAGER_PROGRESS_STATUSES)[number];

export interface ManagerProgressEvent {
  stage: string;
  status: ManagerProgressStatus;
  actor: 'manager' | 'brain' | 'claude' | 'codex' | 'shell' | 'verifier' | 'runtime' | 'control_room';
  title: string;
  detail: string;
  timestamp: number;
  mission_id: string | null;
  task_id: string | null;
  decision_kind: ManagerDecisionKind | null;
  requested_worker: ManagerWorker | null;
  executed_worker: ManagerWorker | null;
  blocked_reason_code: MissionBlockedReason | null;
}

export interface ManagerRunObserver {
  onProgress?: (event: ManagerProgressEvent) => void | Promise<void>;
}

export interface ManagerDecision {
  kind: ManagerDecisionKind;
  should_execute: boolean;
  selected_worker: ManagerWorker | null;
  reason: string;
  verification_required: boolean;
  blocked_reason: string | null;
  blocked_reason_code: MissionBlockedReason | null;
}

export interface GoalAmbiguityAssessment {
  is_ambiguous: boolean;
  reason: string;
  missing_clarifications: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface ManagerDerivation {
  owner_archetype: 'value_investor' | 'unknown';
  persona_signals: string[];
  screening_criteria: string[];
  planned_outputs: string[];
  derived_from_memory_ids: string[];
}

export interface MissionBrief {
  mission_id: string;
  mission_kind: string;
  mission_definition_id: string;
  acceptance_profile_id: string;
  report_contract_id: string;
  required_exact_keys: string[];
  resolved_exact_keys: string[];
  missing_exact_keys: string[];
  conflicting_exact_keys: string[];
  goal: string;
  kind: ManagerDecisionKind;
  selected_worker: ManagerWorker | null;
  success_criteria: string[];
  constraints: string[];
  preferred_format: string;
  planning_hints: string[];
  brain_citations: ConsultCitation[];
  brain_trace_id: string;
  playbook: MissionPlaybook;
  mission_definition: ProvingMissionDefinition;
  report_contract: MissionReportContract;
  input_adapter_decisions: InputAdapterDecision[];
  manager_derivation: ManagerDerivation | null;
  mission_graph: MissionTaskGraph;
  execution_plan: string[];
}

export interface MissionBriefValidation {
  is_complete: boolean;
  completeness_score: number;
  missing_fields: string[];
  warnings: string[];
}

export interface ExecutionRequest {
  mission_id: string;
  mission_kind: string;
  mission_definition_id: string;
  report_contract_id: string;
  task_id: string;
  task_title: string;
  selected_worker: ManagerWorker;
  shell_command: {
    command: string;
    args: string[];
    raw: string;
  } | null;
  prompt: string;
  cwd: string;
  expected_artifacts: Array<VerificationArtifact['type']>;
  context_citations: ConsultCitation[];
  playbook_id: string;
  playbook: MissionPlaybook;
  report_contract: MissionReportContract;
  input_adapter_decisions: InputAdapterDecision[];
  mission_graph: MissionTaskGraph;
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
  requested_worker?: ManagerWorker;
  executed_worker?: ManagerWorker;
  attempted_workers?: ManagerWorker[];
  fallback_from?: ManagerWorker | null;
  fallback_reason?: string | null;
  failure_kind?: 'missing_adapter' | 'worker_unavailable' | 'provider_unavailable' | 'runtime_error' | 'task_failed' | null;
  invocation?: {
    command: string;
    args: string[];
    cwd: string | null;
    exit_code: number | null;
    timed_out: boolean;
    started_at: number;
    completed_at: number;
    transport: 'cli' | 'local_process' | 'manager_owned';
  } | null;
  process_output?: {
    stdout: string;
    stderr: string;
  } | null;
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
  goal_ambiguity: GoalAmbiguityAssessment;
  mission_brief: MissionBrief;
  mission_brief_validation: MissionBriefValidation;
  mission_graph: MissionTaskGraph;
  runtime_bundle: RuntimeSessionBundle | null;
  worker_result: WorkerExecutionResult | null;
  verification_result: CompletionProofState | null;
  brain_writes: BrainWriteRecord[];
  owner_response: string;
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

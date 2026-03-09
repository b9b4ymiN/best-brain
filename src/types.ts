export const MEMORY_TYPES = [
  'Persona',
  'Preferences',
  'Procedures',
  'DomainMemory',
  'RepoMemory',
  'MissionMemory',
  'FailureMemory',
  'WorkingMemory',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const LEARN_MODES = [
  'persona',
  'preference',
  'procedure',
  'mission_outcome',
  'failure_lesson',
  'working_memory',
] as const;

export type LearnMode = (typeof LEARN_MODES)[number];

export const VERIFIED_BY_VALUES = [
  'user',
  'test',
  'verifier',
  'trusted_import',
  'system_inference',
] as const;

export type VerifiedBy = (typeof VERIFIED_BY_VALUES)[number];

export const CONSULT_INTENTS = [
  'persona_guidance',
  'preference_lookup',
  'procedure_lookup',
  'repo_domain_lookup',
  'recent_mission',
  'failure_lesson',
  'working_context',
] as const;

export type ConsultIntent = (typeof CONSULT_INTENTS)[number];

export const MISSION_STATUSES = [
  'draft',
  'in_progress',
  'awaiting_verification',
  'verification_failed',
  'verified_complete',
  'rejected',
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MEMORY_STATUSES = [
  'draft',
  'active',
  'candidate',
  'superseded',
  'archived',
  'expired',
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface VerificationArtifact {
  type: 'file' | 'test' | 'note' | 'url' | 'import' | 'other';
  ref: string;
  description?: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface CompletionProofState {
  mission_id: string;
  status: MissionStatus;
  verification_run_id: string | null;
  evidence_count: number;
  checks_passed: number;
  checks_total: number;
}

export interface ConsultCitation {
  memory_id: string;
  title: string;
  memory_type: MemoryType;
  summary: string;
  source: string;
  verified_by: VerifiedBy | null;
  evidence_ref: VerificationArtifact[];
}

export interface VerificationArtifactRecord {
  id: string;
  mission_id: string | null;
  verification_run_id: string | null;
  memory_id: string | null;
  artifact_type: VerificationArtifact['type'];
  artifact_ref: string;
  artifact_description: string | null;
  source_kind: 'mission_outcome' | 'verification_complete' | 'failure_lesson' | 'memory_reference';
  created_at: number;
}

export interface VerificationArtifactRegistrySnapshot {
  mission_id: string | null;
  artifacts: VerificationArtifactRecord[];
  orphan_count: number;
}

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  summary: string;
  memory_type: MemoryType;
  source: string;
  confidence: number;
  owner: string;
  domain: string | null;
  reusable: boolean;
  supersedes: string | null;
  superseded_by: string | null;
  mission_id: string | null;
  tags: string[];
  status: MemoryStatus;
  verified_by: VerifiedBy | null;
  evidence_ref: VerificationArtifact[];
  version: number;
  review_due_at: number | null;
  stale_after_at: number | null;
  archive_after_at: number | null;
  expires_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface LearnRequest {
  mode: LearnMode;
  title: string;
  content: string;
  source?: string;
  confidence?: number;
  owner?: string;
  domain?: string | null;
  reusable?: boolean;
  mission_id?: string | null;
  tags?: string[];
  supersedes?: string | null;
  verified_by?: VerifiedBy | null;
  evidence_ref?: VerificationArtifact[];
  confirmed_by_user?: boolean;
}

export interface CuratedMemoryInput {
  title: string;
  content: string;
  memory_type: MemoryType;
  source: string;
  confidence?: number;
  owner?: string;
  domain?: string | null;
  reusable?: boolean;
  mission_id?: string | null;
  tags?: string[];
  supersedes?: string | null;
  verified_by?: VerifiedBy | null;
  evidence_ref?: VerificationArtifact[];
  confirmed_by_user?: boolean;
  status?: MemoryStatus;
}

export interface LearnResult {
  accepted: boolean;
  action: 'created' | 'updated' | 'merged' | 'rejected';
  reason: string;
  memory_id: string | null;
  memory_type: MemoryType | null;
  status: MemoryStatus | null;
}

export interface ConsultRequest {
  query: string;
  mission_id?: string | null;
  domain?: string | null;
  limit?: number;
}

export interface RetrievalContribution {
  rule: string;
  delta: number;
}

export interface CandidateTrace {
  memory_id: string;
  title: string;
  memory_type: MemoryType;
  source: string;
  score: number;
  why_included: string[];
  why_excluded: string[];
  ranking_contribution: RetrievalContribution[];
}

export interface RetrievalTraceRecord {
  id: string;
  query: string;
  intent: ConsultIntent;
  mission_id: string | null;
  domain: string | null;
  policy_path: string;
  matched_candidates: CandidateTrace[];
  why_included: Array<{ memory_id: string; why_included: string[] }>;
  why_excluded: Array<{ memory_id: string; why_excluded: string[] }>;
  ranking_contribution: Array<{ memory_id: string; ranking_contribution: RetrievalContribution[]; score: number }>;
  final_selected_set: string[];
  created_at: number;
}

export interface ConsultResponse {
  answer: string;
  memory_ids: string[];
  citations: ConsultCitation[];
  policy_path: string;
  confidence_band: 'low' | 'medium' | 'high';
  followup_actions: string[];
  trace_id: string;
  selected_memories: MemoryRecord[];
}

export interface MissionRecord {
  id: string;
  objective: string;
  domain: string | null;
  status: MissionStatus;
  planning_hints: string[];
  preferred_format: string | null;
  verification_required: boolean;
  latest_outcome_memory_id: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
  rejected_reason: string | null;
}

export interface MissionEventRecord {
  id: string;
  mission_id: string;
  event_type: string;
  actor: string;
  detail: string;
  data: Record<string, unknown>;
  created_at: number;
}

export interface MissionOutcomeInput {
  mission_id: string;
  objective: string;
  result_summary: string;
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
  status?: Exclude<MissionStatus, 'verified_complete' | 'verification_failed'>;
  domain?: string | null;
}

export interface StrictMissionOutcomeInput extends MissionOutcomeInput {
  status: 'in_progress' | 'awaiting_verification';
  domain: string;
}

export interface FailureInput {
  title: string;
  cause: string;
  lesson: string;
  prevention: string;
  mission_id?: string | null;
  domain?: string | null;
  confirmed?: boolean;
  evidence_ref?: VerificationArtifact[];
}

export interface MissionContextBundle {
  mission: MissionRecord | null;
  history: MissionEventRecord[];
  working_memory: MemoryRecord[];
  durable_memory: MemoryRecord[];
  planning_hints: string[];
  preferred_format: string;
  verification_state: CompletionProofState | null;
  verification_artifacts: VerificationArtifactRecord[];
}

export interface VerificationStartInput {
  mission_id: string;
  requested_by?: string;
  checks?: VerificationCheck[];
}

export interface VerificationCompleteInput {
  verification_run_id?: string;
  mission_id?: string;
  status: 'verified_complete' | 'verification_failed' | 'rejected';
  summary?: string;
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
}

export interface RetentionProfile {
  persistence: 'persistent' | 'semi-persistent' | 'ttl';
  reviewEveryDays: number | null;
  staleAfterDays: number | null;
  archiveAfterDays: number | null;
  ttlDays: number | null;
  recentPriority: boolean;
  confirmedOnly: boolean;
  versioned: boolean;
}

export interface RuntimeConfig {
  appName: string;
  owner: string;
  dataDir: string;
  dbPath: string;
  port: number;
}

export interface BrainOpenOptions extends Partial<RuntimeConfig> {
  seedDefaults?: boolean;
}

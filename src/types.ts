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

export const MEMORY_SCOPES = [
  'owner',
  'mission',
  'workspace',
  'domain',
  'cross_mission',
  'session',
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_LAYERS = [
  'principle',
  'pattern',
  'learning',
  'retro',
  'working',
] as const;

export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

export const OWNER_SCOPES = [
  'private',
  'shared_team',
  'shared_domain',
] as const;

export type OwnerScope = (typeof OWNER_SCOPES)[number];

export const WRITTEN_BY_VALUES = [
  'manager',
  'worker',
  'chat',
  'user',
  'system',
] as const;

export type WrittenBy = (typeof WRITTEN_BY_VALUES)[number];

export const PROMOTION_STATES = [
  'none',
  'candidate',
  'reviewed',
  'promoted',
  'rejected',
] as const;

export type PromotionState = (typeof PROMOTION_STATES)[number];

export const LEARN_MODES = [
  'persona',
  'preference',
  'procedure',
  'domain_memory',
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

export const QUERY_PROFILES = [
  'blocked_exact',
  'exact_entity',
  'balanced',
  'semantic_long',
] as const;

export type QueryProfile = (typeof QUERY_PROFILES)[number];

export const RETRIEVAL_MODES = [
  'blocked_exact',
  'fts_only',
  'hybrid',
  'vector_unavailable_fallback',
] as const;

export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

export const CONSULT_CONSUMERS = [
  'chat',
  'manager',
  'worker',
] as const;

export type ConsultConsumer = (typeof CONSULT_CONSUMERS)[number];

export const RETRIEVAL_BUNDLE_PROFILES = [
  'chat_direct',
  'manager_plan',
  'manager_verify',
  'worker_exec',
] as const;

export type RetrievalBundleProfile = (typeof RETRIEVAL_BUNDLE_PROFILES)[number];

export const EXACT_FACT_STATUSES = [
  'resolved',
  'missing',
  'conflict',
] as const;

export type ExactFactStatus = (typeof EXACT_FACT_STATUSES)[number];

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
  memory_scope: MemoryScope;
  memory_layer: MemoryLayer;
  memory_subtype: string;
  summary: string;
  source: string;
  verified_by: VerifiedBy | null;
  evidence_ref: VerificationArtifact[];
  entity_keys: string[];
  entity_aliases: string[];
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
  memory_scope: MemoryScope;
  memory_layer: MemoryLayer;
  memory_subtype: string;
  source: string;
  confidence: number;
  owner: string;
  owner_scope: OwnerScope;
  domain: string | null;
  reusable: boolean;
  supersedes: string | null;
  superseded_by: string | null;
  mission_id: string | null;
  tags: string[];
  entity_keys: string[];
  entity_aliases: string[];
  written_by: WrittenBy;
  retrieval_weight: number;
  promotion_state: PromotionState;
  times_reused: number;
  last_reused_at: number | null;
  success_rate_hint: number | null;
  status: MemoryStatus;
  verified_by: VerifiedBy | null;
  evidence_ref: VerificationArtifact[];
  version: number;
  review_due_at: number | null;
  stale_after_at: number | null;
  archive_after_at: number | null;
  expires_at: number | null;
  archived_at: number | null;
  last_validated_at: number | null;
  valid_until: number | null;
  embedding_status: 'pending' | 'ready' | 'failed' | 'stale' | 'disabled';
  embedding_updated_at: number | null;
  embedding_model_version: string | null;
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
  memory_scope?: MemoryScope;
  memory_layer?: MemoryLayer;
  memory_subtype?: string;
  entity_keys?: string[];
  entity_aliases?: string[];
  written_by?: WrittenBy;
  owner_scope?: OwnerScope;
  retrieval_weight?: number;
  success_rate_hint?: number | null;
  last_validated_at?: number | null;
  valid_until?: number | null;
  status_override?: MemoryStatus;
}

export interface CuratedMemoryInput {
  title: string;
  content: string;
  memory_type: MemoryType;
  memory_scope?: MemoryScope;
  memory_layer?: MemoryLayer;
  memory_subtype?: string;
  source: string;
  confidence?: number;
  owner?: string;
  owner_scope?: OwnerScope;
  domain?: string | null;
  reusable?: boolean;
  mission_id?: string | null;
  tags?: string[];
  entity_keys?: string[];
  entity_aliases?: string[];
  supersedes?: string | null;
  verified_by?: VerifiedBy | null;
  evidence_ref?: VerificationArtifact[];
  confirmed_by_user?: boolean;
  status?: MemoryStatus;
  written_by?: WrittenBy;
  retrieval_weight?: number;
  last_validated_at?: number | null;
  valid_until?: number | null;
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
  consumer?: ConsultConsumer;
  bundle_profile?: RetrievalBundleProfile;
}

export interface RetrievalContribution {
  rule: string;
  delta: number;
}

export interface CandidateTrace {
  memory_id: string;
  title: string;
  memory_type: MemoryType;
  memory_scope: MemoryScope;
  memory_layer: MemoryLayer;
  memory_subtype: string;
  source: string;
  lexical_score: number;
  vector_score: number;
  policy_score: number;
  score: number;
  final_score: number;
  why_included: string[];
  why_excluded: string[];
  ranking_contribution: RetrievalContribution[];
}

export interface SuppressedCandidate {
  memory_id: string;
  title: string;
  reason: string;
}

export interface TensionSignal {
  left_memory_id: string;
  right_memory_id: string;
  signal_type: 'contradiction' | 'staleness' | 'pattern_vs_retro' | 'learning_vs_learning';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  recommended_handling: string;
}

export interface ExactFactResolution {
  key: string;
  status: ExactFactStatus;
  memory_id: string | null;
  reason: string;
}

export interface ManagerRetrievalBundle {
  bundle_profile: RetrievalBundleProfile;
  query_profile: QueryProfile;
  exact_hits: ConsultCitation[];
  identity_bundle: ConsultCitation[];
  approach_bundle: ConsultCitation[];
  proof_bundle: ConsultCitation[];
  working_bundle: ConsultCitation[];
  suppressed_candidates: SuppressedCandidate[];
  tension_signals: TensionSignal[];
  blocked_exact_status: 'resolved' | 'no_exact_match' | 'exact_conflict';
  exact_requirements: ExactFactResolution[];
}

export interface RetrievalTraceRecord {
  id: string;
  query: string;
  intent: ConsultIntent;
  query_profile: QueryProfile;
  mission_id: string | null;
  domain: string | null;
  policy_path: string;
  retrieval_mode: RetrievalMode;
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
  query_profile: QueryProfile;
  retrieval_mode: RetrievalMode;
  confidence_band: 'low' | 'medium' | 'high';
  followup_actions: string[];
  trace_id: string;
  selected_memories: MemoryRecord[];
  retrieval_bundle: ManagerRetrievalBundle | null;
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
  mission_kind?: string | null;
  result_summary: string;
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
  status?: Exclude<MissionStatus, 'verified_complete' | 'verification_failed'>;
  domain?: string | null;
  reused_memory_ids?: string[];
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
  manager_bundle: ManagerRetrievalBundle | null;
}

export interface MemoryQualityMetrics {
  generated_at: number;
  active_memory_count: number;
  stale_candidate_count: number;
  stale_ratio: number;
  unresolved_contradiction_count: number;
  superseded_retrieval_leakage_count: number;
  citation_usefulness_rating: number;
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

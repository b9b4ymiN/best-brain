import type { VerifierChecklistItem, RepairHeuristic } from '../playbooks/types.ts';
import type { VerificationArtifact, VerificationCheck } from '../types.ts';
import type { WorkerId } from '../workers/types.ts';

export const MISSION_INPUT_FAMILIES = [
  'market_data',
  'local_repo_or_runtime',
  'external_api',
] as const;

export type MissionInputFamily = (typeof MISSION_INPUT_FAMILIES)[number];

export const MISSION_BLOCKED_REASONS = [
  'ambiguous_goal',
  'missing_required_input',
  'missing_exact_fact',
  'conflicting_exact_fact',
  'invalid_input',
  'stale_input',
  'no_available_input_adapter',
  'verification_failed',
  'policy_rejection',
] as const;

export type MissionBlockedReason = (typeof MISSION_BLOCKED_REASONS)[number];

export const INPUT_ADAPTER_DECISIONS = [
  'selected',
  'blocked',
  'not_required',
] as const;

export type InputAdapterDecisionKind = (typeof INPUT_ADAPTER_DECISIONS)[number];

export const ACCEPTANCE_RUN_CLASSES = [
  'success',
  'blocked_with_correct_reason',
  'stale_or_invalid_input_blocked',
  'verification_failed_retryable',
] as const;

export type AcceptanceRunClass = (typeof ACCEPTANCE_RUN_CLASSES)[number];

export const ACCEPTANCE_FINAL_STATUSES = [
  'verified_complete',
  'blocked',
  'verification_failed',
  'rejected',
] as const;

export type AcceptanceFinalStatus = (typeof ACCEPTANCE_FINAL_STATUSES)[number];

export const MISSION_REPORT_SECTIONS = [
  'objective',
  'result_summary',
  'evidence_summary',
  'checks_summary',
  'blocked_or_rejected_reason',
  'remaining_risks',
  'next_action',
] as const;

export type MissionReportSection = (typeof MISSION_REPORT_SECTIONS)[number];

export interface MissionInputSpec {
  id: string;
  title: string;
  family: MissionInputFamily;
  required: boolean;
  description: string;
  accepted_source_kinds: string[];
  max_freshness_ms: number | null;
  minimum_confidence: number | null;
}

export interface InputAdapterDefinition {
  id: string;
  title: string;
  family: MissionInputFamily;
  source_kind: string;
  available: boolean;
  freshness_ms: number | null;
  confidence: number;
  blocking_reason: MissionBlockedReason | null;
  provides_inputs: string[];
  notes: string[];
}

export interface InputAdapterCandidateSummary {
  id: string;
  family: MissionInputFamily;
  source_kind: string;
  available: boolean;
  freshness_ms: number | null;
  confidence: number;
  blocking_reason: MissionBlockedReason | null;
}

export interface InputAdapterDecision {
  input_id: string;
  family: MissionInputFamily;
  decision: InputAdapterDecisionKind;
  selected_adapter_id: string | null;
  reason: string;
  blocked_reason: MissionBlockedReason | null;
  considered: InputAdapterCandidateSummary[];
}

export interface MissionAcceptanceSpec {
  id: string;
  acceptance_scenarios: AcceptanceRunClass[];
  success_statuses: AcceptanceFinalStatus[];
  retryable_statuses: AcceptanceFinalStatus[];
  blocked_reasons: MissionBlockedReason[];
  required_evidence_types: Array<VerificationArtifact['type']>;
  required_check_names: string[];
}

export interface MissionReportContract {
  id: string;
  title: string;
  required_sections: MissionReportSection[];
  artifact_kind: 'report';
  requires_verification_evidence: boolean;
}

export interface ProvingMissionDefinition {
  id: string;
  slug: string;
  title: string;
  mission_kind: string;
  goal_template: string;
  required_exact_keys: string[];
  required_inputs: MissionInputSpec[];
  allowed_workers: WorkerId[];
  required_evidence: Array<VerificationArtifact['type']>;
  verifier_checklist: VerifierChecklistItem[];
  repair_heuristics: RepairHeuristic[];
  report_contract: MissionReportContract;
  acceptance: MissionAcceptanceSpec;
}

export interface AcceptanceRunDefinition {
  id: string;
  mission_definition_id: string;
  goal: string;
  run_class: AcceptanceRunClass;
  input_fixtures: Record<string, unknown>;
  expected_path: string[];
  expected_final_status: AcceptanceFinalStatus;
  expected_evidence_types: Array<VerificationArtifact['type']>;
  expected_check_names: string[];
  expected_blocked_reason: MissionBlockedReason | null;
  hidden_human_steps_allowed: boolean;
}

export interface MissionReportDocument {
  contract_id: string;
  artifact_ref: string;
  sections: Record<MissionReportSection, string>;
  verification_status: AcceptanceFinalStatus | 'awaiting_verification';
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
}

export interface AcceptanceRunResult {
  id: string;
  mission_definition_id: string;
  run_id: string;
  passed: boolean;
  actual_final_status: AcceptanceFinalStatus;
  blocked_reason: MissionBlockedReason | null;
  report_contract_completeness: number;
  proof_chain_complete: boolean;
  hidden_human_steps_detected: boolean;
  adapter_selection_correct: boolean;
  notes: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateMissionInputSpec(value: unknown): MissionInputSpec {
  if (!isRecord(value)) {
    throw new Error('mission input spec must be an object');
  }
  if (!MISSION_INPUT_FAMILIES.includes(value.family as MissionInputFamily)) {
    throw new Error('mission input spec family must be supported');
  }

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('mission input spec id is required'); })(),
    title: isNonEmptyString(value.title) ? value.title.trim() : (() => { throw new Error('mission input spec title is required'); })(),
    family: value.family as MissionInputFamily,
    required: typeof value.required === 'boolean' ? value.required : (() => { throw new Error('mission input spec required must be boolean'); })(),
    description: isNonEmptyString(value.description) ? value.description.trim() : (() => { throw new Error('mission input spec description is required'); })(),
    accepted_source_kinds: Array.isArray(value.accepted_source_kinds)
      ? value.accepted_source_kinds.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('mission input spec accepted_source_kinds must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('mission input spec accepted_source_kinds must be an array'); })(),
    max_freshness_ms: value.max_freshness_ms == null
      ? null
      : typeof value.max_freshness_ms === 'number'
        ? value.max_freshness_ms
        : (() => { throw new Error('mission input spec max_freshness_ms must be a number or null'); })(),
    minimum_confidence: value.minimum_confidence == null
      ? null
      : typeof value.minimum_confidence === 'number'
        ? value.minimum_confidence
        : (() => { throw new Error('mission input spec minimum_confidence must be a number or null'); })(),
  };
}

export function validateInputAdapterDefinition(value: unknown): InputAdapterDefinition {
  if (!isRecord(value)) {
    throw new Error('input adapter definition must be an object');
  }
  if (!MISSION_INPUT_FAMILIES.includes(value.family as MissionInputFamily)) {
    throw new Error('input adapter family must be supported');
  }

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('input adapter id is required'); })(),
    title: isNonEmptyString(value.title) ? value.title.trim() : (() => { throw new Error('input adapter title is required'); })(),
    family: value.family as MissionInputFamily,
    source_kind: isNonEmptyString(value.source_kind) ? value.source_kind.trim() : (() => { throw new Error('input adapter source_kind is required'); })(),
    available: typeof value.available === 'boolean' ? value.available : (() => { throw new Error('input adapter available must be boolean'); })(),
    freshness_ms: value.freshness_ms == null
      ? null
      : typeof value.freshness_ms === 'number'
        ? value.freshness_ms
        : (() => { throw new Error('input adapter freshness_ms must be a number or null'); })(),
    confidence: typeof value.confidence === 'number' ? value.confidence : (() => { throw new Error('input adapter confidence must be a number'); })(),
    blocking_reason: value.blocking_reason == null
      ? null
      : MISSION_BLOCKED_REASONS.includes(value.blocking_reason as MissionBlockedReason)
        ? value.blocking_reason as MissionBlockedReason
        : (() => { throw new Error('input adapter blocking_reason must be supported'); })(),
    provides_inputs: Array.isArray(value.provides_inputs)
      ? value.provides_inputs.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('input adapter provides_inputs must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('input adapter provides_inputs must be an array'); })(),
    notes: Array.isArray(value.notes)
      ? value.notes.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('input adapter notes must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('input adapter notes must be an array'); })(),
  };
}

export function validateMissionReportContract(value: unknown): MissionReportContract {
  if (!isRecord(value)) {
    throw new Error('mission report contract must be an object');
  }
  if (value.artifact_kind !== 'report') {
    throw new Error('mission report contract artifact_kind must be report');
  }

  const requiredSections = Array.isArray(value.required_sections)
    ? value.required_sections.map((section) => {
        if (!MISSION_REPORT_SECTIONS.includes(section as MissionReportSection)) {
          throw new Error('mission report contract required_sections must be supported');
        }
        return section as MissionReportSection;
      })
    : (() => { throw new Error('mission report contract required_sections must be an array'); })();

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('mission report contract id is required'); })(),
    title: isNonEmptyString(value.title) ? value.title.trim() : (() => { throw new Error('mission report contract title is required'); })(),
    required_sections: requiredSections,
    artifact_kind: 'report',
    requires_verification_evidence: typeof value.requires_verification_evidence === 'boolean'
      ? value.requires_verification_evidence
      : (() => { throw new Error('mission report contract requires_verification_evidence must be boolean'); })(),
  };
}

export function validateMissionAcceptanceSpec(value: unknown): MissionAcceptanceSpec {
  if (!isRecord(value)) {
    throw new Error('mission acceptance spec must be an object');
  }

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('mission acceptance spec id is required'); })(),
    acceptance_scenarios: Array.isArray(value.acceptance_scenarios)
      ? value.acceptance_scenarios.map((item) => {
          if (!ACCEPTANCE_RUN_CLASSES.includes(item as AcceptanceRunClass)) {
            throw new Error('mission acceptance spec acceptance_scenarios must be supported');
          }
          return item as AcceptanceRunClass;
        })
      : (() => { throw new Error('mission acceptance spec acceptance_scenarios must be an array'); })(),
    success_statuses: Array.isArray(value.success_statuses)
      ? value.success_statuses.map((item) => {
          if (!ACCEPTANCE_FINAL_STATUSES.includes(item as AcceptanceFinalStatus)) {
            throw new Error('mission acceptance spec success_statuses must be supported');
          }
          return item as AcceptanceFinalStatus;
        })
      : (() => { throw new Error('mission acceptance spec success_statuses must be an array'); })(),
    retryable_statuses: Array.isArray(value.retryable_statuses)
      ? value.retryable_statuses.map((item) => {
          if (!ACCEPTANCE_FINAL_STATUSES.includes(item as AcceptanceFinalStatus)) {
            throw new Error('mission acceptance spec retryable_statuses must be supported');
          }
          return item as AcceptanceFinalStatus;
        })
      : (() => { throw new Error('mission acceptance spec retryable_statuses must be an array'); })(),
    blocked_reasons: Array.isArray(value.blocked_reasons)
      ? value.blocked_reasons.map((item) => {
          if (!MISSION_BLOCKED_REASONS.includes(item as MissionBlockedReason)) {
            throw new Error('mission acceptance spec blocked_reasons must be supported');
          }
          return item as MissionBlockedReason;
        })
      : (() => { throw new Error('mission acceptance spec blocked_reasons must be an array'); })(),
    required_evidence_types: Array.isArray(value.required_evidence_types)
      ? value.required_evidence_types as Array<VerificationArtifact['type']>
      : (() => { throw new Error('mission acceptance spec required_evidence_types must be an array'); })(),
    required_check_names: Array.isArray(value.required_check_names)
      ? value.required_check_names.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('mission acceptance spec required_check_names must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('mission acceptance spec required_check_names must be an array'); })(),
  };
}

export function validateProvingMissionDefinition(value: unknown): ProvingMissionDefinition {
  if (!isRecord(value)) {
    throw new Error('proving mission definition must be an object');
  }

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('proving mission definition id is required'); })(),
    slug: isNonEmptyString(value.slug) ? value.slug.trim() : (() => { throw new Error('proving mission definition slug is required'); })(),
    title: isNonEmptyString(value.title) ? value.title.trim() : (() => { throw new Error('proving mission definition title is required'); })(),
    mission_kind: isNonEmptyString(value.mission_kind) ? value.mission_kind.trim() : (() => { throw new Error('proving mission definition mission_kind is required'); })(),
    goal_template: isNonEmptyString(value.goal_template) ? value.goal_template.trim() : (() => { throw new Error('proving mission definition goal_template is required'); })(),
    required_exact_keys: Array.isArray(value.required_exact_keys)
      ? value.required_exact_keys.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('proving mission definition required_exact_keys must contain strings');
          }
          return item.trim();
        })
      : [],
    required_inputs: Array.isArray(value.required_inputs)
      ? value.required_inputs.map(validateMissionInputSpec)
      : (() => { throw new Error('proving mission definition required_inputs must be an array'); })(),
    allowed_workers: Array.isArray(value.allowed_workers)
      ? value.allowed_workers.map((item) => {
          if (typeof item !== 'string') {
            throw new Error('proving mission definition allowed_workers must contain strings');
          }
          return item as WorkerId;
        })
      : (() => { throw new Error('proving mission definition allowed_workers must be an array'); })(),
    required_evidence: Array.isArray(value.required_evidence)
      ? value.required_evidence as Array<VerificationArtifact['type']>
      : (() => { throw new Error('proving mission definition required_evidence must be an array'); })(),
    verifier_checklist: Array.isArray(value.verifier_checklist)
      ? value.verifier_checklist as VerifierChecklistItem[]
      : (() => { throw new Error('proving mission definition verifier_checklist must be an array'); })(),
    repair_heuristics: Array.isArray(value.repair_heuristics)
      ? value.repair_heuristics as RepairHeuristic[]
      : (() => { throw new Error('proving mission definition repair_heuristics must be an array'); })(),
    report_contract: validateMissionReportContract(value.report_contract),
    acceptance: validateMissionAcceptanceSpec(value.acceptance),
  };
}

export function validateAcceptanceRunDefinition(value: unknown): AcceptanceRunDefinition {
  if (!isRecord(value)) {
    throw new Error('acceptance run definition must be an object');
  }

  return {
    id: isNonEmptyString(value.id) ? value.id.trim() : (() => { throw new Error('acceptance run definition id is required'); })(),
    mission_definition_id: isNonEmptyString(value.mission_definition_id) ? value.mission_definition_id.trim() : (() => { throw new Error('acceptance run definition mission_definition_id is required'); })(),
    goal: isNonEmptyString(value.goal) ? value.goal.trim() : (() => { throw new Error('acceptance run definition goal is required'); })(),
    run_class: ACCEPTANCE_RUN_CLASSES.includes(value.run_class as AcceptanceRunClass)
      ? value.run_class as AcceptanceRunClass
      : (() => { throw new Error('acceptance run definition run_class must be supported'); })(),
    input_fixtures: isRecord(value.input_fixtures) ? value.input_fixtures : (() => { throw new Error('acceptance run definition input_fixtures must be an object'); })(),
    expected_path: Array.isArray(value.expected_path)
      ? value.expected_path.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('acceptance run definition expected_path must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('acceptance run definition expected_path must be an array'); })(),
    expected_final_status: ACCEPTANCE_FINAL_STATUSES.includes(value.expected_final_status as AcceptanceFinalStatus)
      ? value.expected_final_status as AcceptanceFinalStatus
      : (() => { throw new Error('acceptance run definition expected_final_status must be supported'); })(),
    expected_evidence_types: Array.isArray(value.expected_evidence_types)
      ? value.expected_evidence_types as Array<VerificationArtifact['type']>
      : (() => { throw new Error('acceptance run definition expected_evidence_types must be an array'); })(),
    expected_check_names: Array.isArray(value.expected_check_names)
      ? value.expected_check_names.map((item) => {
          if (!isNonEmptyString(item)) {
            throw new Error('acceptance run definition expected_check_names must contain strings');
          }
          return item.trim();
        })
      : (() => { throw new Error('acceptance run definition expected_check_names must be an array'); })(),
    expected_blocked_reason: value.expected_blocked_reason == null
      ? null
      : MISSION_BLOCKED_REASONS.includes(value.expected_blocked_reason as MissionBlockedReason)
        ? value.expected_blocked_reason as MissionBlockedReason
        : (() => { throw new Error('acceptance run definition expected_blocked_reason must be supported'); })(),
    hidden_human_steps_allowed: typeof value.hidden_human_steps_allowed === 'boolean'
      ? value.hidden_human_steps_allowed
      : (() => { throw new Error('acceptance run definition hidden_human_steps_allowed must be boolean'); })(),
  };
}

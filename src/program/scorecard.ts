import {
  PROGRAM_ACCEPTANCE_RUN_SET,
  PROGRAM_CONTROL_SURFACE_TARGET,
  PROGRAM_CORE_CONTRACTS,
  PROGRAM_EXECUTION_STYLE,
  PROGRAM_MANAGER_BETA_RAILS,
  PROGRAM_OPERATING_ASSUMPTIONS,
  PROGRAM_PHASES,
  PROGRAM_PROVING_MISSION,
  PROGRAM_SUCCESS_BAR,
} from './contracts.ts';

export type ScorecardMetricStatus = 'pass' | 'fail' | 'unavailable';
export type ProgramPhaseStatus = 'pass' | 'partial' | 'fail';

export interface ProgramContractSnapshot {
  docs_locked: boolean;
  frozen_contracts: Record<(typeof PROGRAM_CORE_CONTRACTS)[number], boolean>;
  example_libraries_refreshed: boolean;
  acceptance_run_set_defined: boolean;
  no_hidden_human_loop_assumption_locked: boolean;
}

export interface ConsultEvalSummaryInput {
  routing_accuracy: number;
  top_k_relevance: number;
  citation_completeness: number;
  trace_presence: number;
  mission_proof_pass_rate: number;
  orphan_evidence_count: number;
  manual_medians: {
    usefulness: number;
    groundedness: number;
    persona_alignment: number;
    actionability: number;
  };
}

export interface SeedComparisonSummaryInput {
  empty_hit_rate: number;
  seeded_hit_rate: number;
  seeded_context_coverage: number;
  seeded_gain: number;
}

export interface BootstrapSmokeSummaryInput {
  first_run_db_init_success: boolean;
  startup_time_ms: number;
}

export interface ManagerProofInput {
  thin_manager_pass: boolean;
  claude_primary_pass: boolean;
  codex_primary_pass: boolean;
  mission_brief_completeness?: number;
  goal_ambiguity_detection?: boolean;
  false_complete_count?: number;
  blocked_with_correct_reason_rate?: number;
}

export interface ProgramScorecardInput {
  generated_at: string;
  contract_snapshot: ProgramContractSnapshot;
  consult_eval?: ConsultEvalSummaryInput;
  seed_comparison?: SeedComparisonSummaryInput;
  bootstrap_smoke?: BootstrapSmokeSummaryInput;
  captured_bootstrap_proofs?: string[];
  manager_proof?: ManagerProofInput;
}

export interface ProgramMetricValue {
  id: string;
  label: string;
  category: 'north_star' | 'brain' | 'manager' | 'runtime' | 'console';
  target: string;
  actual: number | string | boolean | null;
  status: ScorecardMetricStatus;
  note: string;
}

export interface ProgramPhaseReadiness {
  phase: (typeof PROGRAM_PHASES)[number];
  status: ProgramPhaseStatus;
  note: string;
}

export interface ProgramScorecard {
  generated_at: string;
  success_bar: typeof PROGRAM_SUCCESS_BAR;
  proving_mission: typeof PROGRAM_PROVING_MISSION;
  acceptance_run_set: typeof PROGRAM_ACCEPTANCE_RUN_SET;
  control_surface_target: typeof PROGRAM_CONTROL_SURFACE_TARGET;
  execution_style: typeof PROGRAM_EXECUTION_STYLE;
  manager_beta_rails: typeof PROGRAM_MANAGER_BETA_RAILS;
  operating_assumptions: typeof PROGRAM_OPERATING_ASSUMPTIONS;
  metric_values: ProgramMetricValue[];
  phase_readiness: ProgramPhaseReadiness[];
}

function percentageMetric(
  id: string,
  label: string,
  category: ProgramMetricValue['category'],
  actual: number | null | undefined,
  threshold: number,
  note: string,
): ProgramMetricValue {
  if (typeof actual !== 'number') {
    return {
      id,
      label,
      category,
      target: `>= ${threshold}`,
      actual: null,
      status: 'unavailable',
      note,
    };
  }

  return {
    id,
    label,
    category,
    target: `>= ${threshold}`,
    actual,
    status: actual >= threshold ? 'pass' : 'fail',
    note,
  };
}

function equalityMetric(
  id: string,
  label: string,
  category: ProgramMetricValue['category'],
  actual: number | boolean | null | undefined,
  target: number | boolean,
  note: string,
): ProgramMetricValue {
  if (actual == null) {
    return {
      id,
      label,
      category,
      target: `= ${String(target)}`,
      actual: null,
      status: 'unavailable',
      note,
    };
  }

  return {
    id,
    label,
    category,
    target: `= ${String(target)}`,
    actual,
    status: actual === target ? 'pass' : 'fail',
    note,
  };
}

export function buildProgramScorecard(input: ProgramScorecardInput): ProgramScorecard {
  const metricValues: ProgramMetricValue[] = [];

  metricValues.push(percentageMetric(
    'mission_brief_completeness',
    'Mission brief completeness',
    'manager',
    input.manager_proof?.mission_brief_completeness,
    100,
    'Must come from the MissionBrief completeness validator.',
  ));
  metricValues.push(equalityMetric(
    'goal_ambiguity_detector',
    'Goal ambiguity detector enabled',
    'manager',
    input.manager_proof?.goal_ambiguity_detection,
    true,
    'Unavailable until manager proof capture records ambiguous-goal handling.',
  ));
  metricValues.push(equalityMetric(
    'false_complete_count',
    'False-complete count',
    'manager',
    input.manager_proof?.false_complete_count,
    0,
    'Counts missions that looked complete but failed proof or later validation.',
  ));
  metricValues.push(percentageMetric(
    'blocked_with_correct_reason_rate',
    'Blocked-with-correct-reason rate',
    'manager',
    input.manager_proof?.blocked_with_correct_reason_rate,
    95,
    'Measures whether the manager blocks with an explicitly correct reason instead of drifting or failing open.',
  ));
  metricValues.push(equalityMetric(
    'acceptance_run_set_defined',
    'Acceptance run set defined',
    'north_star',
    input.contract_snapshot.acceptance_run_set_defined,
    true,
    'The proving mission must have a named acceptance run set before success claims count.',
  ));
  metricValues.push(equalityMetric(
    'no_hidden_human_loop_assumption',
    'No hidden human-in-the-loop steps locked',
    'north_star',
    input.contract_snapshot.no_hidden_human_loop_assumption_locked,
    true,
    'Acceptance runs must not depend on undocumented manual rescue steps.',
  ));
  metricValues.push(percentageMetric(
    'routing_accuracy',
    'Routing accuracy',
    'brain',
    input.consult_eval?.routing_accuracy,
    90,
    'Derived from consult eval summary.',
  ));
  metricValues.push(percentageMetric(
    'citation_completeness',
    'Citation completeness',
    'brain',
    input.consult_eval?.citation_completeness,
    95,
    'Derived from consult eval summary.',
  ));
  metricValues.push(percentageMetric(
    'persona_alignment',
    'Persona alignment median',
    'brain',
    input.consult_eval?.manual_medians.persona_alignment,
    4,
    'Manual consult-eval median.',
  ));
  metricValues.push(percentageMetric(
    'usefulness',
    'Owner usefulness median',
    'north_star',
    input.consult_eval?.manual_medians.usefulness,
    4,
    'Manual consult-eval median is the current proxy for owner usefulness.',
  ));
  metricValues.push(percentageMetric(
    'memory_reuse_gain',
    'Seeded context gain',
    'brain',
    input.seed_comparison?.seeded_gain,
    70,
    'Current proxy for memory reuse readiness before repeated mission runs exist.',
  ));
  metricValues.push(equalityMetric(
    'orphan_evidence_count',
    'Orphan evidence count',
    'runtime',
    input.consult_eval?.orphan_evidence_count,
    0,
    'Should remain zero once artifact lineage is healthy.',
  ));
  metricValues.push(equalityMetric(
    'first_run_db_init_success',
    'First-run DB init success',
    'runtime',
    input.bootstrap_smoke?.first_run_db_init_success,
    true,
    'Current local bootstrap proof.',
  ));
  metricValues.push(equalityMetric(
    'windows_bootstrap_proof',
    'Windows bootstrap proof captured',
    'runtime',
    input.captured_bootstrap_proofs?.includes('windows') ?? null,
    true,
    'macOS and Linux proofs stay pending until captured.',
  ));
  metricValues.push(equalityMetric(
    'manager_thin_path',
    'Thin manager path pass',
    'manager',
    input.manager_proof?.thin_manager_pass,
    true,
    'Derived from manager smoke capture.',
  ));
  metricValues.push(equalityMetric(
    'manager_claude_path',
    'Claude primary worker path pass',
    'manager',
    input.manager_proof?.claude_primary_pass,
    true,
    'Derived from manager smoke capture.',
  ));
  metricValues.push(equalityMetric(
    'manager_codex_path',
    'Codex primary worker path pass',
    'manager',
    input.manager_proof?.codex_primary_pass,
    true,
    'Derived from manager smoke capture.',
  ));
  metricValues.push(equalityMetric(
    'mission_console_visibility',
    'Mission console visibility completeness',
    'console',
    null,
    true,
    'Unavailable until the control room exists.',
  ));

  const phase0ContractsFrozen = input.contract_snapshot.docs_locked
    && input.contract_snapshot.example_libraries_refreshed
    && input.contract_snapshot.acceptance_run_set_defined
    && input.contract_snapshot.no_hidden_human_loop_assumption_locked
    && Object.values(input.contract_snapshot.frozen_contracts).every(Boolean);
  const managerPathsReady = input.manager_proof != null
    && input.manager_proof.thin_manager_pass
    && input.manager_proof.claude_primary_pass
    && input.manager_proof.codex_primary_pass;
  const managerRailsMeasured = input.manager_proof?.mission_brief_completeness === 100
    && input.manager_proof.goal_ambiguity_detection === true
    && input.manager_proof.false_complete_count === 0
    && (input.manager_proof.blocked_with_correct_reason_rate ?? 0) >= 95;
  const runtimeEvidenceReady = input.bootstrap_smoke?.first_run_db_init_success === true
    && input.consult_eval?.orphan_evidence_count === 0;

  const phaseReadiness: ProgramPhaseReadiness[] = [
    {
      phase: 'Phase0_ProgramLock',
      status: phase0ContractsFrozen ? 'pass' : 'fail',
      note: phase0ContractsFrozen ? 'Docs, examples, and frozen contracts exist.' : 'Program-level contracts or docs are still incomplete.',
    },
    {
      phase: 'Phase1_ManagerBeta',
      status: managerPathsReady ? 'partial' : 'fail',
      note: managerPathsReady
        ? managerRailsMeasured
          ? 'Manager paths pass and core safety rails are measured, but mission graph and playbook execution are still scaffolding-level.'
          : 'Manager alpha proves the core one-worker path, but MissionBrief validation and ambiguity detection still need explicit proof coverage.'
        : 'Manager proof capture is incomplete.',
    },
    {
      phase: 'Phase2_WorkerFabricRuntimeSpine',
      status: runtimeEvidenceReady ? 'partial' : 'fail',
      note: runtimeEvidenceReady
        ? 'Artifact lineage and bootstrap proof exist, but runtime session/checkpoint implementation is still contract-level.'
        : 'Runtime proof is incomplete.',
    },
    {
      phase: 'Phase3_ThaiEquitiesStockScanner',
      status: 'fail',
      note: 'No proving mission vertical slice exists yet.',
    },
    {
      phase: 'Phase4_FullMissionConsole',
      status: 'fail',
      note: 'Console contracts exist, but no real control-room implementation exists yet.',
    },
    {
      phase: 'Phase5_Repeatability',
      status: 'fail',
      note: 'Repeatable one-mission proof requires the stock-scanner vertical slice first.',
    },
  ];

  return {
    generated_at: input.generated_at,
    success_bar: PROGRAM_SUCCESS_BAR,
    proving_mission: PROGRAM_PROVING_MISSION,
    acceptance_run_set: PROGRAM_ACCEPTANCE_RUN_SET,
    control_surface_target: PROGRAM_CONTROL_SURFACE_TARGET,
    execution_style: PROGRAM_EXECUTION_STYLE,
    manager_beta_rails: PROGRAM_MANAGER_BETA_RAILS,
    operating_assumptions: PROGRAM_OPERATING_ASSUMPTIONS,
    metric_values: metricValues,
    phase_readiness: phaseReadiness,
  };
}

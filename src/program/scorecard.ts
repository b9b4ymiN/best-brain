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
  codex_output_excerpt?: string;
  shell_primary_pass?: boolean;
  mission_brief_completeness?: number;
  goal_ambiguity_detection?: boolean;
  false_complete_count?: number;
  blocked_with_correct_reason_rate?: number;
  worker_invocation_pass_rate?: number;
  artifact_lineage_completeness?: number;
  verifier_worker_path?: boolean;
  runtime_session_capture?: boolean;
  checkpoint_capture?: boolean;
  checkpoint_restore_capture?: boolean;
  checkpoint_restore_breadth?: number;
}

export interface ProvingHarnessSummaryInput {
  proving_mission_definition_valid: boolean;
  supported_definition_count: number;
  generic_acceptance_harness_pass_rate: number;
  blocked_reason_accuracy: number;
  report_contract_completeness: number;
  adapter_selection_correctness: number;
  mission_demo_without_hidden_steps: boolean;
}

export interface Phase4ProofInput {
  success_run_pass: boolean;
  blocked_with_correct_reason: boolean;
  retryable_verification_failed: boolean;
  final_report_artifact_present: boolean;
  market_data_evidence_present: boolean;
  latest_verified_mission_reused: boolean;
}

export interface ActualMissionProofInput {
  single_goal_manager_led_pass: boolean;
  persona_memory_applied: boolean;
  manager_generated_plan: boolean;
  worker_control_end_to_end: boolean;
  no_demo_shortcut_path: boolean;
}

export interface Phase6RepeatabilityProofInput {
  repeated_run_count: number;
  repeatable_verified_complete_rate: number;
  memory_reuse_citation_rate: number;
  retry_recovery_rate: number;
  blocked_with_correct_reason_rate: number;
  false_complete_count: number;
  no_hidden_human_steps: boolean;
}

export interface ControlRoomProofInput {
  control_room_launch_pass: boolean;
  mission_console_visibility_completeness: number;
  control_room_retry_pass: boolean;
  control_room_review_audit_pass: boolean;
  kernel_rail_bypass_detected: boolean;
}

export interface ProgramScorecardInput {
  generated_at: string;
  contract_snapshot: ProgramContractSnapshot;
  consult_eval?: ConsultEvalSummaryInput;
  seed_comparison?: SeedComparisonSummaryInput;
  bootstrap_smoke?: BootstrapSmokeSummaryInput;
  captured_bootstrap_proofs?: string[];
  manager_proof?: ManagerProofInput;
  proving_harness?: ProvingHarnessSummaryInput;
  phase4_proof?: Phase4ProofInput;
  actual_mission_proof?: ActualMissionProofInput;
  phase6_repeatability_proof?: Phase6RepeatabilityProofInput;
  control_room_proof?: ControlRoomProofInput;
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
  const bootstrapProofs = new Set((input.captured_bootstrap_proofs ?? []).map((item) => item.toLowerCase()));
  const hasWindowsBootstrapProof = bootstrapProofs.has('windows') || bootstrapProofs.has('win32');
  const hasMacOsBootstrapProof = bootstrapProofs.has('macos') || bootstrapProofs.has('darwin') || bootstrapProofs.has('mac');
  const hasLinuxBootstrapProof = bootstrapProofs.has('linux');
  const bootstrapMatrixCoverage = (
    [hasWindowsBootstrapProof, hasMacOsBootstrapProof, hasLinuxBootstrapProof]
      .filter(Boolean)
      .length / 3
  ) * 100;

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
  metricValues.push(percentageMetric(
    'worker_invocation_pass_rate',
    'Worker invocation pass rate',
    'runtime',
    input.manager_proof?.worker_invocation_pass_rate,
    95,
    'Covers the current Phase 2 primary workers across smoke runs.',
  ));
  metricValues.push(percentageMetric(
    'artifact_lineage_completeness',
    'Artifact lineage completeness',
    'runtime',
    input.manager_proof?.artifact_lineage_completeness,
    100,
    'Every worker-task artifact ref should resolve to a runtime artifact record.',
  ));
  metricValues.push(equalityMetric(
    'verifier_worker_path',
    'Verifier worker path captured',
    'runtime',
    input.manager_proof?.verifier_worker_path,
    true,
    'Execution runs should record the verifier as a first-class worker task.',
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
    hasWindowsBootstrapProof,
    true,
    'Windows bootstrap proof should come from a real smoke artifact.',
  ));
  metricValues.push(equalityMetric(
    'macos_bootstrap_proof',
    'macOS bootstrap proof captured',
    'runtime',
    hasMacOsBootstrapProof,
    true,
    'macOS bootstrap proof should come from a real smoke artifact.',
  ));
  metricValues.push(equalityMetric(
    'linux_bootstrap_proof',
    'Linux bootstrap proof captured',
    'runtime',
    hasLinuxBootstrapProof,
    true,
    'Linux bootstrap proof should come from a real smoke artifact.',
  ));
  metricValues.push(percentageMetric(
    'bootstrap_matrix_coverage',
    'Bootstrap proof matrix coverage',
    'runtime',
    bootstrapMatrixCoverage,
    100,
    'All three OS proofs (windows, macOS, linux) must be captured before platform coverage is considered complete.',
  ));
  metricValues.push(equalityMetric(
    'bootstrap_matrix_ready',
    'Bootstrap matrix ready',
    'runtime',
    hasWindowsBootstrapProof && hasMacOsBootstrapProof && hasLinuxBootstrapProof,
    true,
    'The bootstrap proof matrix is complete only when all three OS artifacts are present.',
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
    'manager_shell_path',
    'Shell primary worker path pass',
    'runtime',
    input.manager_proof?.shell_primary_pass,
    true,
    'Derived from manager shell smoke capture.',
  ));
  metricValues.push(equalityMetric(
    'runtime_session_capture',
    'Runtime session captured on manager runs',
    'runtime',
    input.manager_proof?.runtime_session_capture,
    true,
    'Manager proof should show a completed runtime session bundle on successful live runs.',
  ));
  metricValues.push(equalityMetric(
    'checkpoint_capture',
    'Runtime checkpoints captured on execution runs',
    'runtime',
    input.manager_proof?.checkpoint_capture,
    true,
    'Execution runs should create retry-safe checkpoints after primary work and verification.',
  ));
  metricValues.push(equalityMetric(
    'checkpoint_restore_capture',
    'Runtime checkpoint restore captured',
    'runtime',
    input.manager_proof?.checkpoint_restore_capture,
    true,
    'A failing mission should prove that runtime state can be restored from a checkpoint.',
  ));
  metricValues.push(percentageMetric(
    'checkpoint_restore_breadth',
    'Checkpoint restore breadth',
    'runtime',
    input.manager_proof?.checkpoint_restore_breadth,
    100,
    'Restore should be proven on more than one worker path, not only shell.',
  ));
  metricValues.push(equalityMetric(
    'mission_console_visibility',
    'Mission console visibility completeness',
    'console',
    input.control_room_proof?.mission_console_visibility_completeness,
    100,
    'The control-room proof should show that the mission console exposes graph, timeline, workers, artifacts, verdict, and final report state.',
  ));
  metricValues.push(equalityMetric(
    'control_room_launch_path',
    'Control-room launch path pass',
    'console',
    input.control_room_proof?.control_room_launch_pass,
    true,
    'A mission must be launchable from the control room without bypassing manager/runtime rails.',
  ));
  metricValues.push(equalityMetric(
    'control_room_retry_path',
    'Control-room retry path pass',
    'console',
    input.control_room_proof?.control_room_retry_pass,
    true,
    'A retry from the control room should rerun the mission through the manager rather than mutating state in place.',
  ));
  metricValues.push(equalityMetric(
    'control_room_review_audit',
    'Control-room operator review audit pass',
    'console',
    input.control_room_proof?.control_room_review_audit_pass,
    true,
    'Approve/reject controls must be recorded as operator review, not hidden state changes.',
  ));
  metricValues.push(equalityMetric(
    'control_room_kernel_rail_integrity',
    'Control-room kernel rail integrity',
    'console',
    typeof input.control_room_proof?.kernel_rail_bypass_detected === 'boolean'
      ? !input.control_room_proof.kernel_rail_bypass_detected
      : null,
    true,
    'The control room must not bypass manager kernel policy when launching, retrying, or reviewing a mission.',
  ));
  metricValues.push(equalityMetric(
    'proving_mission_definition_valid',
    'Proving mission definitions validate',
    'manager',
    input.proving_harness?.proving_mission_definition_valid,
    true,
    'Phase 3 requires valid proving mission definitions before a proving mission can run.',
  ));
  metricValues.push(percentageMetric(
    'generic_acceptance_harness_pass_rate',
    'Generic acceptance harness pass rate',
    'manager',
    input.proving_harness?.generic_acceptance_harness_pass_rate,
    90,
    'Phase 3 harness must pass across success, blocked, stale-input, and retryable failure runs.',
  ));
  metricValues.push(percentageMetric(
    'blocked_reason_accuracy_phase3',
    'Phase 3 blocked reason accuracy',
    'manager',
    input.proving_harness?.blocked_reason_accuracy,
    95,
    'Blocked proving missions must fail with the correct explicit reason.',
  ));
  metricValues.push(percentageMetric(
    'report_contract_completeness',
    'Report contract completeness',
    'manager',
    input.proving_harness?.report_contract_completeness,
    100,
    'Passing proving-mission runs must emit a complete final report contract.',
  ));
  metricValues.push(percentageMetric(
    'adapter_selection_correctness',
    'Adapter selection correctness',
    'runtime',
    input.proving_harness?.adapter_selection_correctness,
    95,
    'Input/data adapters must be selected or blocked through policy rather than hidden manual steps.',
  ));
  metricValues.push(equalityMetric(
    'mission_demo_without_hidden_steps',
    'Mission demos run without hidden steps',
    'north_star',
    input.proving_harness?.mission_demo_without_hidden_steps,
    true,
    'Proving missions must not require undocumented human rescue steps.',
  ));
  metricValues.push(equalityMetric(
    'phase4_demo_success',
    'Demo / acceptance mission success run pass',
    'north_star',
    input.phase4_proof?.success_run_pass,
    true,
    'The first demo / acceptance mission must complete to verified_complete on the controlled demo path.',
  ));
  metricValues.push(equalityMetric(
    'phase4_demo_blocked_reason',
    'Demo / acceptance mission blocked path is correct',
    'manager',
    input.phase4_proof?.blocked_with_correct_reason,
    true,
    'Unavailable or stale data must block with the correct explicit reason.',
  ));
  metricValues.push(equalityMetric(
    'phase4_demo_retryable',
    'Demo / acceptance mission retryable failure path works',
    'manager',
    input.phase4_proof?.retryable_verification_failed,
    true,
    'Incomplete proof should fail verification and remain retryable.',
  ));
  metricValues.push(equalityMetric(
    'phase4_final_report_artifact',
    'Demo / acceptance mission final report artifact exists',
    'runtime',
    input.phase4_proof?.final_report_artifact_present,
    true,
    'The first demo / acceptance mission must emit a final report artifact after verification resolves.',
  ));
  metricValues.push(equalityMetric(
    'phase4_market_data_evidence',
    'Demo / acceptance mission market-data evidence exists',
    'runtime',
    input.phase4_proof?.market_data_evidence_present,
    true,
    'The first demo / acceptance mission must carry machine-readable market-data evidence.',
  ));
  metricValues.push(equalityMetric(
    'phase4_memory_reuse',
    'Demo / acceptance mission reuse appears in follow-up context',
    'brain',
    input.phase4_proof?.latest_verified_mission_reused,
    true,
    'The follow-up demo / acceptance mission brief should reuse the latest verified stock-scanner mission.',
  ));
  metricValues.push(equalityMetric(
    'actual_manager_single_goal_pass',
    'Actual manager-led mission starts from one user goal',
    'north_star',
    input.actual_mission_proof?.single_goal_manager_led_pass,
    true,
    'The target concept requires the owner to state only the goal, then the manager continues the mission flow itself.',
  ));
  metricValues.push(equalityMetric(
    'actual_manager_persona_memory_applied',
    'Actual manager-led mission applies persona memory',
    'brain',
    input.actual_mission_proof?.persona_memory_applied,
    true,
    'The manager must consult persona and memory to derive what matters, not wait for the user to spell out the screening checklist.',
  ));
  metricValues.push(equalityMetric(
    'actual_manager_generated_plan',
    'Actual manager-led mission generates its own plan',
    'manager',
    input.actual_mission_proof?.manager_generated_plan,
    true,
    'The manager must derive the mission brief, criteria, and task graph from memory and context.',
  ));
  metricValues.push(equalityMetric(
    'actual_manager_worker_control',
    'Actual manager-led mission controls workers end-to-end',
    'manager',
    input.actual_mission_proof?.worker_control_end_to_end,
    true,
    'The manager must control worker execution, verification, and repair loops instead of delegating to a demo shortcut.',
  ));
  metricValues.push(equalityMetric(
    'actual_manager_no_demo_shortcut',
    'Actual manager-led mission avoids demo shortcut paths',
    'manager',
    input.actual_mission_proof?.no_demo_shortcut_path,
    true,
    'The actual mission path must not rely on proving-mission helper runners as the primary execution path.',
  ));
  metricValues.push(percentageMetric(
    'repeatability_verified_complete_rate',
    'Repeatability verified-complete rate',
    'north_star',
    input.phase6_repeatability_proof?.repeatable_verified_complete_rate,
    80,
    'Repeated actual manager-led runs should still reach verified_complete at the target rate.',
  ));
  metricValues.push(percentageMetric(
    'repeatability_memory_reuse_citation_rate',
    'Repeatability memory-reuse citation rate',
    'brain',
    input.phase6_repeatability_proof?.memory_reuse_citation_rate,
    70,
    'Follow-up actual runs should cite prior verified mission memory often enough to prove reuse.',
  ));
  metricValues.push(percentageMetric(
    'repeatability_retry_recovery_rate',
    'Repeatability retry-recovery rate',
    'manager',
    input.phase6_repeatability_proof?.retry_recovery_rate,
    60,
    'Verification-failed actual missions should recover to verified_complete at the target rate.',
  ));
  metricValues.push(percentageMetric(
    'repeatability_blocked_with_correct_reason_rate',
    'Repeatability blocked-with-correct-reason rate',
    'manager',
    input.phase6_repeatability_proof?.blocked_with_correct_reason_rate,
    95,
    'Repeated actual runs must still fail closed with the correct explicit reason when blocked.',
  ));
  metricValues.push(equalityMetric(
    'repeatability_false_complete_count',
    'Repeatability false-complete count',
    'manager',
    input.phase6_repeatability_proof?.false_complete_count,
    0,
    'Repeatability proof must not introduce missions that look complete without a valid final proof chain.',
  ));
  metricValues.push(equalityMetric(
    'repeatability_no_hidden_human_steps',
    'Repeatability runs stay free of hidden human rescue',
    'north_star',
    input.phase6_repeatability_proof?.no_hidden_human_steps,
    true,
    'Repeatability claims must still avoid undocumented human rescue between actual mission runs.',
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
  const codexProviderLimited = (input.manager_proof?.codex_output_excerpt ?? '').toLowerCase().includes('usage limit');
  const managerRailsMeasured = input.manager_proof?.mission_brief_completeness === 100
    && input.manager_proof.goal_ambiguity_detection === true
    && input.manager_proof.false_complete_count === 0
    && (input.manager_proof.blocked_with_correct_reason_rate ?? 0) >= 95;
  const runtimeEvidenceReady = input.bootstrap_smoke?.first_run_db_init_success === true
    && hasWindowsBootstrapProof
    && hasMacOsBootstrapProof
    && hasLinuxBootstrapProof
    && input.consult_eval?.orphan_evidence_count === 0
    && input.manager_proof?.shell_primary_pass === true
    && (input.manager_proof?.worker_invocation_pass_rate ?? 0) >= 95
    && input.manager_proof?.verifier_worker_path === true
    && input.manager_proof?.artifact_lineage_completeness === 100
    && input.manager_proof?.runtime_session_capture === true
    && input.manager_proof?.checkpoint_capture === true
    && input.manager_proof?.checkpoint_restore_capture === true
    && input.manager_proof?.checkpoint_restore_breadth === 100;
  const phase3FrameworkReady = input.proving_harness?.proving_mission_definition_valid === true
    && (input.proving_harness?.supported_definition_count ?? 0) >= 2
    && (input.proving_harness?.generic_acceptance_harness_pass_rate ?? 0) >= 90
    && (input.proving_harness?.blocked_reason_accuracy ?? 0) >= 95
    && (input.proving_harness?.report_contract_completeness ?? 0) === 100
    && (input.proving_harness?.adapter_selection_correctness ?? 0) >= 95
    && input.proving_harness?.mission_demo_without_hidden_steps === true;
  const phase4Ready = input.phase4_proof?.success_run_pass === true
    && input.phase4_proof?.blocked_with_correct_reason === true
    && input.phase4_proof?.retryable_verification_failed === true
    && input.phase4_proof?.final_report_artifact_present === true
    && input.phase4_proof?.market_data_evidence_present === true
    && input.phase4_proof?.latest_verified_mission_reused === true;
  const phase5ActualMissionReady = input.actual_mission_proof?.single_goal_manager_led_pass === true
    && input.actual_mission_proof?.persona_memory_applied === true
    && input.actual_mission_proof?.manager_generated_plan === true
    && input.actual_mission_proof?.worker_control_end_to_end === true
    && input.actual_mission_proof?.no_demo_shortcut_path === true;
  const phase6RepeatabilityReady = phase5ActualMissionReady
    && (input.phase6_repeatability_proof?.repeated_run_count ?? 0) >= 4
    && (input.phase6_repeatability_proof?.repeatable_verified_complete_rate ?? 0) >= 80
    && (input.phase6_repeatability_proof?.memory_reuse_citation_rate ?? 0) >= 70
    && (input.phase6_repeatability_proof?.retry_recovery_rate ?? 0) >= 60
    && (input.phase6_repeatability_proof?.blocked_with_correct_reason_rate ?? 0) >= 95
    && input.phase6_repeatability_proof?.false_complete_count === 0
    && input.phase6_repeatability_proof?.no_hidden_human_steps === true;

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
          ? 'Manager paths pass, core safety rails are measured, and mission graph plus playbook execution are wired into the live path, but multi-step decomposition is still thin.'
          : 'Manager alpha proves the core one-worker path, but MissionBrief validation and ambiguity detection still need explicit proof coverage.'
        : codexProviderLimited
          ? 'Manager proof is blocked by an external Codex usage-limit condition on this machine; thin-manager, Claude, and Shell paths still pass.'
          : 'Manager proof capture is incomplete.',
    },
    {
      phase: 'Phase2_WorkerFabricRuntimeSpine',
      status: runtimeEvidenceReady ? 'pass' : 'fail',
      note: runtimeEvidenceReady
        ? 'Worker fabric is formalized across Claude, Codex, Shell, and Verifier, with artifact lineage and multi-path checkpoint recovery proven in local evidence.'
        : codexProviderLimited
          ? 'Runtime proof is locally blocked by a Codex provider usage-limit condition; Shell, Claude, verifier, artifact lineage, and checkpoint recovery still pass.'
          : 'Runtime proof is incomplete. Capture windows, macOS, and linux bootstrap proofs to close cross-platform readiness.',
    },
    {
      phase: 'Phase3_ProvingMissionFramework',
      status: phase3FrameworkReady ? 'pass' : 'fail',
      note: phase3FrameworkReady
        ? 'Generic proving mission definitions, acceptance harness runs, adapter selection, and report contracts are all proven without stock-specific manager logic.'
        : 'Proving mission framework contracts or acceptance harness evidence are still incomplete.',
    },
    {
      phase: 'Phase4_DemoAcceptanceMission',
      status: phase4Ready ? 'pass' : 'fail',
      note: phase4Ready
        ? 'The Thai equities daily stock-scanner demo mission is proven as an acceptance harness with success, blocked, retryable, and memory-reuse evidence.'
        : 'The first demo / acceptance mission has not been implemented or proven yet.',
    },
    {
      phase: 'Phase5_ActualManagerLedMission',
      status: phase5ActualMissionReady ? 'pass' : 'fail',
      note: phase5ActualMissionReady
        ? 'The actual manager-led mission path can start from one goal, apply persona memory, generate its own plan, and control workers without a demo shortcut.'
        : 'The actual manager-led mission path is not implemented yet. The next bar is: user states one goal, the brain recalls persona and memory, the manager derives the criteria and plan, controls workers, verifies, and returns the final answer without a demo shortcut.',
    },
    {
      phase: 'Phase6_Repeatability',
      status: phase6RepeatabilityReady ? 'pass' : 'fail',
      note: phase6RepeatabilityReady
        ? 'Repeated actual manager-led runs now prove success, blocked, retry-recovery, and memory reuse over the acceptance set without false completes.'
        : phase5ActualMissionReady
          ? 'Repeatable one-mission proof still requires repeated actual manager-led runs over the acceptance set.'
          : 'Repeatability is deferred until the actual manager-led mission path exists.',
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

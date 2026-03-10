import { describe, expect, test } from 'bun:test';
import { buildProgramScorecard } from '../src/program/scorecard.ts';

describe('program scorecard', () => {
  test('builds a program scorecard from current evidence families', () => {
    const scorecard = buildProgramScorecard({
      generated_at: '2026-03-10T00:00:00.000Z',
      contract_snapshot: {
        docs_locked: true,
        frozen_contracts: {
          brain: true,
          manager: true,
          worker: true,
          runtime: true,
          console: true,
          market_data: true,
        },
        example_libraries_refreshed: true,
        acceptance_run_set_defined: true,
        no_hidden_human_loop_assumption_locked: true,
      },
      consult_eval: {
        routing_accuracy: 100,
        top_k_relevance: 100,
        citation_completeness: 100,
        trace_presence: 100,
        mission_proof_pass_rate: 100,
        orphan_evidence_count: 0,
        manual_medians: {
          usefulness: 4,
          groundedness: 5,
          persona_alignment: 4,
          actionability: 4,
        },
      },
      seed_comparison: {
        empty_hit_rate: 0,
        seeded_hit_rate: 100,
        seeded_context_coverage: 100,
        seeded_gain: 100,
      },
      bootstrap_smoke: {
        first_run_db_init_success: true,
        startup_time_ms: 250,
      },
      captured_bootstrap_proofs: ['windows'],
      manager_proof: {
        thin_manager_pass: true,
        claude_primary_pass: true,
        codex_primary_pass: true,
        shell_primary_pass: true,
        mission_brief_completeness: 100,
        goal_ambiguity_detection: true,
        false_complete_count: 0,
        blocked_with_correct_reason_rate: 100,
        worker_invocation_pass_rate: 100,
        artifact_lineage_completeness: 100,
        verifier_worker_path: true,
        runtime_session_capture: true,
        checkpoint_capture: true,
        checkpoint_restore_capture: true,
        checkpoint_restore_breadth: 100,
      },
      proving_harness: {
        proving_mission_definition_valid: true,
        supported_definition_count: 2,
        generic_acceptance_harness_pass_rate: 100,
        blocked_reason_accuracy: 100,
        report_contract_completeness: 100,
        adapter_selection_correctness: 100,
        mission_demo_without_hidden_steps: true,
      },
      phase4_proof: {
        success_run_pass: true,
        blocked_with_correct_reason: true,
        retryable_verification_failed: true,
        final_report_artifact_present: true,
        market_data_evidence_present: true,
        latest_verified_mission_reused: true,
      },
    });

    expect(scorecard.success_bar).toBe('Repeatable One-Mission');
    expect(scorecard.proving_mission).toBe('Thai equities daily stock scanner');
    expect(scorecard.acceptance_run_set).toBe('thai_equities_daily_controlled_acceptance_runs');
    expect(scorecard.metric_values.some((metric) => metric.id === 'routing_accuracy' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'false_complete_count' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'manager_shell_path' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'worker_invocation_pass_rate' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'artifact_lineage_completeness' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'verifier_worker_path' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'runtime_session_capture' && metric.status === 'pass')).toBe(true);
    expect(scorecard.metric_values.some((metric) => metric.id === 'generic_acceptance_harness_pass_rate' && metric.status === 'pass')).toBe(true);
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase0_ProgramLock')?.status).toBe('pass');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase1_ManagerBeta')?.status).toBe('partial');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase2_WorkerFabricRuntimeSpine')?.status).toBe('pass');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase3_ProvingMissionFramework')?.status).toBe('pass');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase4_DemoAcceptanceMission')?.status).toBe('pass');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase5_ActualManagerLedMission')?.status).toBe('fail');
    expect(scorecard.phase_readiness.find((phase) => phase.phase === 'Phase6_Repeatability')?.status).toBe('fail');
  });
});

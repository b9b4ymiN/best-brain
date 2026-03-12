import { describe, expect, test } from 'bun:test';
import { evaluateWindowsOperatorGate } from '../src/program/windows-operator-gate.ts';

describe('windows operator readiness gate', () => {
  test('passes when phase11/12/13 invariants and scorecard metrics are green', () => {
    const result = evaluateWindowsOperatorGate({
      phase11: {
        scheduled_run_count: 3,
        scheduled_verified_complete_rate: 100,
        autonomy_gating_correct: true,
        no_manual_intervention_steps: true,
      },
      phase12: {
        invariants: {
          dashboard_readable_while_blocked: true,
          blocked_launch_returns_423: true,
          blocked_scheduler_returns_423: true,
          blocked_queue_returns_423: true,
          resume_restores_launch: true,
          resume_restores_scheduler_tick: true,
          resume_restores_queue_tick: true,
        },
      },
      phase13: {
        invariants: {
          diagnostics_available: true,
          dashboard_includes_worker_recovery: true,
          preflight_blocks_unavailable_execution: true,
          preflight_allows_no_execute: true,
          launch_enforces_preflight_server_side: true,
          launch_allows_no_execute_plan_only: true,
        },
      },
      scorecard: {
        metric_values: [
          { id: 'windows_bootstrap_proof', status: 'pass' },
          { id: 'phase13_diagnostics_available', status: 'pass' },
          { id: 'phase13_dashboard_worker_recovery', status: 'pass' },
          { id: 'phase13_preflight_blocks_unavailable_execution', status: 'pass' },
          { id: 'phase13_preflight_allows_no_execute', status: 'pass' },
          { id: 'phase13_launch_server_guard', status: 'pass' },
          { id: 'phase13_launch_allows_no_execute', status: 'pass' },
        ],
      },
    });

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  test('fails when any required invariant or metric is missing', () => {
    const result = evaluateWindowsOperatorGate({
      phase11: {
        scheduled_run_count: 2,
        scheduled_verified_complete_rate: 100,
        autonomy_gating_correct: false,
        no_manual_intervention_steps: true,
      },
      phase12: {
        invariants: {
          blocked_launch_returns_423: true,
        },
      },
      phase13: {
        invariants: {
          diagnostics_available: true,
        },
      },
      scorecard: {
        metric_values: [
          { id: 'windows_bootstrap_proof', status: 'pass' },
          { id: 'phase13_diagnostics_available', status: 'fail' },
        ],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.some((check) => check.passed === false)).toBe(true);
  });
});

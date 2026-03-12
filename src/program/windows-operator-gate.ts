export interface GateCheckResult {
  id: string;
  source: string;
  passed: boolean;
  detail: string;
}

export interface WindowsOperatorGateInput {
  phase11: {
    scheduled_run_count: number;
    scheduled_verified_complete_rate: number;
    autonomy_gating_correct: boolean;
    no_manual_intervention_steps: boolean;
  } | null;
  phase12: {
    invariants: Record<string, boolean>;
  } | null;
  phase13: {
    invariants: Record<string, boolean>;
  } | null;
  scorecard: {
    metric_values: Array<{
      id: string;
      status: 'pass' | 'fail' | 'unavailable';
    }>;
  } | null;
}

export interface WindowsOperatorGateResult {
  passed: boolean;
  checks: GateCheckResult[];
}

function getMetricStatus(
  scorecard: WindowsOperatorGateInput['scorecard'],
  id: string,
): 'pass' | 'fail' | 'unavailable' {
  if (!scorecard) {
    return 'unavailable';
  }
  const metric = scorecard.metric_values.find((item) => item.id === id);
  return metric?.status ?? 'unavailable';
}

function checkInvariant(
  source: string,
  id: string,
  invariants: Record<string, boolean> | null | undefined,
): GateCheckResult {
  const value = invariants?.[id] === true;
  return {
    id: `${source}:${id}`,
    source,
    passed: value,
    detail: value
      ? `${id} is true`
      : `${id} is false or missing`,
  };
}

export function evaluateWindowsOperatorGate(input: WindowsOperatorGateInput): WindowsOperatorGateResult {
  const checks: GateCheckResult[] = [];

  checks.push({
    id: 'phase11:scheduled_run_count',
    source: 'phase11-operator.latest.json',
    passed: (input.phase11?.scheduled_run_count ?? 0) >= 3,
    detail: `scheduled_run_count=${String(input.phase11?.scheduled_run_count ?? 'missing')} (expected >=3)`,
  });
  checks.push({
    id: 'phase11:scheduled_verified_complete_rate',
    source: 'phase11-operator.latest.json',
    passed: (input.phase11?.scheduled_verified_complete_rate ?? 0) >= 100,
    detail: `scheduled_verified_complete_rate=${String(input.phase11?.scheduled_verified_complete_rate ?? 'missing')} (expected >=100)`,
  });
  checks.push({
    id: 'phase11:autonomy_gating_correct',
    source: 'phase11-operator.latest.json',
    passed: input.phase11?.autonomy_gating_correct === true,
    detail: input.phase11?.autonomy_gating_correct === true
      ? 'autonomy gating is correct'
      : 'autonomy gating is false or missing',
  });
  checks.push({
    id: 'phase11:no_manual_intervention_steps',
    source: 'phase11-operator.latest.json',
    passed: input.phase11?.no_manual_intervention_steps === true,
    detail: input.phase11?.no_manual_intervention_steps === true
      ? 'no hidden manual intervention is confirmed'
      : 'manual intervention flag is false or missing',
  });

  checks.push(
    checkInvariant('phase12-safety.latest.json', 'dashboard_readable_while_blocked', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'blocked_launch_returns_423', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'blocked_scheduler_returns_423', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'blocked_queue_returns_423', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'resume_restores_launch', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'resume_restores_scheduler_tick', input.phase12?.invariants),
    checkInvariant('phase12-safety.latest.json', 'resume_restores_queue_tick', input.phase12?.invariants),
  );

  checks.push(
    checkInvariant('phase13-operator.latest.json', 'diagnostics_available', input.phase13?.invariants),
    checkInvariant('phase13-operator.latest.json', 'dashboard_includes_worker_recovery', input.phase13?.invariants),
    checkInvariant('phase13-operator.latest.json', 'preflight_blocks_unavailable_execution', input.phase13?.invariants),
    checkInvariant('phase13-operator.latest.json', 'preflight_allows_no_execute', input.phase13?.invariants),
    checkInvariant('phase13-operator.latest.json', 'launch_enforces_preflight_server_side', input.phase13?.invariants),
    checkInvariant('phase13-operator.latest.json', 'launch_allows_no_execute_plan_only', input.phase13?.invariants),
  );

  const requiredScorecardMetrics = [
    'windows_bootstrap_proof',
    'phase13_diagnostics_available',
    'phase13_dashboard_worker_recovery',
    'phase13_preflight_blocks_unavailable_execution',
    'phase13_preflight_allows_no_execute',
    'phase13_launch_server_guard',
    'phase13_launch_allows_no_execute',
  ];

  for (const metricId of requiredScorecardMetrics) {
    const status = getMetricStatus(input.scorecard, metricId);
    checks.push({
      id: `scorecard:${metricId}`,
      source: 'program-scorecard.latest.json',
      passed: status === 'pass',
      detail: `metric status=${status} (expected pass)`,
    });
  }

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

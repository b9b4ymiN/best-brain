import type { ExecutionRequest, MissionBrief } from './types.ts';

function requiresCodeArtifacts(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return ['code', 'repo', 'typescript', 'bun', 'test', 'file', 'script', 'server'].some((hint) => normalized.includes(hint));
}

export function buildExecutionPlan(brief: MissionBrief): string[] {
  const steps = [
    'Review brain consult guidance and mission context before acting.',
    `Execute the primary worker: ${brief.selected_worker ?? 'none'}.`,
    'Collect evidence and proposed verification checks from the worker result.',
    'Persist outcome, start verification, and only mark complete if proof passes.',
  ];

  return steps;
}

export function buildExecutionRequest(brief: MissionBrief, cwd: string): ExecutionRequest | null {
  if (!brief.selected_worker) {
    return null;
  }

  const expectedArtifacts: Array<ExecutionRequest['expected_artifacts'][number]> = requiresCodeArtifacts(brief.goal)
    ? ['file', 'test', 'note']
    : ['note'];

  return {
    mission_id: brief.mission_id,
    selected_worker: brief.selected_worker,
    prompt: [
      'You are the primary worker inside best-brain manager alpha.',
      `Mission ID: ${brief.mission_id}`,
      `Goal: ${brief.goal}`,
      `Preferred format: ${brief.preferred_format}`,
      `Success criteria: ${brief.success_criteria.join(' | ')}`,
      `Constraints: ${brief.constraints.join(' | ')}`,
      `Planning hints: ${brief.planning_hints.join(' | ')}`,
      'Return strict JSON only with keys: summary, status, artifacts, proposed_checks.',
      'status must be one of success, needs_retry, failed.',
      'artifacts must be an array of objects with type, ref, optional description.',
      'proposed_checks must be an array of objects with name, passed, optional detail.',
      'If no file or test artifact exists, include at least one note artifact that points to your concrete result.',
      'If the mission is analysis-only, prefer note artifacts and do not edit files.',
      'Do not claim verified_complete. The manager owns verification.',
    ].join('\n'),
    cwd,
    expected_artifacts: expectedArtifacts,
    verification_required: true,
  };
}

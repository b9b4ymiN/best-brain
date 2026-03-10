import type { MissionTaskNode } from './graph.ts';
import { getReadyTaskNodes } from './graph.ts';
import type { ExecutionRequest, MissionBrief } from './types.ts';

function requiresCodeArtifacts(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return ['code', 'repo', 'typescript', 'bun', 'test', 'file', 'script', 'server'].some((hint) => normalized.includes(hint));
}

export function buildExecutionPlan(brief: MissionBrief): string[] {
  const checklistSummary = brief.playbook.verifier_checklist
    .map((item) => item.name)
    .slice(0, 3)
    .join(' | ');

  const steps = [
    'Review brain consult guidance and mission context before acting.',
    `Execute the primary worker from playbook ${brief.playbook.id}: ${brief.selected_worker ?? 'none'}.`,
    `Collect evidence and proposed verification checks from the worker result. Required checklist: ${checklistSummary || 'default proof checklist'}.`,
    `Prepare the owner-facing report using format: ${brief.playbook.report_format}.`,
    'Persist outcome, start verification, and only mark complete if proof passes.',
  ];

  return steps;
}

function getPrimaryTask(brief: MissionBrief): MissionTaskNode | null {
  const readyWorkerNodes = getReadyTaskNodes(brief.mission_graph).filter((node) => node.assigned_worker === brief.selected_worker);
  return readyWorkerNodes[0] ?? null;
}

function collectExpectedArtifacts(brief: MissionBrief): Array<ExecutionRequest['expected_artifacts'][number]> {
  const artifactKinds = new Set<ExecutionRequest['expected_artifacts'][number]>();
  if (requiresCodeArtifacts(brief.goal)) {
    artifactKinds.add('file');
    artifactKinds.add('test');
  }

  for (const item of brief.playbook.verifier_checklist) {
    if (item.required && item.artifact_kind) {
      artifactKinds.add(item.artifact_kind);
    }
  }

  if (artifactKinds.size === 0) {
    artifactKinds.add('note');
  } else {
    artifactKinds.add('note');
  }

  return Array.from(artifactKinds);
}

export function buildExecutionRequest(brief: MissionBrief, cwd: string): ExecutionRequest | null {
  if (!brief.selected_worker) {
    return null;
  }

  const primaryTask = getPrimaryTask(brief);
  if (!primaryTask) {
    return null;
  }

  const expectedArtifacts = collectExpectedArtifacts(brief);
  const graphSummary = brief.mission_graph.nodes
    .map((node) => `${node.id}:${node.status}:${node.assigned_worker ?? 'manager'}`)
    .join(' | ');
  const checklistSummary = brief.playbook.verifier_checklist
    .map((item) => `${item.name}${item.required ? ' (required)' : ''}`)
    .join(' | ');
  const citationSummary = brief.brain_citations
    .map((citation) => `${citation.memory_type}:${citation.title}`)
    .slice(0, 5)
    .join(' | ');

  return {
    mission_id: brief.mission_id,
    mission_kind: brief.mission_kind,
    task_id: primaryTask.id,
    task_title: primaryTask.title,
    selected_worker: brief.selected_worker,
    prompt: [
      'You are the primary worker inside best-brain manager alpha.',
      `Mission ID: ${brief.mission_id}`,
      `Mission kind: ${brief.mission_kind}`,
      `Current task: ${primaryTask.id} - ${primaryTask.title}`,
      `Goal: ${brief.goal}`,
      `Playbook: ${brief.playbook.id} (${brief.playbook.title})`,
      `Preferred format: ${brief.preferred_format}`,
      `Success criteria: ${brief.success_criteria.join(' | ')}`,
      `Constraints: ${brief.constraints.join(' | ')}`,
      `Planning hints: ${brief.planning_hints.join(' | ')}`,
      `Verifier checklist: ${checklistSummary}`,
      `Mission graph: ${graphSummary}`,
      `Context citations: ${citationSummary || 'none'}`,
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
    context_citations: brief.brain_citations,
    playbook_id: brief.playbook.id,
    playbook: brief.playbook,
    mission_graph: brief.mission_graph,
    verification_required: true,
  };
}

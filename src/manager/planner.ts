import type { MissionTaskNode } from './graph.ts';
import { getReadyTaskNodes } from './graph.ts';
import { buildMissionShellCommand } from '../proving/packs.ts';
import type { ExecutionRequest, MissionBrief } from './types.ts';

function splitCommandLine(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';
    if ((char === '"' || char === '\'') && quote == null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (quote == null && /\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

function extractShellCommand(goal: string): ExecutionRequest['shell_command'] {
  const explicitMatch = goal.match(/`([^`]+)`/);
  if (explicitMatch?.[1]) {
    const raw = explicitMatch[1].trim();
    const parts = splitCommandLine(raw);
    if (parts.length > 0) {
      const [command, ...args] = parts;
      return { command, args, raw };
    }
  }

  return null;
}

function resolveShellCommand(brief: MissionBrief): ExecutionRequest['shell_command'] {
  const explicit = extractShellCommand(brief.goal);
  if (explicit) {
    return explicit;
  }

  return buildMissionShellCommand(brief);
}

function requiresCodeArtifacts(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return ['code', 'repo', 'typescript', 'bun', 'test', 'file', 'script', 'server'].some((hint) => normalized.includes(hint));
}

export function buildExecutionPlan(brief: MissionBrief): string[] {
  const checklistSummary = brief.playbook.verifier_checklist
    .map((item) => item.name)
    .slice(0, 3)
    .join(' | ');
  const shellCommand = brief.selected_worker === 'shell' ? resolveShellCommand(brief)?.raw ?? null : null;
  const adapterSummary = brief.input_adapter_decisions
    .map((decision) => `${decision.input_id}:${decision.decision}:${decision.selected_adapter_id ?? decision.blocked_reason ?? 'none'}`)
    .join(' | ');

  const steps = [
    'Review brain consult guidance and mission context before acting.',
    ...(brief.manager_derivation?.screening_criteria.length
      ? [`Infer owner-specific criteria from memory: ${brief.manager_derivation.screening_criteria.join(' | ')}.`]
      : []),
    adapterSummary.length > 0
      ? `Resolve mission inputs using adapter decisions: ${adapterSummary}.`
      : 'No external mission inputs are required for this run.',
    shellCommand
      ? `Execute the primary worker from playbook ${brief.playbook.id}: shell command \`${shellCommand}\`.` 
      : `Execute the primary worker from playbook ${brief.playbook.id}: ${brief.selected_worker ?? 'none'}.`,
    `Collect evidence and proposed verification checks from the worker result. Required checklist: ${checklistSummary || 'default proof checklist'}.`,
    `Prepare the owner-facing report using contract ${brief.report_contract_id}: ${brief.playbook.report_format}.`,
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
  const normalizedGoal = brief.goal.toLowerCase();
  if (requiresCodeArtifacts(brief.goal)) {
    artifactKinds.add('file');
    artifactKinds.add('test');
  }
  if (brief.selected_worker === 'shell' || ['run', 'build', 'lint', 'smoke', 'command'].some((hint) => normalizedGoal.includes(hint))) {
    artifactKinds.add('other');
  }
  if (['test', 'build', 'lint', 'smoke'].some((hint) => normalizedGoal.includes(hint))) {
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
  const shellCommand = brief.selected_worker === 'shell' ? resolveShellCommand(brief) : null;

  return {
    mission_id: brief.mission_id,
    mission_kind: brief.mission_kind,
    mission_definition_id: brief.mission_definition_id,
    report_contract_id: brief.report_contract_id,
    task_id: primaryTask.id,
    task_title: primaryTask.title,
    selected_worker: brief.selected_worker,
    shell_command: shellCommand,
    prompt: [
      'You are the primary worker inside best-brain manager alpha.',
      `Mission ID: ${brief.mission_id}`,
      `Mission kind: ${brief.mission_kind}`,
      `Mission definition: ${brief.mission_definition_id}`,
      `Acceptance profile: ${brief.acceptance_profile_id}`,
      `Current task: ${primaryTask.id} - ${primaryTask.title}`,
      `Goal: ${brief.goal}`,
      `Shell command: ${shellCommand?.raw ?? 'none'}`,
      `Playbook: ${brief.playbook.id} (${brief.playbook.title})`,
      `Report contract: ${brief.report_contract_id} (${brief.report_contract.required_sections.join(' | ')})`,
      `Preferred format: ${brief.preferred_format}`,
      `Success criteria: ${brief.success_criteria.join(' | ')}`,
      `Constraints: ${brief.constraints.join(' | ')}`,
      `Planning hints: ${brief.planning_hints.join(' | ')}`,
      `Manager derivation: archetype=${brief.manager_derivation?.owner_archetype ?? 'unknown'}; criteria=${brief.manager_derivation?.screening_criteria.join(' | ') || 'none'}; outputs=${brief.manager_derivation?.planned_outputs.join(' | ') || 'none'}`,
      `Input adapters: ${brief.input_adapter_decisions.map((decision) => `${decision.input_id}:${decision.decision}:${decision.selected_adapter_id ?? decision.blocked_reason ?? 'none'}`).join(' | ') || 'none'}`,
      `Verifier checklist: ${checklistSummary}`,
      `Mission graph: ${graphSummary}`,
      `Context citations: ${citationSummary || 'none'}`,
      'If the manager derivation names owner-specific criteria, reflect them explicitly in your result.',
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
    report_contract: brief.report_contract,
    input_adapter_decisions: brief.input_adapter_decisions,
    mission_graph: brief.mission_graph,
    verification_required: true,
  };
}

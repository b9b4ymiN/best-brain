import type { MissionBrief, RoutedManagerContext } from './types.ts';
import { buildMissionTaskGraph } from './graph.ts';
import { resolveMissionPlaybook } from './playbook.ts';
import { buildExecutionPlan } from './planner.ts';
import { buildManagerDerivation } from './mission-derivation.ts';
import { buildInputAdapterRegistry, resolveProvingMissionDefinition, selectInputAdapters } from '../proving/registry.ts';

export function compileMissionBrief(context: RoutedManagerContext, missionId: string): MissionBrief {
  const { input, consult, context: missionContext, decision } = context;
  const playbook = resolveMissionPlaybook(input, consult, missionContext, decision);
  const missionDefinition = resolveProvingMissionDefinition(playbook);
  const inputAdapterDecisions = selectInputAdapters(
    missionDefinition.required_inputs,
    buildInputAdapterRegistry(input, missionContext),
  );
  const managerDerivation = buildManagerDerivation(playbook.mission_kind, consult, missionContext);
  const planningHints = missionContext.planning_hints.slice(0, 5);
  const successCriteria = [
    `Produce a grounded result for: ${input.goal}`,
    ...(managerDerivation?.screening_criteria.slice(0, 5).map((criterion) => `Reflect owner-derived criterion: ${criterion}.`) ?? []),
    ...consult.followup_actions.slice(0, 2),
    `Satisfy report contract: ${missionDefinition.report_contract.required_sections.join(' | ')}`,
    'Do not claim done until verification evidence exists.',
  ];
  const constraints = [
    'Use best-brain HTTP contracts as the source of truth.',
    `Follow preferred format: ${missionContext.preferred_format}`,
    'Do not bypass verification or mark complete directly from worker output.',
    'Use the selected input adapters only; do not invent hidden manual steps.',
    ...(managerDerivation?.owner_archetype !== 'unknown'
      ? [`Apply owner profile: ${managerDerivation?.owner_archetype}.`]
      : []),
  ];

  const brief: MissionBrief = {
    mission_id: missionId,
    mission_kind: playbook.mission_kind,
    mission_definition_id: missionDefinition.id,
    acceptance_profile_id: missionDefinition.acceptance.id,
    report_contract_id: missionDefinition.report_contract.id,
    goal: input.goal,
    kind: decision.kind,
    selected_worker: decision.selected_worker,
    success_criteria: successCriteria,
    constraints,
    preferred_format: missionContext.preferred_format,
    planning_hints: Array.from(new Set([...planningHints, ...playbook.planning_hints])).slice(0, 6),
    brain_citations: consult.citations,
    brain_trace_id: consult.trace_id,
    playbook,
    mission_definition: missionDefinition,
    report_contract: missionDefinition.report_contract,
    input_adapter_decisions: inputAdapterDecisions,
    manager_derivation: managerDerivation,
    mission_graph: {} as MissionBrief['mission_graph'],
    execution_plan: [],
  };

  brief.mission_graph = buildMissionTaskGraph(brief);
  brief.execution_plan = buildExecutionPlan(brief);
  return brief;
}

import type { MissionBrief, RoutedManagerContext } from './types.ts';
import { buildMissionTaskGraph } from './graph.ts';
import { resolveMissionPlaybook } from './playbook.ts';
import { buildExecutionPlan } from './planner.ts';

export function compileMissionBrief(context: RoutedManagerContext, missionId: string): MissionBrief {
  const { input, consult, context: missionContext, decision } = context;
  const playbook = resolveMissionPlaybook(input, consult, missionContext, decision);
  const planningHints = missionContext.planning_hints.slice(0, 5);
  const successCriteria = [
    `Produce a grounded result for: ${input.goal}`,
    ...consult.followup_actions.slice(0, 2),
    'Do not claim done until verification evidence exists.',
  ];
  const constraints = [
    'Use best-brain HTTP contracts as the source of truth.',
    `Follow preferred format: ${missionContext.preferred_format}`,
    'Do not bypass verification or mark complete directly from worker output.',
  ];

  const brief: MissionBrief = {
    mission_id: missionId,
    mission_kind: playbook.mission_kind,
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
    mission_graph: {} as MissionBrief['mission_graph'],
    execution_plan: [],
  };

  brief.mission_graph = buildMissionTaskGraph(brief);
  brief.execution_plan = buildExecutionPlan(brief);
  return brief;
}

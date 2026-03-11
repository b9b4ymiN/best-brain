import { ManagerRuntime } from '../src/manager/runtime.ts';

interface PatternScenario {
  id: string;
  goal: string;
  expectedMissionKind: string;
  expectedWorker: 'claude' | 'codex' | 'shell';
}

const scenarios: PatternScenario[] = [
  {
    id: 'repo_change_mission',
    goal: 'Implement a verification guard in this repo and finish with proof.',
    expectedMissionKind: 'repo_change_mission',
    expectedWorker: 'codex',
  },
  {
    id: 'analysis_reporting_mission',
    goal: 'Create a mission report that analyzes the current project status and finishes with proof.',
    expectedMissionKind: 'analysis_reporting_mission',
    expectedWorker: 'claude',
  },
  {
    id: 'command_execution_mission',
    goal: 'Run `bun --version` and return a proof note for this mission.',
    expectedMissionKind: 'command_execution_mission',
    expectedWorker: 'shell',
  },
];

const runtime = new ManagerRuntime();

try {
  const outputs = [];
  for (const scenario of scenarios) {
    const result = await runtime.run({
      goal: scenario.goal,
      worker_preference: 'auto',
      dry_run: true,
      output_mode: 'json',
    });

    if (result.decision.kind === 'chat') {
      throw new Error(`${scenario.id} expected mission/task routing, got chat.`);
    }
    if (result.goal_ambiguity.is_ambiguous) {
      throw new Error(`${scenario.id} should not be ambiguous: ${result.goal_ambiguity.reason}`);
    }
    if (result.mission_brief.mission_kind !== scenario.expectedMissionKind) {
      throw new Error(`${scenario.id} expected mission_kind=${scenario.expectedMissionKind}, got ${result.mission_brief.mission_kind}.`);
    }
    if (result.decision.selected_worker !== scenario.expectedWorker) {
      throw new Error(`${scenario.id} expected selected_worker=${scenario.expectedWorker}, got ${result.decision.selected_worker ?? 'none'}.`);
    }
    if (result.mission_brief.playbook.verifier_checklist.length === 0) {
      throw new Error(`${scenario.id} expected non-empty verifier checklist.`);
    }
    if (result.mission_graph.playbook_id !== result.mission_brief.playbook.id) {
      throw new Error(`${scenario.id} expected mission graph playbook linkage.`);
    }

    outputs.push({
      id: scenario.id,
      decision_kind: result.decision.kind,
      selected_worker: result.decision.selected_worker,
      mission_kind: result.mission_brief.mission_kind,
      playbook_id: result.mission_brief.playbook.id,
      verifier_checklist: result.mission_brief.playbook.verifier_checklist.map((item) => item.name),
      trace_id: result.mission_brief.brain_trace_id,
    });
  }

  console.log(JSON.stringify({ scenarios: outputs }, null, 2));
} finally {
  await runtime.dispose();
}

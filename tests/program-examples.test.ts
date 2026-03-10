import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'bun:test';

describe('program example library', () => {
  test('ships parseable program-facing examples for contracts and scorecards', () => {
    const examplesDir = path.resolve(process.cwd(), 'docs/examples/program');
    const workerTaskInput = JSON.parse(fs.readFileSync(path.join(examplesDir, 'worker-task-input.json'), 'utf8')) as {
      worker: string;
      mission_id: string;
    };
    const workerTaskResult = JSON.parse(fs.readFileSync(path.join(examplesDir, 'worker-task-result.json'), 'utf8')) as {
      status: string;
      artifacts: unknown[];
    };
    const missionGraph = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-task-graph.json'), 'utf8')) as {
      nodes: Array<{ id: string; status: string }>;
    };
    const runtimeBundle = JSON.parse(fs.readFileSync(path.join(examplesDir, 'runtime-session-bundle.json'), 'utf8')) as {
      session: { mission_id: string };
      artifacts: unknown[];
      checkpoints: unknown[];
    };
    const marketDecision = JSON.parse(fs.readFileSync(path.join(examplesDir, 'market-data-adapter-decision.json'), 'utf8')) as {
      decision: string;
      selected_adapter_id: string | null;
    };
    const playbook = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-playbook.json'), 'utf8')) as {
      verifier_checklist: unknown[];
      repair_heuristics: unknown[];
    };
    const consoleView = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-console-view.json'), 'utf8')) as {
      timeline: unknown[];
      workers: unknown[];
      allowed_actions: string[];
    };
    const scorecard = JSON.parse(fs.readFileSync(path.join(examplesDir, 'program-scorecard.json'), 'utf8')) as {
      success_bar: string;
      acceptance_run_set: string;
      phase_readiness: Array<{ phase: string }>;
    };

    expect(workerTaskInput.worker).toBe('claude');
    expect(workerTaskResult.status).toBe('success');
    expect(workerTaskResult.artifacts.length).toBeGreaterThan(0);
    expect(missionGraph.nodes.some((node) => node.status === 'ready')).toBe(true);
    expect(runtimeBundle.session.mission_id).toBe(workerTaskInput.mission_id);
    expect(runtimeBundle.artifacts.length).toBeGreaterThan(0);
    expect(runtimeBundle.checkpoints.length).toBeGreaterThan(0);
    expect(marketDecision.decision).toBe('use_adapter');
    expect(marketDecision.selected_adapter_id).not.toBeNull();
    expect(playbook.verifier_checklist.length).toBeGreaterThan(0);
    expect(playbook.repair_heuristics.length).toBeGreaterThan(0);
    expect(consoleView.timeline.length).toBeGreaterThan(0);
    expect(consoleView.workers.length).toBeGreaterThan(0);
    expect(consoleView.allowed_actions.includes('retry_mission')).toBe(true);
    expect(scorecard.success_bar).toBe('Repeatable One-Mission');
    expect(scorecard.acceptance_run_set).toBe('thai_equities_daily_controlled_acceptance_runs');
    expect(scorecard.phase_readiness.some((phase) => phase.phase === 'Phase0_ProgramLock')).toBe(true);
  });
});

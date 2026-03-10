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
      playbook_id: string;
      nodes: Array<{ id: string; status: string }>;
    };
    const runtimeBundle = JSON.parse(fs.readFileSync(path.join(examplesDir, 'runtime-session-bundle.json'), 'utf8')) as {
      session: { mission_id: string; mission_definition_id: string | null; final_report_artifact_id: string | null };
      artifacts: unknown[];
      checkpoints: unknown[];
    };
    const inputAdapterDecision = JSON.parse(fs.readFileSync(path.join(examplesDir, 'input-adapter-decision.json'), 'utf8')) as {
      decision: string;
      selected_adapter_id: string | null;
      input_id: string;
    };
    const playbook = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-playbook.json'), 'utf8')) as {
      verifier_checklist: unknown[];
      repair_heuristics: unknown[];
    };
    const missionDefinition = JSON.parse(fs.readFileSync(path.join(examplesDir, 'proving-mission-definition.json'), 'utf8')) as {
      id: string;
      acceptance: { id: string };
    };
    const acceptanceRun = JSON.parse(fs.readFileSync(path.join(examplesDir, 'acceptance-run-definition.json'), 'utf8')) as {
      mission_definition_id: string;
      expected_final_status: string;
    };
    const acceptanceResult = JSON.parse(fs.readFileSync(path.join(examplesDir, 'acceptance-run-result.json'), 'utf8')) as {
      passed: boolean;
      report_contract_completeness: number;
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

    expect(workerTaskInput.worker).toBe('codex');
    expect(workerTaskResult.status).toBe('success');
    expect(workerTaskResult.artifacts.length).toBeGreaterThan(0);
    expect(missionGraph.playbook_id).toBe('playbook_repo_change_mission');
    expect(missionGraph.nodes.some((node) => node.id === 'data_selection')).toBe(true);
    expect(runtimeBundle.session.mission_id).toBe(workerTaskInput.mission_id);
    expect(runtimeBundle.session.mission_definition_id).toBe(missionDefinition.id);
    expect(runtimeBundle.session.final_report_artifact_id).not.toBeNull();
    expect(runtimeBundle.artifacts.length).toBeGreaterThan(0);
    expect(runtimeBundle.checkpoints.length).toBeGreaterThan(0);
    expect(inputAdapterDecision.decision).toBe('selected');
    expect(inputAdapterDecision.selected_adapter_id).not.toBeNull();
    expect(inputAdapterDecision.input_id).toBe('workspace_context');
    expect(playbook.verifier_checklist.length).toBeGreaterThan(0);
    expect(playbook.repair_heuristics.length).toBeGreaterThan(0);
    expect(missionDefinition.acceptance.id).toContain('acceptance_');
    expect(acceptanceRun.mission_definition_id).toBe(missionDefinition.id);
    expect(acceptanceRun.expected_final_status).toBe('verified_complete');
    expect(acceptanceResult.passed).toBe(true);
    expect(acceptanceResult.report_contract_completeness).toBe(100);
    expect(consoleView.timeline.length).toBeGreaterThan(0);
    expect(consoleView.workers.length).toBeGreaterThan(0);
    expect(consoleView.allowed_actions.includes('retry_mission')).toBe(true);
    expect(scorecard.success_bar).toBe('Repeatable One-Mission');
    expect(scorecard.acceptance_run_set).toBe('thai_equities_daily_controlled_acceptance_runs');
    expect(scorecard.phase_readiness.some((phase) => phase.phase === 'Phase0_ProgramLock')).toBe(true);
  });
});

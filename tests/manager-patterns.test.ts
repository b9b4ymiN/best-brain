import { describe, expect, test } from 'bun:test';
import { routeIntent } from '../src/manager/intent-router.ts';
import { compileMissionBrief } from '../src/manager/mission-compiler.ts';
import type { ManagerInput, ManagerWorker } from '../src/manager/types.ts';
import type { ConsultResponse, MissionContextBundle } from '../src/types.ts';

function makeInput(goal: string): ManagerInput {
  return {
    goal,
    worker_preference: 'auto',
    mission_id: null,
    cwd: process.cwd(),
    dry_run: true,
    no_execute: false,
    output_mode: 'json',
  };
}

function makeConsult(): ConsultResponse {
  return {
    answer: 'Grounded consult answer.',
    memory_ids: ['mem_001'],
    citations: [{
      memory_id: 'mem_001',
      title: 'Owner playbook memory',
      memory_type: 'Procedures',
      memory_scope: 'cross_mission',
      memory_layer: 'pattern',
      memory_subtype: 'procedure.planning',
      summary: 'Use proof-driven closeout.',
      source: 'seed',
      verified_by: 'user',
      evidence_ref: [{ type: 'note', ref: 'seed://owner-playbook' }],
      entity_keys: ['verification_playbook'],
      entity_aliases: ['proof chain'],
    }],
    policy_path: 'deterministic.procedure_lookup.v1',
    query_profile: 'balanced',
    retrieval_mode: 'fts_only',
    confidence_band: 'high',
    followup_actions: ['Keep verification evidence linked to artifacts.'],
    trace_id: 'trace_manager_patterns',
    selected_memories: [],
    retrieval_bundle: null,
  };
}

function makeContext(): MissionContextBundle {
  return {
    mission: null,
    history: [],
    working_memory: [],
    durable_memory: [],
    planning_hints: ['Preserve proof chain.'],
    preferred_format: 'Objective, evidence, checks, risks, next action.',
    verification_state: null,
    verification_artifacts: [],
    manager_bundle: null,
  };
}

interface PatternCase {
  goal: string;
  expectedMissionKind: string;
  expectedWorker: ManagerWorker;
}

const PATTERN_CASES: PatternCase[] = [
  {
    goal: 'Implement a Bun verification guard in this repo and finish with proof.',
    expectedMissionKind: 'repo_change_mission',
    expectedWorker: 'codex',
  },
  {
    goal: 'Create a mission report that analyzes current project status and finishes with proof.',
    expectedMissionKind: 'analysis_reporting_mission',
    expectedWorker: 'claude',
  },
  {
    goal: 'Run `bun --version` and return a proof note for this mission.',
    expectedMissionKind: 'command_execution_mission',
    expectedWorker: 'shell',
  },
];

describe('manager beta multi-pattern mission compilation', () => {
  test('compiles repo-change, analysis-reporting, and command-execution mission kinds from one shared flow', () => {
    const consult = makeConsult();
    const context = makeContext();

    for (const patternCase of PATTERN_CASES) {
      const input = makeInput(patternCase.goal);
      const decision = routeIntent(input);
      const brief = compileMissionBrief({
        input,
        consult,
        context,
        decision,
      }, `mission_${patternCase.expectedMissionKind}`);

      expect(decision.kind).toBe('mission');
      expect(decision.selected_worker).toBe(patternCase.expectedWorker);
      expect(brief.mission_kind).toBe(patternCase.expectedMissionKind);
      expect(brief.playbook.mission_kind).toBe(patternCase.expectedMissionKind);
      expect(brief.mission_definition.mission_kind).toBe(patternCase.expectedMissionKind);
      expect(brief.playbook.verifier_checklist.length).toBeGreaterThan(0);
      expect(brief.input_adapter_decisions.length).toBeGreaterThan(0);
      expect(brief.mission_graph.playbook_id).toBe(brief.playbook.id);
    }
  });
});

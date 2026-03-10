import { describe, expect, test } from 'bun:test';
import { selectMarketDataAdapter } from '../src/market/types.ts';
import { getReadyTaskNodes, recomputeMissionGraph, updateTaskStatus } from '../src/manager/graph.ts';
import {
  PROGRAM_ACCEPTANCE_RUN_SET,
  PROGRAM_CORE_CONTRACTS,
  PROGRAM_MANAGER_BETA_RAILS,
  PROGRAM_OPERATING_ASSUMPTIONS,
  PROGRAM_PILLARS,
  PROGRAM_PHASES,
  PROGRAM_PROVING_MISSION,
  PROGRAM_SUCCESS_BAR,
} from '../src/program/contracts.ts';
import { CONTROL_ROOM_ACTIONS } from '../src/control-room/types.ts';
import { RUNTIME_SESSION_STATUSES } from '../src/runtime/types.ts';
import { validateWorkerTaskInput, validateWorkerTaskResult, WORKER_IDS } from '../src/workers/types.ts';

describe('program contract freeze', () => {
  test('freezes system pillars, phases, proving mission, and contract families', () => {
    expect(PROGRAM_PILLARS).toEqual([
      'PersonaBrain',
      'MissionManager',
      'WorkerSwarm',
      'RuntimeOS',
      'ControlSurface',
    ]);
    expect(PROGRAM_PHASES).toEqual([
      'Phase0_ProgramLock',
      'Phase1_ManagerBeta',
      'Phase2_WorkerFabricRuntimeSpine',
      'Phase3_ThaiEquitiesStockScanner',
      'Phase4_FullMissionConsole',
      'Phase5_Repeatability',
    ]);
    expect(PROGRAM_SUCCESS_BAR).toBe('Repeatable One-Mission');
    expect(PROGRAM_PROVING_MISSION).toBe('Thai equities daily stock scanner');
    expect(PROGRAM_ACCEPTANCE_RUN_SET).toBe('thai_equities_daily_controlled_acceptance_runs');
    expect(PROGRAM_MANAGER_BETA_RAILS).toEqual([
      'mission_brief_completeness_validator',
      'goal_ambiguity_detector',
    ]);
    expect(PROGRAM_OPERATING_ASSUMPTIONS).toEqual([
      'no_hidden_human_in_the_loop_steps',
    ]);
    expect(PROGRAM_CORE_CONTRACTS).toEqual([
      'brain',
      'manager',
      'worker',
      'runtime',
      'console',
      'market_data',
    ]);
  });

  test('freezes worker, runtime, and control-room enums', () => {
    expect(WORKER_IDS).toEqual([
      'claude',
      'codex',
      'shell',
      'browser',
      'mail',
      'verifier',
    ]);
    expect(RUNTIME_SESSION_STATUSES).toEqual([
      'pending',
      'active',
      'checkpointed',
      'completed',
      'failed',
      'aborted',
    ]);
    expect(CONTROL_ROOM_ACTIONS).toEqual([
      'launch_mission',
      'retry_mission',
      'approve_verdict',
      'reject_verdict',
      'cancel_mission',
      'resume_mission',
    ]);
  });

  test('validates generic worker task input and result payloads', () => {
    const input = validateWorkerTaskInput({
      worker: 'claude',
      mission_id: 'mission-program',
      task_id: 'task-analysis',
      objective: 'Analyze the mission.',
      instructions: 'Return a grounded analysis note.',
      cwd: process.cwd(),
      constraints: ['Stay grounded'],
      expected_artifacts: ['note'],
      context_citations: [],
      verification_required: true,
      playbook_id: 'playbook-1',
    });

    expect(input.worker).toBe('claude');
    expect(() => validateWorkerTaskInput({
      worker: 'unsupported',
      mission_id: 'mission-program',
      task_id: 'task-analysis',
      objective: 'Analyze the mission.',
      instructions: 'Return a grounded analysis note.',
      cwd: process.cwd(),
      constraints: [],
      expected_artifacts: ['note'],
      context_citations: [],
      verification_required: true,
      playbook_id: null,
    })).toThrow('worker must be a supported worker id');

    const result = validateWorkerTaskResult({
      worker: 'codex',
      mission_id: 'mission-program',
      task_id: 'task-implement',
      status: 'success',
      summary: 'Implementation completed.',
      artifacts: [],
      checks: [],
      raw_output: '{}',
      started_at: 1,
      completed_at: 2,
      retry_recommendation: null,
    });

    expect(result.status).toBe('success');
  });

  test('selects the freshest eligible market-data adapter and blocks stale options', () => {
    const decision = selectMarketDataAdapter([
      {
        id: 'feed-stale',
        market: 'th_equities_daily',
        source_kind: 'public_web_feed',
        available: true,
        freshness_ms: 12 * 60 * 60 * 1000,
        confidence: 0.9,
        notes: [],
      },
      {
        id: 'feed-fresh',
        market: 'th_equities_daily',
        source_kind: 'official_source',
        available: true,
        freshness_ms: 45 * 60 * 1000,
        confidence: 0.85,
        notes: [],
      },
    ], {
      max_freshness_ms: 2 * 60 * 60 * 1000,
      minimum_confidence: 0.8,
    });

    expect(decision.decision).toBe('use_adapter');
    expect(decision.selected_adapter_id).toBe('feed-fresh');

    const blocked = selectMarketDataAdapter([
      {
        id: 'blocked-feed',
        market: 'th_equities_daily',
        source_kind: 'public_web_feed',
        available: false,
        freshness_ms: null,
        confidence: 0.7,
        notes: [],
      },
    ], {
      max_freshness_ms: 2 * 60 * 60 * 1000,
      minimum_confidence: 0.8,
    });

    expect(blocked.decision).toBe('blocked');
    expect(blocked.selected_adapter_id).toBeNull();
  });

  test('recomputes mission graph readiness from dependency completion', () => {
    const graph = recomputeMissionGraph({
      mission_id: 'mission-program',
      mission_kind: 'general_mission',
      playbook_id: 'playbook_general_mission',
      created_at: 1,
      updated_at: 1,
      nodes: [
        {
          id: 'analysis',
          title: 'Analyze',
          objective: 'Analyze the mission.',
          node_type: 'analysis',
          assigned_worker: 'claude',
          depends_on: [],
          status: 'pending',
          verification_gate: false,
          retry_count: 0,
          artifact_ids: [],
        },
        {
          id: 'implementation',
          title: 'Implement',
          objective: 'Implement the plan.',
          node_type: 'implementation',
          assigned_worker: 'codex',
          depends_on: ['analysis'],
          status: 'pending',
          verification_gate: false,
          retry_count: 0,
          artifact_ids: [],
        },
      ],
    });

    expect(getReadyTaskNodes(graph).map((node) => node.id)).toEqual(['analysis']);

    const afterAnalysis = updateTaskStatus(graph, 'analysis', 'completed', ['artifact-analysis']);
    expect(getReadyTaskNodes(afterAnalysis).map((node) => node.id)).toEqual(['implementation']);
  });
});

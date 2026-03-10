import fs from 'fs';
import path from 'path';
import { buildProgramScorecard } from '../src/program/scorecard.ts';
import type { MissionConsoleView } from '../src/control-room/types.ts';
import type { MarketDataAdapterDecision } from '../src/market/types.ts';
import type { MissionTaskGraph } from '../src/manager/graph.ts';
import type { RuntimeSessionBundle } from '../src/runtime/types.ts';
import type { MissionPlaybook } from '../src/playbooks/types.ts';
import type { WorkerTaskInput, WorkerTaskResult } from '../src/workers/types.ts';

const outputDir = path.resolve(process.cwd(), 'docs/examples/program');
const now = Date.now();

const workerTaskInput: WorkerTaskInput = {
  worker: 'claude',
  mission_id: 'mission_program_example',
  task_id: 'task_analysis',
  objective: 'Analyze the Thai equities daily scanner mission and propose a plan.',
  instructions: 'Read the mission brief, inspect existing memory, and return a grounded plan summary.',
  cwd: process.cwd(),
  constraints: [
    'Use manager/kernel rails only.',
    'Do not claim completion without verification.',
  ],
  expected_artifacts: ['note', 'other'],
  context_citations: [],
  verification_required: true,
  playbook_id: 'playbook_thai_equities_daily',
};

const workerTaskResult: WorkerTaskResult = {
  worker: 'claude',
  mission_id: workerTaskInput.mission_id,
  task_id: workerTaskInput.task_id,
  status: 'success',
  summary: 'Produced a grounded analysis note and a scanner task breakdown.',
  artifacts: [
    {
      type: 'note',
      ref: 'example://worker-analysis-note',
      description: 'Analysis note for the proving mission.',
    },
    {
      type: 'other',
      ref: 'example://worker-analysis-json',
      description: 'Structured task breakdown.',
    },
  ],
  checks: [
    {
      name: 'analysis-grounded',
      passed: true,
      detail: 'Worker result cites the mission brief and owner format.',
    },
  ],
  raw_output: '{"summary":"Produced a grounded analysis note and a scanner task breakdown."}',
  started_at: now,
  completed_at: now + 20_000,
  retry_recommendation: null,
};

const missionGraph: MissionTaskGraph = {
  mission_id: workerTaskInput.mission_id,
  mission_kind: 'thai_equities_daily_scanner',
  playbook_id: 'playbook_thai_equities_daily',
  created_at: now,
  updated_at: now,
  nodes: [
    {
      id: 'task_analysis',
      title: 'Analyze mission and draft plan',
      objective: 'Turn the goal into a mission graph and report format.',
      node_type: 'analysis',
      assigned_worker: 'claude',
      depends_on: [],
      status: 'completed',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: ['artifact_analysis_note'],
    },
    {
      id: 'task_implementation',
      title: 'Implement scanner logic',
      objective: 'Build the scanner execution step for the proving mission.',
      node_type: 'implementation',
      assigned_worker: 'codex',
      depends_on: ['task_analysis'],
      status: 'ready',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: [],
    },
    {
      id: 'task_verification',
      title: 'Verify scanner output',
      objective: 'Check report completeness, freshness, and artifact evidence.',
      node_type: 'verification',
      assigned_worker: 'verifier',
      depends_on: ['task_implementation'],
      status: 'pending',
      verification_gate: true,
      retry_count: 0,
      artifact_ids: [],
    },
  ],
};

const runtimeBundle: RuntimeSessionBundle = {
  session: {
    id: 'session_program_example',
    mission_id: workerTaskInput.mission_id,
    workspace_root: process.cwd(),
    owner: 'example-owner',
    status: 'active',
    checkpoint_ids: ['checkpoint_before_verification'],
    created_at: now,
    updated_at: now,
  },
  processes: [
    {
      id: 'proc_scanner',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      actor: 'shell',
      command: 'bun',
      args: ['run', 'scanner'],
      cwd: process.cwd(),
      status: 'succeeded',
      exit_code: 0,
      stdout_artifact_id: 'artifact_stdout',
      stderr_artifact_id: null,
      started_at: now + 30_000,
      completed_at: now + 40_000,
    },
  ],
  artifacts: [
    {
      id: 'artifact_analysis_note',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: 'task_analysis',
      kind: 'report',
      uri: 'example://artifact-analysis-note',
      description: 'Mission analysis note.',
      checksum: null,
      source: 'claude',
      created_at: now + 15_000,
    },
    {
      id: 'artifact_stdout',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: 'task_implementation',
      kind: 'stdout',
      uri: 'example://artifact-stdout',
      description: 'Scanner stdout output.',
      checksum: null,
      source: 'shell',
      created_at: now + 40_000,
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint_before_verification',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      label: 'Before verifier run',
      artifact_ids: ['artifact_analysis_note', 'artifact_stdout'],
      restore_supported: true,
      created_at: now + 45_000,
    },
  ],
  events: [
    {
      id: 'event_manager_launch',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: null,
      event_type: 'mission_started',
      actor: 'manager',
      detail: 'Mission launched from a single user goal.',
      data: {},
      created_at: now,
    },
  ],
};

const marketDecision: MarketDataAdapterDecision = {
  market: 'th_equities_daily',
  selected_adapter_id: 'thai_public_feed_primary',
  decision: 'use_adapter',
  reason: 'Selected the freshest available adapter that meets confidence policy.',
  considered: [
    {
      id: 'thai_public_feed_primary',
      market: 'th_equities_daily',
      source_kind: 'public_web_feed',
      available: true,
      freshness_ms: 30 * 60 * 1000,
      confidence: 0.82,
      notes: ['Primary daily source'],
    },
    {
      id: 'thai_official_backup',
      market: 'th_equities_daily',
      source_kind: 'official_source',
      available: true,
      freshness_ms: 90 * 60 * 1000,
      confidence: 0.9,
      notes: ['Backup source'],
    },
  ],
};

const playbook: MissionPlaybook = {
  id: 'playbook_thai_equities_daily',
  slug: 'thai-equities-daily-scanner',
  title: 'Thai equities daily proving mission',
  scope: 'domain',
  mission_kind: 'thai_equities_daily_scanner',
  preferred_workers: ['claude', 'codex', 'shell', 'verifier'],
  planning_hints: [
    'Confirm market freshness before scanning.',
    'Do not finalize without report evidence.',
  ],
  report_format: 'Short status, rationale, evidence, risks, next action.',
  verifier_checklist: [
    {
      id: 'check_fresh_data',
      name: 'Fresh market data available',
      required: true,
      artifact_kind: 'other',
      detail: 'Scanner must use the latest trading-day data or block explicitly.',
    },
    {
      id: 'check_report_complete',
      name: 'Report contains rationale and risks',
      required: true,
      artifact_kind: 'note',
      detail: 'Owner-facing report must contain results, rationale, risk, and next action.',
    },
  ],
  repair_heuristics: [
    {
      id: 'repair_retry_data_adapter',
      trigger: 'live_data_blocked',
      instruction: 'Switch to the next available market-data adapter and rerun freshness checks.',
      max_retries: 2,
    },
  ],
};

const missionConsoleView: MissionConsoleView = {
  mission_id: workerTaskInput.mission_id,
  goal: 'Run the Thai equities daily scanner and produce a verified owner report.',
  status: 'awaiting_verification',
  plan_overview: missionGraph.nodes.map((node) => `${node.id}: ${node.title}`),
  timeline: [
    {
      id: 'timeline_launch',
      mission_id: workerTaskInput.mission_id,
      source: 'manager',
      status: 'completed',
      title: 'Mission launched',
      detail: 'Manager compiled the mission brief and task graph.',
      artifact_ids: [],
      created_at: now,
    },
    {
      id: 'timeline_worker',
      mission_id: workerTaskInput.mission_id,
      source: 'worker',
      status: 'completed',
      title: 'Primary worker finished analysis',
      detail: workerTaskResult.summary,
      artifact_ids: ['artifact_analysis_note'],
      created_at: now + 20_000,
    },
  ],
  workers: [
    {
      worker: 'claude',
      status: 'completed',
      current_task_id: null,
      current_task_title: null,
      last_update_at: now + 20_000,
    },
    {
      worker: 'codex',
      status: 'queued',
      current_task_id: 'task_implementation',
      current_task_title: 'Implement scanner logic',
      last_update_at: now + 20_000,
    },
  ],
  artifacts: runtimeBundle.artifacts,
  verdict: {
    mission_id: workerTaskInput.mission_id,
    status: 'awaiting_verification',
    summary: 'Implementation is waiting for the verifier result.',
    evidence_count: 2,
    checks_passed: 0,
    checks_total: 2,
  },
  allowed_actions: ['retry_mission', 'approve_verdict', 'reject_verdict'],
};

const programScorecard = buildProgramScorecard({
  generated_at: new Date(now).toISOString(),
  contract_snapshot: {
    docs_locked: true,
    frozen_contracts: {
      brain: true,
      manager: true,
      worker: true,
      runtime: true,
      console: true,
      market_data: true,
    },
    example_libraries_refreshed: true,
    acceptance_run_set_defined: true,
    no_hidden_human_loop_assumption_locked: true,
  },
  consult_eval: {
    routing_accuracy: 100,
    top_k_relevance: 100,
    citation_completeness: 100,
    trace_presence: 100,
    mission_proof_pass_rate: 100,
    orphan_evidence_count: 0,
    manual_medians: {
      usefulness: 4,
      groundedness: 5,
      persona_alignment: 4,
      actionability: 4,
    },
  },
  seed_comparison: {
    empty_hit_rate: 0,
    seeded_hit_rate: 100,
    seeded_context_coverage: 100,
    seeded_gain: 100,
  },
  bootstrap_smoke: {
    first_run_db_init_success: true,
    startup_time_ms: 250,
  },
  captured_bootstrap_proofs: ['windows'],
  manager_proof: {
    thin_manager_pass: true,
    claude_primary_pass: true,
    codex_primary_pass: true,
    mission_brief_completeness: 100,
    goal_ambiguity_detection: true,
    false_complete_count: 0,
    blocked_with_correct_reason_rate: 100,
  },
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'worker-task-input.json'), JSON.stringify(workerTaskInput, null, 2));
fs.writeFileSync(path.join(outputDir, 'worker-task-result.json'), JSON.stringify(workerTaskResult, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-task-graph.json'), JSON.stringify(missionGraph, null, 2));
fs.writeFileSync(path.join(outputDir, 'runtime-session-bundle.json'), JSON.stringify(runtimeBundle, null, 2));
fs.writeFileSync(path.join(outputDir, 'market-data-adapter-decision.json'), JSON.stringify(marketDecision, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-playbook.json'), JSON.stringify(playbook, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-console-view.json'), JSON.stringify(missionConsoleView, null, 2));
fs.writeFileSync(path.join(outputDir, 'program-scorecard.json'), JSON.stringify(programScorecard, null, 2));

console.log(JSON.stringify({
  output_dir: outputDir,
  files: [
    'worker-task-input.json',
    'worker-task-result.json',
    'mission-task-graph.json',
    'runtime-session-bundle.json',
    'market-data-adapter-decision.json',
    'mission-playbook.json',
    'mission-console-view.json',
    'program-scorecard.json',
  ],
}, null, 2));

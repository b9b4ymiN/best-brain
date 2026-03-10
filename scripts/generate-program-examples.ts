import fs from 'fs';
import path from 'path';
import { buildProgramScorecard } from '../src/program/scorecard.ts';
import { resolveProvingMissionDefinition, selectInputAdapters } from '../src/proving/registry.ts';
import { evaluateAcceptanceRun } from '../src/proving/harness.ts';
import type { ControlRoomDashboardView, MissionConsoleView } from '../src/control-room/types.ts';
import type { MissionTaskGraph } from '../src/manager/graph.ts';
import type { RuntimeSessionBundle } from '../src/runtime/types.ts';
import type { MissionPlaybook } from '../src/playbooks/types.ts';
import type { AcceptanceRunDefinition } from '../src/proving/types.ts';
import type { WorkerTaskInput, WorkerTaskResult } from '../src/workers/types.ts';

const outputDir = path.resolve(process.cwd(), 'docs/examples/program');
const EXAMPLE_GENERATED_AT = '2026-03-10T03:40:06.974Z';
const now = Date.parse(EXAMPLE_GENERATED_AT);

const playbook: MissionPlaybook = {
  id: 'playbook_repo_change_mission',
  slug: 'repo-change-mission',
  title: 'Repo change proving mission',
  scope: 'mission',
  mission_kind: 'repo_change_mission',
  required_exact_keys: [],
  preferred_workers: ['codex', 'verifier'],
  planning_hints: [
    'Use generic mission rails only.',
    'Do not mark complete without evidence.',
  ],
  report_format: 'Objective, result, evidence, checks, risks, next action.',
  verifier_checklist: [
    {
      id: 'check_note_evidence',
      name: 'Owner-facing note evidence exists',
      required: true,
      artifact_kind: 'note',
      detail: 'There must be a grounded owner-facing note.',
    },
    {
      id: 'check_code_artifact',
      name: 'Code or test artifact exists',
      required: true,
      artifact_kind: 'file',
      detail: 'Repo changes must produce a file or test artifact.',
    },
  ],
  repair_heuristics: [
    {
      id: 'repair_collect_more_evidence',
      trigger: 'verification_failed',
      instruction: 'Collect missing file evidence and rerun verification.',
      max_retries: 2,
    },
  ],
};

const missionDefinition = resolveProvingMissionDefinition(playbook);
const inputAdapterDecisions = selectInputAdapters(missionDefinition.required_inputs, [
  {
    id: 'adapter_workspace_scan',
    title: 'Workspace scan',
    family: 'local_repo_or_runtime',
    source_kind: 'workspace_scan',
    available: true,
    freshness_ms: null,
    confidence: 0.95,
    blocking_reason: null,
    provides_inputs: ['workspace_context'],
    notes: ['Selected from the local workspace.'],
  },
]);

const acceptanceRun: AcceptanceRunDefinition = {
  id: 'acceptance_run_repo_change_success',
  mission_definition_id: missionDefinition.id,
  goal: 'Implement the proving-mission report contract for this repo.',
  run_class: 'success',
  input_fixtures: {
    cwd: process.cwd(),
  },
  expected_path: ['context_review', 'data_selection', 'primary_work', 'verification_gate', 'final_report'],
  expected_final_status: 'verified_complete',
  expected_evidence_types: ['note', 'file'],
  expected_check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
  expected_blocked_reason: null,
  hidden_human_steps_allowed: false,
};

const acceptanceRunResult = evaluateAcceptanceRun({
  definition: missionDefinition,
  run: acceptanceRun,
  adapter_decisions: inputAdapterDecisions,
  actual_final_status: 'verified_complete',
  blocked_reason: null,
  evidence: [
    { type: 'note', ref: 'proof://repo-change-note' },
    { type: 'file', ref: 'file://repo-change.ts' },
  ],
  verification_checks: [
    { name: 'Owner-facing note evidence exists', passed: true },
    { name: 'Code or test artifact exists', passed: true },
  ],
  report: {
    contract_id: missionDefinition.report_contract.id,
    artifact_ref: 'report://repo-change/final',
    verification_status: 'verified_complete',
    evidence: [
      { type: 'note', ref: 'proof://repo-change-note' },
      { type: 'file', ref: 'file://repo-change.ts' },
    ],
    verification_checks: [
      { name: 'Owner-facing note evidence exists', passed: true },
      { name: 'Code or test artifact exists', passed: true },
    ],
    sections: {
      objective: 'Implement the proving-mission report contract for this repo.',
      result_summary: 'The manager produced a verified repo-change result.',
      evidence_summary: 'note:proof://repo-change-note | file:file://repo-change.ts',
      checks_summary: 'Owner-facing note evidence exists:pass | Code or test artifact exists:pass',
      blocked_or_rejected_reason: 'None',
      remaining_risks: 'No unresolved blockers remain in the proof chain.',
      next_action: 'Reuse this verified mission in the next related run.',
    },
  },
  hidden_human_steps_detected: false,
});

const workerTaskInput: WorkerTaskInput = {
  worker: 'codex',
  mission_id: 'mission_program_example',
  task_id: 'primary_work',
  objective: 'Implement the proving-mission report contract for this repo.',
  instructions: 'Read the mission brief, use the selected input adapters, and return strict JSON only.',
  cwd: process.cwd(),
  constraints: [
    'Use manager/kernel rails only.',
    'Do not claim completion without verification.',
  ],
  expected_artifacts: ['note', 'file'],
  context_citations: [],
  verification_required: true,
  playbook_id: playbook.id,
};

const workerTaskResult: WorkerTaskResult = {
  worker: 'codex',
  mission_id: workerTaskInput.mission_id,
  task_id: workerTaskInput.task_id,
  status: 'success',
  summary: 'Produced a verified repo-change artifact set.',
  artifacts: [
    {
      type: 'note',
      ref: 'proof://repo-change-note',
      description: 'Owner-facing summary for the proving mission.',
    },
    {
      type: 'file',
      ref: 'file://repo-change.ts',
      description: 'Implementation artifact for the repo change.',
    },
  ],
  checks: [
    {
      name: 'Owner-facing note evidence exists',
      passed: true,
      detail: 'The note artifact is present.',
    },
    {
      name: 'Code or test artifact exists',
      passed: true,
      detail: 'The file artifact is present.',
    },
  ],
  raw_output: '{"summary":"Produced a verified repo-change artifact set."}',
  started_at: now,
  completed_at: now + 20_000,
  retry_recommendation: null,
  invocation: {
    command: 'codex',
    args: ['exec', '--json', '[prompt]'],
    cwd: process.cwd(),
    exit_code: 0,
    timed_out: false,
    started_at: now,
    completed_at: now + 20_000,
    transport: 'cli',
  },
};

const missionGraph: MissionTaskGraph = {
  mission_id: workerTaskInput.mission_id,
  mission_kind: playbook.mission_kind,
  playbook_id: playbook.id,
  created_at: now,
  updated_at: now,
  nodes: [
    {
      id: 'context_review',
      title: 'Review consult and context',
      objective: 'Ground the mission in persona and current context.',
      node_type: 'analysis',
      assigned_worker: null,
      depends_on: [],
      status: 'completed',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: ['memory_context_review'],
    },
    {
      id: 'data_selection',
      title: 'Resolve mission inputs and data adapters',
      objective: 'Select the local workspace input adapter.',
      node_type: 'data_selection',
      assigned_worker: null,
      depends_on: ['context_review'],
      status: 'completed',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: ['adapter_workspace_scan'],
    },
    {
      id: 'primary_work',
      title: 'Execute the primary worker',
      objective: 'Run codex against the proving mission brief.',
      node_type: 'implementation',
      assigned_worker: 'codex',
      depends_on: ['data_selection'],
      status: 'completed',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: ['proof://repo-change-note', 'file://repo-change.ts'],
    },
    {
      id: 'verification_gate',
      title: 'Run verification gate',
      objective: 'Verify the result against the checklist.',
      node_type: 'verification',
      assigned_worker: 'verifier',
      depends_on: ['primary_work'],
      status: 'completed',
      verification_gate: true,
      retry_count: 0,
      artifact_ids: ['proof://repo-change-note', 'file://repo-change.ts'],
    },
    {
      id: 'final_report',
      title: 'Prepare final owner report',
      objective: 'Emit the final proving-mission report artifact.',
      node_type: 'report',
      assigned_worker: null,
      depends_on: ['verification_gate'],
      status: 'completed',
      verification_gate: false,
      retry_count: 0,
      artifact_ids: ['report://repo-change/final'],
    },
  ],
};

const runtimeBundle: RuntimeSessionBundle = {
  session: {
    id: 'session_program_example',
    mission_id: workerTaskInput.mission_id,
    mission_definition_id: missionDefinition.id,
    acceptance_profile_id: missionDefinition.acceptance.id,
    report_contract_id: missionDefinition.report_contract.id,
    acceptance_run_id: `${missionDefinition.acceptance.id}:${workerTaskInput.mission_id}`,
    final_report_artifact_id: 'artifact_final_report',
    workspace_root: process.cwd(),
    owner: 'example-owner',
    status: 'completed',
    checkpoint_ids: ['checkpoint_after_primary_work', 'checkpoint_after_verification'],
    created_at: now,
    updated_at: now,
  },
  processes: [
    {
      id: 'proc_repo_change',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      actor: 'codex',
      command: 'codex',
      args: ['exec', '--json', '[prompt]'],
      cwd: process.cwd(),
      status: 'succeeded',
      exit_code: 0,
      stdout_artifact_id: 'artifact_stdout',
      stderr_artifact_id: null,
      started_at: now + 5_000,
      completed_at: now + 20_000,
    },
  ],
  worker_tasks: [
    {
      id: 'worker_task_primary',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: 'primary_work',
      worker: 'codex',
      requested_worker: 'codex',
      fallback_from: null,
      execution_mode: 'cli',
      objective: 'Implement the proving-mission report contract for this repo.',
      playbook_id: playbook.id,
      status: 'success',
      summary: workerTaskResult.summary,
      artifact_refs: ['proof://repo-change-note', 'file://repo-change.ts'],
      check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
      retry_recommendation: null,
      invocation_command: 'codex',
      invocation_args: ['exec', '--json', '[prompt]'],
      verifier_owned: false,
      created_at: now,
      updated_at: now + 20_000,
      completed_at: now + 20_000,
    },
    {
      id: 'worker_task_verifier',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: 'verification_gate',
      worker: 'verifier',
      requested_worker: 'verifier',
      fallback_from: null,
      execution_mode: 'manager_owned',
      objective: 'Verify the proving mission result.',
      playbook_id: playbook.id,
      status: 'success',
      summary: 'Verification passed with the expected evidence.',
      artifact_refs: ['proof://repo-change-note', 'file://repo-change.ts'],
      check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
      retry_recommendation: null,
      invocation_command: 'verifier',
      invocation_args: [playbook.id, 'verification_gate'],
      verifier_owned: true,
      created_at: now + 21_000,
      updated_at: now + 25_000,
      completed_at: now + 25_000,
    },
  ],
  artifacts: [
    {
      id: 'artifact_note',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      acceptance_run_id: `${missionDefinition.acceptance.id}:${workerTaskInput.mission_id}`,
      task_id: 'primary_work',
      kind: 'report',
      uri: 'proof://repo-change-note',
      description: 'Owner-facing summary.',
      checksum: null,
      source: 'codex',
      created_at: now + 18_000,
    },
    {
      id: 'artifact_file',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      acceptance_run_id: `${missionDefinition.acceptance.id}:${workerTaskInput.mission_id}`,
      task_id: 'primary_work',
      kind: 'file',
      uri: 'file://repo-change.ts',
      description: 'Implementation artifact.',
      checksum: null,
      source: 'codex',
      created_at: now + 18_500,
    },
    {
      id: 'artifact_stdout',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      acceptance_run_id: `${missionDefinition.acceptance.id}:${workerTaskInput.mission_id}`,
      task_id: 'primary_work',
      kind: 'stdout',
      uri: 'runtime://proc_repo_change/stdout',
      description: 'Structured worker stdout.',
      checksum: null,
      source: 'codex',
      created_at: now + 20_000,
    },
    {
      id: 'artifact_final_report',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      acceptance_run_id: `${missionDefinition.acceptance.id}:${workerTaskInput.mission_id}`,
      task_id: 'final_report',
      kind: 'report',
      uri: 'report://repo-change/final',
      description: 'Final mission report emitted after verification.',
      checksum: null,
      source: 'manager',
      created_at: now + 26_000,
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint_after_primary_work',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      label: 'after_primary_work',
      artifact_ids: ['artifact_note', 'artifact_file'],
      restore_supported: true,
      snapshot_path: 'C:/tmp/best-brain-runtime/session_program_example-after_primary_work.json',
      created_at: now + 20_000,
    },
    {
      id: 'checkpoint_after_verification',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      label: 'after_verification',
      artifact_ids: ['artifact_note', 'artifact_file', 'artifact_final_report'],
      restore_supported: false,
      snapshot_path: 'C:/tmp/best-brain-runtime/session_program_example-after_verification.json',
      created_at: now + 26_000,
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
    {
      id: 'event_final_report_emitted',
      session_id: 'session_program_example',
      mission_id: workerTaskInput.mission_id,
      task_id: 'final_report',
      event_type: 'final_report_emitted',
      actor: 'manager',
      detail: 'Recorded the final mission report artifact.',
      data: {
        artifact_id: 'artifact_final_report',
        uri: 'report://repo-change/final',
      },
      created_at: now + 26_000,
    },
  ],
};

const missionConsoleView: MissionConsoleView = {
  mission_id: workerTaskInput.mission_id,
  goal: 'Implement the proving-mission report contract for this repo.',
  status: 'verified_complete',
  mission_graph: missionGraph,
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
      id: 'timeline_verification',
      mission_id: workerTaskInput.mission_id,
      source: 'verifier',
      status: 'completed',
      title: 'Verification passed',
      detail: 'Verifier accepted the evidence and checks.',
      artifact_ids: ['artifact_final_report'],
      created_at: now + 26_000,
    },
  ],
  workers: [
    {
      worker: 'codex',
      status: 'completed',
      current_task_id: null,
      current_task_title: null,
      last_update_at: now + 20_000,
    },
    {
      worker: 'verifier',
      status: 'completed',
      current_task_id: null,
      current_task_title: null,
      last_update_at: now + 25_000,
    },
  ],
  artifacts: runtimeBundle.artifacts,
  final_report_artifact: runtimeBundle.artifacts.find((artifact) => artifact.id === 'artifact_final_report') ?? null,
  verdict: {
    mission_id: workerTaskInput.mission_id,
    status: 'verified_complete',
    summary: 'The proving mission completed with a final report artifact.',
    evidence_count: 2,
    checks_passed: 2,
    checks_total: 2,
  },
  operator_review: {
    status: 'approved',
    note: 'The control-room operator accepted the verified verdict.',
    updated_at: now + 27_000,
  },
  allowed_actions: ['retry_mission', 'approve_verdict', 'reject_verdict'],
  updated_at: now + 27_000,
};

const dashboardView: ControlRoomDashboardView = {
  latest_mission_id: workerTaskInput.mission_id,
  missions: [{
    mission_id: workerTaskInput.mission_id,
    goal: missionConsoleView.goal,
    status: missionConsoleView.status,
    selected_worker: 'codex',
    retryable: false,
    final_message: 'The proving mission completed with a final report artifact.',
    updated_at: now + 27_000,
  }],
};

const programScorecard = buildProgramScorecard({
  generated_at: EXAMPLE_GENERATED_AT,
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
    shell_primary_pass: true,
    mission_brief_completeness: 100,
    goal_ambiguity_detection: true,
    false_complete_count: 0,
    blocked_with_correct_reason_rate: 100,
    worker_invocation_pass_rate: 100,
    artifact_lineage_completeness: 100,
    verifier_worker_path: true,
    runtime_session_capture: true,
    checkpoint_capture: true,
    checkpoint_restore_capture: true,
    checkpoint_restore_breadth: 100,
  },
  proving_harness: {
    proving_mission_definition_valid: true,
    supported_definition_count: 2,
    generic_acceptance_harness_pass_rate: 100,
    blocked_reason_accuracy: 100,
    report_contract_completeness: 100,
    adapter_selection_correctness: 100,
    mission_demo_without_hidden_steps: true,
  },
  phase4_proof: {
    success_run_pass: true,
    blocked_with_correct_reason: true,
    retryable_verification_failed: true,
    final_report_artifact_present: true,
    market_data_evidence_present: true,
    latest_verified_mission_reused: true,
  },
  actual_mission_proof: {
    single_goal_manager_led_pass: true,
    persona_memory_applied: true,
    manager_generated_plan: true,
    worker_control_end_to_end: true,
    no_demo_shortcut_path: true,
  },
  phase6_repeatability_proof: {
    repeated_run_count: 4,
    repeatable_verified_complete_rate: 100,
    memory_reuse_citation_rate: 100,
    retry_recovery_rate: 100,
    blocked_with_correct_reason_rate: 100,
    false_complete_count: 0,
    no_hidden_human_steps: true,
  },
  control_room_proof: {
    control_room_launch_pass: true,
    mission_console_visibility_completeness: 100,
    control_room_retry_pass: true,
    control_room_review_audit_pass: true,
    kernel_rail_bypass_detected: false,
  },
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'worker-task-input.json'), JSON.stringify(workerTaskInput, null, 2));
fs.writeFileSync(path.join(outputDir, 'worker-task-result.json'), JSON.stringify(workerTaskResult, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-task-graph.json'), JSON.stringify(missionGraph, null, 2));
fs.writeFileSync(path.join(outputDir, 'runtime-session-bundle.json'), JSON.stringify(runtimeBundle, null, 2));
fs.writeFileSync(path.join(outputDir, 'input-adapter-decision.json'), JSON.stringify(inputAdapterDecisions[0], null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-playbook.json'), JSON.stringify(playbook, null, 2));
fs.writeFileSync(path.join(outputDir, 'proving-mission-definition.json'), JSON.stringify(missionDefinition, null, 2));
fs.writeFileSync(path.join(outputDir, 'acceptance-run-definition.json'), JSON.stringify(acceptanceRun, null, 2));
fs.writeFileSync(path.join(outputDir, 'acceptance-run-result.json'), JSON.stringify(acceptanceRunResult, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-console-dashboard.json'), JSON.stringify(dashboardView, null, 2));
fs.writeFileSync(path.join(outputDir, 'mission-console-view.json'), JSON.stringify(missionConsoleView, null, 2));
fs.writeFileSync(path.join(outputDir, 'program-scorecard.json'), JSON.stringify(programScorecard, null, 2));

console.log(JSON.stringify({
  output_dir: outputDir,
  files: [
    'worker-task-input.json',
    'worker-task-result.json',
    'mission-task-graph.json',
    'runtime-session-bundle.json',
    'input-adapter-decision.json',
    'mission-playbook.json',
    'proving-mission-definition.json',
    'acceptance-run-definition.json',
    'acceptance-run-result.json',
    'mission-console-dashboard.json',
    'mission-console-view.json',
    'program-scorecard.json',
  ],
}, null, 2));

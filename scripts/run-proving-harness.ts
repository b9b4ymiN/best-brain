import fs from 'fs';
import path from 'path';
import { evaluateAcceptanceRun, summarizeAcceptanceHarness } from '../src/proving/harness.ts';
import { resolveProvingMissionDefinition, selectInputAdapters } from '../src/proving/registry.ts';
import type { MissionPlaybook } from '../src/playbooks/types.ts';
import type { AcceptanceRunDefinition, InputAdapterDefinition, MissionReportDocument } from '../src/proving/types.ts';

const genericPlaybook: MissionPlaybook = {
  id: 'playbook_repo_change_mission',
  slug: 'repo-change-mission',
  title: 'Repo change mission',
  scope: 'mission',
  mission_kind: 'repo_change_mission',
  required_exact_keys: [],
  preferred_workers: ['codex', 'verifier'],
  planning_hints: ['Keep the proof chain intact.'],
  report_format: 'Concise status, evidence, risks, next action.',
  verifier_checklist: [
    {
      id: 'check_note_evidence',
      name: 'Owner-facing note evidence exists',
      required: true,
      artifact_kind: 'note',
      detail: 'The run must produce an owner-facing note.',
    },
    {
      id: 'check_code_artifact',
      name: 'Code or test artifact exists',
      required: true,
      artifact_kind: 'file',
      detail: 'Repo changes must produce a code or test artifact.',
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

const stockPlaybook: MissionPlaybook = {
  ...genericPlaybook,
  id: 'playbook_thai_equities_daily_scanner',
  slug: 'thai-equities-daily-scanner',
  title: 'Thai equities daily stock scanner',
  mission_kind: 'thai_equities_daily_scanner',
  preferred_workers: ['claude', 'shell', 'verifier'],
  verifier_checklist: [
    {
      id: 'check_note_evidence',
      name: 'Owner-facing note evidence exists',
      required: true,
      artifact_kind: 'note',
      detail: 'The run must produce an owner-facing note.',
    },
    {
      id: 'check_market_data_artifact',
      name: 'Market data evidence exists',
      required: true,
      artifact_kind: 'other',
      detail: 'Stock-scanner runs must point to the source used.',
    },
  ],
};

const genericDefinition = resolveProvingMissionDefinition(genericPlaybook);
const stockDefinition = resolveProvingMissionDefinition(stockPlaybook);

function reportDocument(contractId: string, verificationStatus: MissionReportDocument['verification_status'], blockedReason: string): MissionReportDocument {
  return {
    contract_id: contractId,
    artifact_ref: `report://example/${contractId}`,
    verification_status: verificationStatus,
    evidence: blockedReason ? [] : [{ type: 'note', ref: 'proof://note' }],
    verification_checks: blockedReason ? [] : [{ name: 'Owner-facing note evidence exists', passed: true }],
    sections: {
      objective: 'Execute the proving mission.',
      result_summary: blockedReason ? `Mission blocked: ${blockedReason}` : 'Mission completed with proof.',
      evidence_summary: blockedReason ? 'No evidence due to blocked input.' : 'note:proof://note',
      checks_summary: blockedReason ? 'Blocked before verification checks ran.' : 'Owner-facing note evidence exists:pass',
      blocked_or_rejected_reason: blockedReason || 'None',
      remaining_risks: blockedReason ? 'Input availability must be resolved before retry.' : 'No unresolved blockers.',
      next_action: blockedReason ? 'Provide a valid input or adapter.' : 'Reuse the verified mission in the next run.',
    },
  };
}

const successRun: AcceptanceRunDefinition = {
  id: 'run_success_repo_change',
  mission_definition_id: genericDefinition.id,
  goal: 'Implement a repo change and finish with proof.',
  run_class: 'success',
  input_fixtures: { cwd: process.cwd() },
  expected_path: ['context_review', 'data_selection', 'primary_work', 'verification_gate', 'final_report'],
  expected_final_status: 'verified_complete',
  expected_evidence_types: ['note', 'file'],
  expected_check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
  expected_blocked_reason: null,
  hidden_human_steps_allowed: false,
};

const blockedRun: AcceptanceRunDefinition = {
  id: 'run_blocked_market_unavailable',
  mission_definition_id: stockDefinition.id,
  goal: 'Prepare a proving mission that depends on live market data.',
  run_class: 'blocked_with_correct_reason',
  input_fixtures: {},
  expected_path: ['context_review', 'data_selection'],
  expected_final_status: 'blocked',
  expected_evidence_types: [],
  expected_check_names: [],
  expected_blocked_reason: 'no_available_input_adapter',
  hidden_human_steps_allowed: false,
};

const staleRun: AcceptanceRunDefinition = {
  id: 'run_blocked_market_stale',
  mission_definition_id: stockDefinition.id,
  goal: 'Prepare a proving mission with stale market data.',
  run_class: 'stale_or_invalid_input_blocked',
  input_fixtures: {},
  expected_path: ['context_review', 'data_selection'],
  expected_final_status: 'blocked',
  expected_evidence_types: [],
  expected_check_names: [],
  expected_blocked_reason: 'stale_input',
  hidden_human_steps_allowed: false,
};

const retryableRun: AcceptanceRunDefinition = {
  id: 'run_retryable_repo_change',
  mission_definition_id: genericDefinition.id,
  goal: 'Implement a repo change, fail verification, and remain retryable.',
  run_class: 'verification_failed_retryable',
  input_fixtures: { cwd: process.cwd() },
  expected_path: ['context_review', 'data_selection', 'primary_work', 'verification_gate', 'repair'],
  expected_final_status: 'verification_failed',
  expected_evidence_types: ['note'],
  expected_check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
  expected_blocked_reason: null,
  hidden_human_steps_allowed: false,
};

const successAdapters = selectInputAdapters(genericDefinition.required_inputs, [
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
    notes: [],
  },
]);

const unavailableMarketAdapters = selectInputAdapters(stockDefinition.required_inputs, []);

const staleMarketAdapters = selectInputAdapters(stockDefinition.required_inputs, [{
  id: 'adapter_market_stale',
  title: 'Stale live market source',
  family: 'market_data',
  source_kind: 'live_market_feed',
  available: true,
  freshness_ms: 24 * 60 * 60 * 1000,
  confidence: 0.9,
  blocking_reason: null,
  provides_inputs: ['live_market_snapshot'],
  notes: ['Deliberately stale for acceptance testing.'],
}] satisfies InputAdapterDefinition[]);

const retryableAdapters = successAdapters;

const results = [
  evaluateAcceptanceRun({
    definition: genericDefinition,
    run: successRun,
    adapter_decisions: successAdapters,
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
      ...reportDocument(genericDefinition.report_contract.id, 'verified_complete', ''),
      evidence: [
        { type: 'note', ref: 'proof://repo-change-note' },
        { type: 'file', ref: 'file://repo-change.ts' },
      ],
      verification_checks: [
        { name: 'Owner-facing note evidence exists', passed: true },
        { name: 'Code or test artifact exists', passed: true },
      ],
      sections: {
        ...reportDocument(genericDefinition.report_contract.id, 'verified_complete', '').sections,
        evidence_summary: 'note:proof://repo-change-note | file:file://repo-change.ts',
        checks_summary: 'Owner-facing note evidence exists:pass | Code or test artifact exists:pass',
      },
    },
    hidden_human_steps_detected: false,
  }),
  evaluateAcceptanceRun({
    definition: stockDefinition,
    run: blockedRun,
    adapter_decisions: unavailableMarketAdapters,
    actual_final_status: 'blocked',
    blocked_reason: 'no_available_input_adapter',
    evidence: [],
    verification_checks: [],
    report: reportDocument(stockDefinition.report_contract.id, 'blocked', 'no_available_input_adapter'),
    hidden_human_steps_detected: false,
  }),
  evaluateAcceptanceRun({
    definition: stockDefinition,
    run: staleRun,
    adapter_decisions: staleMarketAdapters,
    actual_final_status: 'blocked',
    blocked_reason: 'stale_input',
    evidence: [],
    verification_checks: [],
    report: reportDocument(stockDefinition.report_contract.id, 'blocked', 'stale_input'),
    hidden_human_steps_detected: false,
  }),
  evaluateAcceptanceRun({
    definition: genericDefinition,
    run: retryableRun,
    adapter_decisions: retryableAdapters,
    actual_final_status: 'verification_failed',
    blocked_reason: null,
    evidence: [
      { type: 'note', ref: 'proof://retryable-note' },
    ],
    verification_checks: [
      { name: 'Owner-facing note evidence exists', passed: true },
      { name: 'Code or test artifact exists', passed: false },
    ],
    report: {
      ...reportDocument(genericDefinition.report_contract.id, 'verification_failed', ''),
      evidence: [{ type: 'note', ref: 'proof://retryable-note' }],
      verification_checks: [
        { name: 'Owner-facing note evidence exists', passed: true },
        { name: 'Code or test artifact exists', passed: false },
      ],
      sections: {
        ...reportDocument(genericDefinition.report_contract.id, 'verification_failed', '').sections,
        checks_summary: 'Owner-facing note evidence exists:pass | Code or test artifact exists:fail',
      },
    },
    hidden_human_steps_detected: false,
  }),
];

const summary = summarizeAcceptanceHarness(results);
const payload = {
  generated_at: new Date().toISOString(),
  mission_definitions: [genericDefinition, stockDefinition],
  acceptance_runs: [successRun, blockedRun, staleRun, retryableRun],
  results,
  summary: {
    proving_mission_definition_valid: true,
    supported_definition_count: 2,
    generic_acceptance_harness_pass_rate: summary.pass_rate,
    blocked_reason_accuracy: summary.blocked_reason_accuracy,
    report_contract_completeness: summary.report_contract_completeness,
    adapter_selection_correctness: summary.adapter_selection_correctness,
    mission_demo_without_hidden_steps: summary.hidden_step_failures === 0,
  },
};

const outputPath = path.resolve(process.cwd(), 'artifacts/proving-harness.latest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));

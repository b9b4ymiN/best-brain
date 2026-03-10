import { describe, expect, test } from 'bun:test';
import { evaluateAcceptanceRun, summarizeAcceptanceHarness } from '../src/proving/harness.ts';
import { resolveProvingMissionDefinition, selectInputAdapters } from '../src/proving/registry.ts';
import type { MissionPlaybook } from '../src/playbooks/types.ts';

const repoPlaybook: MissionPlaybook = {
  id: 'playbook_repo_change_mission',
  slug: 'repo-change-mission',
  title: 'Repo change mission',
  scope: 'mission',
  mission_kind: 'repo_change_mission',
  required_exact_keys: [],
  preferred_workers: ['codex', 'verifier'],
  planning_hints: ['Keep the proof chain intact.'],
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
      instruction: 'Collect missing file evidence and retry.',
      max_retries: 2,
    },
  ],
};

const stockPlaybook: MissionPlaybook = {
  ...repoPlaybook,
  id: 'playbook_thai_equities_daily_scanner',
  slug: 'thai-equities-daily-scanner',
  title: 'Thai equities daily stock scanner',
  mission_kind: 'thai_equities_daily_scanner',
  preferred_workers: ['claude', 'shell', 'verifier'],
};

describe('proving mission framework', () => {
  test('resolves more than one proving mission definition without manager stock branches', () => {
    const repoDefinition = resolveProvingMissionDefinition(repoPlaybook);
    const stockDefinition = resolveProvingMissionDefinition(stockPlaybook);

    expect(repoDefinition.id).toContain('repo-change');
    expect(stockDefinition.id).toContain('thai_equities_daily_scanner');
    expect(stockDefinition.required_inputs.some((input) => input.family === 'market_data')).toBe(true);
    expect(repoDefinition.required_inputs.some((input) => input.family === 'local_repo_or_runtime')).toBe(true);
  });

  test('selects required local adapters and blocks stale market adapters with the correct reason', () => {
    const repoDefinition = resolveProvingMissionDefinition(repoPlaybook);
    const stockDefinition = resolveProvingMissionDefinition(stockPlaybook);

    const repoDecisions = selectInputAdapters(repoDefinition.required_inputs, [{
      id: 'adapter_workspace_scan',
      title: 'Workspace scan',
      family: 'local_repo_or_runtime',
      source_kind: 'workspace_scan',
      available: true,
      freshness_ms: null,
      confidence: 0.9,
      blocking_reason: null,
      provides_inputs: ['workspace_context'],
      notes: [],
    }]);
    const staleDecisions = selectInputAdapters(stockDefinition.required_inputs, [{
      id: 'adapter_market_stale',
      title: 'Stale market source',
      family: 'market_data',
      source_kind: 'live_market_feed',
      available: true,
      freshness_ms: 24 * 60 * 60 * 1000,
      confidence: 0.9,
      blocking_reason: null,
      provides_inputs: ['live_market_snapshot'],
      notes: [],
    }]);

    expect(repoDecisions[0]?.decision).toBe('selected');
    expect(staleDecisions.find((decision) => decision.input_id === 'live_market_snapshot')?.blocked_reason).toBe('stale_input');
  });

  test('generic acceptance harness evaluates success and blocked runs with full report coverage', () => {
    const definition = resolveProvingMissionDefinition(repoPlaybook);
    const adapters = selectInputAdapters(definition.required_inputs, [{
      id: 'adapter_workspace_scan',
      title: 'Workspace scan',
      family: 'local_repo_or_runtime',
      source_kind: 'workspace_scan',
      available: true,
      freshness_ms: null,
      confidence: 0.9,
      blocking_reason: null,
      provides_inputs: ['workspace_context'],
      notes: [],
    }]);

    const success = evaluateAcceptanceRun({
      definition,
      run: {
        id: 'run_success',
        mission_definition_id: definition.id,
        goal: 'Implement the repo change.',
        run_class: 'success',
        input_fixtures: {},
        expected_path: ['context_review', 'data_selection', 'primary_work', 'verification_gate', 'final_report'],
        expected_final_status: 'verified_complete',
        expected_evidence_types: ['note', 'file'],
        expected_check_names: ['Owner-facing note evidence exists', 'Code or test artifact exists'],
        expected_blocked_reason: null,
        hidden_human_steps_allowed: false,
      },
      adapter_decisions: adapters,
      actual_final_status: 'verified_complete',
      blocked_reason: null,
      evidence: [
        { type: 'note', ref: 'proof://note' },
        { type: 'file', ref: 'file://change.ts' },
      ],
      verification_checks: [
        { name: 'Owner-facing note evidence exists', passed: true },
        { name: 'Code or test artifact exists', passed: true },
      ],
      report: {
        contract_id: definition.report_contract.id,
        artifact_ref: 'report://success',
        verification_status: 'verified_complete',
        evidence: [
          { type: 'note', ref: 'proof://note' },
          { type: 'file', ref: 'file://change.ts' },
        ],
        verification_checks: [
          { name: 'Owner-facing note evidence exists', passed: true },
          { name: 'Code or test artifact exists', passed: true },
        ],
        sections: {
          objective: 'Implement the repo change.',
          result_summary: 'Mission completed with proof.',
          evidence_summary: 'note:proof://note | file:file://change.ts',
          checks_summary: 'Owner-facing note evidence exists:pass | Code or test artifact exists:pass',
          blocked_or_rejected_reason: 'None',
          remaining_risks: 'No unresolved blockers.',
          next_action: 'Reuse the verified mission in the next run.',
        },
      },
      hidden_human_steps_detected: false,
    });

    const blocked = evaluateAcceptanceRun({
      definition: resolveProvingMissionDefinition(stockPlaybook),
      run: {
        id: 'run_blocked',
        mission_definition_id: 'mission_definition_thai_equities_daily_scanner',
        goal: 'Run the stock scanner.',
        run_class: 'blocked_with_correct_reason',
        input_fixtures: {},
        expected_path: ['context_review', 'data_selection'],
        expected_final_status: 'blocked',
        expected_evidence_types: [],
        expected_check_names: [],
        expected_blocked_reason: 'no_available_input_adapter',
        hidden_human_steps_allowed: false,
      },
      adapter_decisions: [{
        input_id: 'live_market_snapshot',
        family: 'market_data',
        decision: 'blocked',
        selected_adapter_id: null,
        reason: 'Required input live_market_snapshot is blocked: no_available_input_adapter.',
        blocked_reason: 'no_available_input_adapter',
        considered: [],
      }],
      actual_final_status: 'blocked',
      blocked_reason: 'no_available_input_adapter',
      evidence: [],
      verification_checks: [],
      report: {
        contract_id: 'report_contract_thai_equities_daily_scanner',
        artifact_ref: 'report://blocked',
        verification_status: 'blocked',
        evidence: [],
        verification_checks: [],
        sections: {
          objective: 'Run the stock scanner.',
          result_summary: 'Mission blocked.',
          evidence_summary: 'No evidence due to blocked input.',
          checks_summary: 'Blocked before verification checks ran.',
          blocked_or_rejected_reason: 'no_available_input_adapter',
          remaining_risks: 'Input availability must be resolved.',
          next_action: 'Provide a valid input adapter.',
        },
      },
      hidden_human_steps_detected: false,
    });

    const summary = summarizeAcceptanceHarness([success, blocked]);
    expect(success.passed).toBe(true);
    expect(blocked.passed).toBe(true);
    expect(summary.pass_rate).toBe(100);
    expect(summary.blocked_reason_accuracy).toBe(100);
    expect(summary.report_contract_completeness).toBe(100);
    expect(summary.adapter_selection_correctness).toBe(100);
  });
});

import { describe, expect, test } from 'bun:test';
import { WorkerFabric } from '../src/workers/fabric.ts';
import type { WorkerAdapter, VerifierAdapter } from '../src/manager/adapters/types.ts';
import type { ExecutionRequest, VerificationRequest, WorkerExecutionResult } from '../src/manager/types.ts';

class FakeWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(): Promise<WorkerExecutionResult> {
    return this.result;
  }
}

class FakeVerifierAdapter implements VerifierAdapter {
  readonly response: VerificationRequest;

  constructor(response: VerificationRequest) {
    this.response = response;
  }

  async review(): Promise<VerificationRequest> {
    return this.response;
  }
}

function makeExecutionRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    mission_id: 'mission_worker_fabric',
    mission_kind: 'general_task',
    mission_definition_id: 'mission_definition_general_task',
    report_contract_id: 'report_contract_general_task',
    task_id: 'primary_work',
    task_title: 'Execute the primary worker',
    selected_worker: 'codex',
    shell_command: null,
    prompt: [
      'You are the primary worker inside best-brain manager alpha.',
      'Constraints: Stay grounded | Return JSON only',
    ].join('\n'),
    cwd: process.cwd(),
    expected_artifacts: ['note'],
    context_citations: [],
    playbook_id: 'playbook_general-task',
    playbook: {
      id: 'playbook_general-task',
      slug: 'general-task',
      title: 'General task playbook',
      scope: 'mission',
      mission_kind: 'general_task',
      preferred_workers: ['codex', 'verifier'],
      planning_hints: ['Clarify, execute, verify, report.'],
      report_format: 'Short status, proof, next action.',
      verifier_checklist: [{
        id: 'check_note',
        name: 'Owner-facing note evidence exists',
        required: true,
        artifact_kind: 'note',
        detail: 'Need a note artifact.',
      }],
      repair_heuristics: [],
    },
    report_contract: {
      id: 'report_contract_general_task',
      title: 'General task report',
      required_sections: [
        'objective',
        'result_summary',
        'evidence_summary',
        'checks_summary',
        'blocked_or_rejected_reason',
        'remaining_risks',
        'next_action',
      ],
      artifact_kind: 'report',
      requires_verification_evidence: true,
    },
    input_adapter_decisions: [{
      input_id: 'workspace_context',
      family: 'local_repo_or_runtime',
      decision: 'selected',
      selected_adapter_id: 'adapter_workspace_scan',
      reason: 'Selected adapter_workspace_scan for required input workspace_context.',
      blocked_reason: null,
      considered: [],
    }],
    mission_graph: {
      mission_id: 'mission_worker_fabric',
      mission_kind: 'general_task',
      playbook_id: 'playbook_general-task',
      created_at: 1,
      updated_at: 1,
      nodes: [],
    },
    verification_required: true,
    ...overrides,
  };
}

describe('worker fabric', () => {
  test('reports required Phase 2 worker coverage from the registry', () => {
    const fabric = new WorkerFabric({
      claude: new FakeWorkerAdapter('claude', {
        summary: 'ok',
        status: 'success',
        artifacts: [],
        proposed_checks: [],
        raw_output: '{}',
      }),
      codex: new FakeWorkerAdapter('codex', {
        summary: 'ok',
        status: 'success',
        artifacts: [],
        proposed_checks: [],
        raw_output: '{}',
      }),
      shell: new FakeWorkerAdapter('shell', {
        summary: 'ok',
        status: 'success',
        artifacts: [],
        proposed_checks: [],
        raw_output: '{}',
      }),
    }, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));

    const snapshot = fabric.catalogSnapshot();
    expect(snapshot.required).toEqual(['claude', 'codex', 'shell', 'verifier']);
    expect(snapshot.available).toEqual(['claude', 'codex', 'shell', 'verifier']);
    expect(snapshot.missing).toEqual([]);
  });

  test('normalizes primary worker results into validated worker-task records with synthetic invocation metadata', async () => {
    const fabric = new WorkerFabric({
      codex: new FakeWorkerAdapter('codex', {
        summary: 'Implemented a grounded change.',
        status: 'success',
        artifacts: [{ type: 'note', ref: 'worker://codex/success', description: 'Grounded note.' }],
        proposed_checks: [{ name: 'grounded-output', passed: true }],
        raw_output: '{"summary":"Implemented a grounded change."}',
      }),
    }, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));

    const dispatch = await fabric.dispatchPrimary(makeExecutionRequest());
    expect(dispatch.task_input.worker).toBe('codex');
    expect(dispatch.task_result.worker).toBe('codex');
    expect(dispatch.task_result.status).toBe('success');
    expect(dispatch.task_result.invocation?.command).toBe('codex');
    expect(dispatch.manager_result.process_output?.stdout).toContain('Implemented a grounded change.');
  });

  test('turns verifier review into a first-class worker task result', async () => {
    const fabric = new WorkerFabric({}, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'Verification failed until file evidence exists.',
      evidence: [{ type: 'note', ref: 'worker://codex/note', description: 'Note only.' }],
      verification_checks: [{ name: 'Code or test artifact exists', passed: false }],
      status: 'verification_failed',
    }));

    const dispatch = await fabric.dispatchVerifier(makeExecutionRequest(), {
      summary: 'Note-only result.',
      status: 'needs_retry',
      artifacts: [{ type: 'note', ref: 'worker://codex/note', description: 'Note only.' }],
      proposed_checks: [{ name: 'note-only', passed: true }],
      raw_output: '{}',
    });

    expect(dispatch.task_input.worker).toBe('verifier');
    expect(dispatch.task_input.task_id).toBe('verification_gate');
    expect(dispatch.task_result.worker).toBe('verifier');
    expect(dispatch.task_result.status).toBe('needs_retry');
    expect(dispatch.task_result.invocation?.transport).toBe('manager_owned');
  });
});

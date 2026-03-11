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

class SequenceWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly results: WorkerExecutionResult[];
  calls = 0;

  constructor(name: ExecutionRequest['selected_worker'], results: WorkerExecutionResult[]) {
    this.name = name;
    this.results = results;
  }

  async execute(): Promise<WorkerExecutionResult> {
    const index = Math.min(this.calls, this.results.length - 1);
    this.calls += 1;
    return this.results[index]!;
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
      required_exact_keys: [],
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

  test('falls back from codex to claude when codex is provider-unavailable', async () => {
    const fabric = new WorkerFabric({
      codex: new FakeWorkerAdapter('codex', {
        summary: 'Codex provider is temporarily unavailable because the current account hit a usage limit.',
        status: 'failed',
        failure_kind: 'provider_unavailable',
        artifacts: [{ type: 'note', ref: 'worker://codex/provider-unavailable', description: 'usage limit' }],
        proposed_checks: [{ name: 'codex-provider-available', passed: false }],
        raw_output: 'usage limit',
      }),
      claude: new FakeWorkerAdapter('claude', {
        summary: 'Claude completed the task after fallback.',
        status: 'success',
        artifacts: [{ type: 'note', ref: 'worker://claude/fallback-success', description: 'fallback success' }],
        proposed_checks: [{ name: 'fallback-proof', passed: true }],
        raw_output: '{"summary":"Claude completed the task after fallback."}',
      }),
    }, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));

    const dispatch = await fabric.dispatchPrimary(makeExecutionRequest());
    expect(dispatch.requested_worker).toBe('codex');
    expect(dispatch.executed_worker).toBe('claude');
    expect(dispatch.manager_result.executed_worker).toBe('claude');
    expect(dispatch.manager_result.fallback_from).toBe('codex');
    expect(dispatch.manager_result.attempted_workers).toEqual(['codex', 'claude']);
    expect(dispatch.task_result.worker).toBe('claude');
  });

  test('does not fall back when the selected worker fails for task reasons', async () => {
    const fabric = new WorkerFabric({
      codex: new FakeWorkerAdapter('codex', {
        summary: 'Codex attempted the task and failed normal verification constraints.',
        status: 'failed',
        failure_kind: 'task_failed',
        artifacts: [{ type: 'note', ref: 'worker://codex/task-failed', description: 'task failed' }],
        proposed_checks: [{ name: 'task-complete', passed: false }],
        raw_output: 'task failed',
      }),
      claude: new FakeWorkerAdapter('claude', {
        summary: 'Claude should not run.',
        status: 'success',
        artifacts: [{ type: 'note', ref: 'worker://claude/should-not-run', description: 'unexpected' }],
        proposed_checks: [{ name: 'unexpected', passed: true }],
        raw_output: '{}',
      }),
    }, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));

    const dispatch = await fabric.dispatchPrimary(makeExecutionRequest());
    expect(dispatch.executed_worker).toBe('codex');
    expect(dispatch.manager_result.attempted_workers).toEqual(['codex']);
    expect(dispatch.manager_result.status).toBe('failed');
    expect(dispatch.task_result.worker).toBe('codex');
  });

  test('builds a primary chain that keeps browser/mail workers when configured in playbook preferences', () => {
    const fabric = new WorkerFabric({}, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));
    const request = makeExecutionRequest({
      selected_worker: 'browser',
      playbook: {
        ...makeExecutionRequest().playbook,
        preferred_workers: ['browser', 'mail', 'verifier'],
      },
    });

    expect(fabric.primaryWorkerChain(request)).toEqual(['browser', 'mail']);
  });

  test('retries transient worker-unavailable failures before succeeding on the same worker', async () => {
    const codexSequence = new SequenceWorkerAdapter('codex', [
      {
        summary: 'Codex worker is not available on this machine.',
        status: 'failed',
        failure_kind: 'worker_unavailable',
        artifacts: [{ type: 'note', ref: 'worker://codex/not-available', description: 'first failure' }],
        proposed_checks: [{ name: 'codex-cli-available', passed: false }],
        raw_output: 'not available',
      },
      {
        summary: 'Codex worker is not available on this machine.',
        status: 'failed',
        failure_kind: 'worker_unavailable',
        artifacts: [{ type: 'note', ref: 'worker://codex/not-available', description: 'second failure' }],
        proposed_checks: [{ name: 'codex-cli-available', passed: false }],
        raw_output: 'not available',
      },
      {
        summary: 'Codex recovered and completed after retries.',
        status: 'success',
        artifacts: [{ type: 'note', ref: 'worker://codex/recovered', description: 'success' }],
        proposed_checks: [{ name: 'worker-proof', passed: true }],
        raw_output: '{}',
      },
    ]);
    const fabric = new WorkerFabric({
      codex: codexSequence,
      claude: new FakeWorkerAdapter('claude', {
        summary: 'Claude should not run when codex recovers.',
        status: 'success',
        artifacts: [{ type: 'note', ref: 'worker://claude/should-not-run' }],
        proposed_checks: [{ name: 'unexpected', passed: true }],
        raw_output: '{}',
      }),
    }, new FakeVerifierAdapter({
      mission_id: 'mission_worker_fabric',
      summary: 'verified',
      evidence: [],
      verification_checks: [],
      status: 'verified_complete',
    }));

    const dispatch = await fabric.dispatchPrimary(makeExecutionRequest());
    expect(codexSequence.calls).toBe(3);
    expect(dispatch.executed_worker).toBe('codex');
    expect(dispatch.manager_result.status).toBe('success');
    expect(dispatch.manager_result.execution_attempts).toBe(3);
    expect(dispatch.manager_result.attempted_workers).toEqual(['codex']);
  });
});

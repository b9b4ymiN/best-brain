import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';

class StaticWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(_request: ExecutionRequest): Promise<WorkerExecutionResult> {
    return this.result;
  }
}
const runtime = new ManagerRuntime({
  workers: {
    shell: new StaticWorkerAdapter('shell', {
      summary: 'Shell worker produced a note without implementation-file evidence.',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://restore-smoke/shell-note', description: 'Shell proof note.' }],
      proposed_checks: [{ name: 'shell-note-present', passed: true }],
      raw_output: '{}',
    }),
    codex: new StaticWorkerAdapter('codex', {
      summary: 'Codex worker completed quickly but still no file evidence.',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://restore-smoke/codex-note', description: 'Codex proof note.' }],
      proposed_checks: [{ name: 'codex-note-present', passed: true }],
      raw_output: '{}',
    }),
  },
});

try {
  const result = await runtime.run({
    goal: 'Implement the repo change for this project and prove completion with evidence.',
    worker_preference: 'shell',
    mission_id: `mission_restore_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.decision.selected_worker !== 'shell') {
    throw new Error(`restore smoke expected selected worker shell, got ${String(result.decision.selected_worker)}`);
  }
  if (result.verification_result?.status !== 'verification_failed') {
    throw new Error(`restore smoke expected verification_failed, got ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (!result.runtime_bundle?.events.some((event) => event.event_type === 'checkpoint_restored')) {
    throw new Error('restore smoke expected runtime checkpoint restore evidence.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'shell' && task.status === 'success')) {
    throw new Error('restore smoke expected a shell worker task record.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'needs_retry')) {
    throw new Error('restore smoke expected a verifier retry task record.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

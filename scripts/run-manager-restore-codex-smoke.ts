import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { createTestBrain } from '../tests/helpers.ts';

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

const { brain, cleanup } = await createTestBrain();
const app = createApp(brain);
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

const runtime = new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
  workers: {
    codex: new StaticWorkerAdapter('codex', {
      summary: 'Implemented a repo change but returned only a note artifact.',
      status: 'success',
      artifacts: [{
        type: 'note',
        ref: `worker://codex/restore-smoke/${Date.now()}`,
        description: 'No file artifact exists yet.',
      }],
      proposed_checks: [{
        name: 'note-artifact-returned',
        passed: true,
      }],
      raw_output: '{"summary":"Implemented a repo change but returned only a note artifact."}',
    }),
  },
});

try {
  const result = await runtime.run({
    goal: 'Implement a repo change for this project.',
    worker_preference: 'codex',
    mission_id: `mission_restore_codex_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.verification_result?.status !== 'verification_failed') {
    throw new Error(`codex restore smoke expected verification_failed, got ${result.verification_result?.status ?? 'missing'}`);
  }
  if (!result.runtime_bundle?.events.some((event) => event.event_type === 'checkpoint_restored')) {
    throw new Error('codex restore smoke expected checkpoint_restored event');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'codex' && task.status === 'success')) {
    throw new Error('codex restore smoke expected a codex worker task record');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'needs_retry')) {
    throw new Error('codex restore smoke expected a verifier retry task record');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
  server.stop(true);
  cleanup();
}

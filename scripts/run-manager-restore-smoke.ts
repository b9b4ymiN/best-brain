import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Run `bun --version` and prove the repo change is complete for this project.',
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

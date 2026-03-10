import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Run `bun --version` locally and return a concise proof note.',
    worker_preference: 'shell',
    mission_id: `mission_shell_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.decision.selected_worker !== 'shell') {
    throw new Error(`shell manager smoke expected selected worker shell, got ${String(result.decision.selected_worker)}`);
  }
  if (result.worker_result?.status !== 'success') {
    throw new Error(`Shell manager smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Shell manager smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (result.runtime_bundle?.processes[0]?.command !== 'bun') {
    throw new Error('Shell manager smoke expected the runtime bundle to capture the bun command.');
  }
  if ((result.runtime_bundle?.checkpoints.length ?? 0) < 2) {
    throw new Error('Shell manager smoke expected runtime checkpoints.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

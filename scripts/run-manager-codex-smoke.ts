import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Plan the next mission by reviewing the current project status and return one concrete next action. Keep the workspace unchanged.',
    worker_preference: 'codex',
    mission_id: `mission_codex_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.worker_result?.status !== 'success') {
    throw new Error(`Codex manager smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Codex manager smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Use mail worker to draft an email to owner@example.local subject: Daily update body: Scanner finished and save evidence.',
    worker_preference: 'mail',
    mission_id: `mission_mail_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.decision.selected_worker !== 'mail') {
    throw new Error(`Mail manager smoke expected selected worker mail, got ${String(result.decision.selected_worker)}`);
  }
  if (result.worker_result?.status !== 'success') {
    throw new Error(`Mail manager smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Mail manager smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'mail' && task.status === 'success')) {
    throw new Error('Mail manager smoke expected a mail worker task record.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')) {
    throw new Error('Mail manager smoke expected a verifier worker task record.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

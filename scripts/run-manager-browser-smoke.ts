import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BrowserWorkerAdapter } from '../src/manager/adapters/browser.ts';

const runtime = new ManagerRuntime({
  workers: {
    browser: new BrowserWorkerAdapter({
      fetchImpl: async () => new Response(
        '<html><head><title>Example Domain</title></head><body><main>Browser smoke content.</main></body></html>',
        { status: 200 },
      ),
    }),
  },
});

try {
  const result = await runtime.run({
    goal: 'Use browser to open https://example.com, capture a screenshot, and save evidence.',
    worker_preference: 'browser',
    mission_id: `mission_browser_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.decision.selected_worker !== 'browser') {
    throw new Error(`Browser manager smoke expected selected worker browser, got ${String(result.decision.selected_worker)}`);
  }
  if (result.worker_result?.status !== 'success') {
    throw new Error(`Browser manager smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Browser manager smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'browser' && task.status === 'success')) {
    throw new Error('Browser manager smoke expected a browser worker task record.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')) {
    throw new Error('Browser manager smoke expected a verifier worker task record.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

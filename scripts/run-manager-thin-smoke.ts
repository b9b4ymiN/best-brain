import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Plan the next mission using the latest verified mission proof and owner preferences.',
    worker_preference: 'auto',
    dry_run: true,
    output_mode: 'json',
  });

  if (result.decision.kind === 'chat') {
    throw new Error('thin manager smoke expected task or mission classification');
  }
  if (!result.mission_brief.brain_trace_id.startsWith('trace_')) {
    throw new Error('thin manager smoke expected a retrieval trace id');
  }
  if (result.mission_brief.brain_citations.length === 0) {
    throw new Error('thin manager smoke expected manager-visible citations');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

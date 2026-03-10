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
  if (!result.mission_brief_validation.is_complete) {
    throw new Error(`thin manager smoke expected a complete mission brief, missing: ${result.mission_brief_validation.missing_fields.join(', ')}`);
  }
  if (result.goal_ambiguity.is_ambiguous) {
    throw new Error(`thin manager smoke did not expect an ambiguous goal: ${result.goal_ambiguity.reason}`);
  }
  if (!result.mission_brief.playbook.id) {
    throw new Error('thin manager smoke expected a resolved playbook');
  }
  if (!result.mission_graph.nodes.some((node) => node.id === 'context_review')) {
    throw new Error('thin manager smoke expected a mission graph with a context review node');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

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
  if (!result.mission_brief_validation.is_complete) {
    throw new Error(`Codex manager smoke expected a complete mission brief, missing: ${result.mission_brief_validation.missing_fields.join(', ')}`);
  }
  if (result.goal_ambiguity.is_ambiguous) {
    throw new Error(`Codex manager smoke did not expect an ambiguous goal: ${result.goal_ambiguity.reason}`);
  }
  if (!result.mission_brief.playbook.id || result.mission_graph.playbook_id !== result.mission_brief.playbook.id) {
    throw new Error('Codex manager smoke expected playbook and mission graph to stay aligned');
  }
  if (result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status !== 'completed') {
    throw new Error('Codex manager smoke expected the verification gate node to be completed');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

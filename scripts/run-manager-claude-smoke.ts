import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Plan the next mission by analyzing the current project status and return one concrete next action. Keep the workspace unchanged.',
    worker_preference: 'claude',
    mission_id: `mission_claude_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.worker_result?.status !== 'success') {
    throw new Error(`Claude manager smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Claude manager smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (!result.mission_brief_validation.is_complete) {
    throw new Error(`Claude manager smoke expected a complete mission brief, missing: ${result.mission_brief_validation.missing_fields.join(', ')}`);
  }
  if (result.goal_ambiguity.is_ambiguous) {
    throw new Error(`Claude manager smoke did not expect an ambiguous goal: ${result.goal_ambiguity.reason}`);
  }
  if (!result.mission_brief.playbook.id || result.mission_graph.playbook_id !== result.mission_brief.playbook.id) {
    throw new Error('Claude manager smoke expected playbook and mission graph to stay aligned');
  }
  if (result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status !== 'completed') {
    throw new Error('Claude manager smoke expected the verification gate node to be completed');
  }
  if (result.runtime_bundle?.processes[0]?.command !== 'claude') {
    throw new Error('Claude manager smoke expected the runtime bundle to capture the claude command.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.status === 'success')) {
    throw new Error('Claude manager smoke expected a claude worker task record.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')) {
    throw new Error('Claude manager smoke expected a verifier worker task record.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

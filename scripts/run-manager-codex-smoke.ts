import { ManagerRuntime } from '../src/manager/runtime.ts';

const runtime = new ManagerRuntime();

try {
  const result = await runtime.run({
    goal: 'Create a short verified report with one concrete next action using the latest verified mission proof and owner preferences. Keep the workspace unchanged.',
    worker_preference: 'codex',
    mission_id: `mission_codex_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  console.log(JSON.stringify(result, null, 2));

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
  if (result.decision.selected_worker !== 'codex') {
    throw new Error(`Codex manager smoke expected the manager to prefer codex, got ${result.decision.selected_worker ?? 'none'}.`);
  }
  if (!result.mission_brief.playbook.id || result.mission_graph.playbook_id !== result.mission_brief.playbook.id) {
    throw new Error('Codex manager smoke expected playbook and mission graph to stay aligned');
  }
  if (result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status !== 'completed') {
    throw new Error('Codex manager smoke expected the verification gate node to be completed');
  }
  const executedWorker = result.worker_result?.executed_worker ?? result.runtime_bundle?.worker_tasks.find((task) => task.task_id === 'primary_work')?.worker;
  if (executedWorker !== 'codex' && executedWorker !== 'claude') {
    throw new Error(`Codex manager smoke expected codex execution or a claude fallback, got ${executedWorker ?? 'unknown'}.`);
  }
  if (executedWorker === 'claude' && result.worker_result?.fallback_from !== 'codex') {
    throw new Error('Codex manager smoke expected claude fallback to record fallback_from=codex.');
  }
  if (!result.runtime_bundle?.processes[0]?.command || !['codex', 'claude'].includes(result.runtime_bundle.processes[0].command)) {
    throw new Error('Codex manager smoke expected the runtime bundle to capture either codex or a claude fallback command.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === executedWorker && task.status === 'success')) {
    throw new Error(`Codex manager smoke expected a successful ${executedWorker ?? 'worker'} task record.`);
  }
  if (executedWorker === 'claude' && !result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.requested_worker === 'codex')) {
    throw new Error('Codex manager smoke expected the claude fallback task to retain requested_worker=codex.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')) {
    throw new Error('Codex manager smoke expected a verifier worker task record.');
  }

} finally {
  await runtime.dispose();
}

import { ManagerRuntime } from '../src/manager/runtime.ts';
import { ShellCliAdapter } from '../src/manager/adapters/shell-cli.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';

class SmokeClaudeAdapter implements WorkerAdapter {
  readonly name = 'claude' as const;

  async execute(request: ExecutionRequest): Promise<WorkerExecutionResult> {
    return {
      summary: 'Claude analysis completed and prepared shell execution guidance.',
      status: 'success',
      failure_kind: null,
      artifacts: [{
        type: 'note',
        ref: `worker://claude/analysis/${request.mission_id}`,
        description: 'Manager-ready analysis for the following shell task.',
      }],
      proposed_checks: [{
        name: 'analysis-ready',
        passed: true,
        detail: 'Analysis output was produced before shell execution.',
      }],
      raw_output: '{"summary":"analysis complete"}',
      invocation: {
        command: 'claude-smoke',
        args: ['analysis'],
        cwd: request.cwd,
        exit_code: 0,
        timed_out: false,
        started_at: Date.now(),
        completed_at: Date.now(),
        transport: 'manager_owned',
      },
      process_output: {
        stdout: 'analysis complete',
        stderr: '',
      },
    };
  }
}

const runtime = new ManagerRuntime({
  workers: {
    claude: new SmokeClaudeAdapter(),
    shell: new ShellCliAdapter(),
  },
});

try {
  const result = await runtime.run({
    goal: 'Analyze this mission and then run `node --version` with proof.',
    worker_preference: 'claude',
    mission_id: `mission_dual_worker_smoke_${Date.now()}`,
    output_mode: 'json',
  });

  if (result.decision.selected_worker !== 'claude') {
    throw new Error(`Dual-worker smoke expected selected worker claude, got ${String(result.decision.selected_worker)}`);
  }
  if (result.worker_result?.status !== 'success') {
    throw new Error(`Dual-worker smoke failed: ${result.worker_result?.summary ?? 'no worker result'}`);
  }
  if (result.verification_result?.status !== 'verified_complete') {
    throw new Error(`Dual-worker smoke did not verify: ${result.verification_result?.status ?? 'missing verification result'}`);
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.status === 'success')) {
    throw new Error('Dual-worker smoke expected a claude worker task record.');
  }
  if (!result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'shell' && task.status === 'success')) {
    throw new Error('Dual-worker smoke expected a shell worker task record.');
  }
  if (!result.mission_graph.nodes.some((node) => node.id.startsWith('secondary_work_') && node.status === 'completed')) {
    throw new Error('Dual-worker smoke expected a completed secondary worker node.');
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.dispose();
}

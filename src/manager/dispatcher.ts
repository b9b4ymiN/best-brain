import type { WorkerAdapter } from './adapters/types.ts';
import type { ExecutionRequest, ManagerWorker, WorkerExecutionResult } from './types.ts';

export function buildWorkerChain(request: ExecutionRequest): ManagerWorker[] {
  return [request.selected_worker];
}

export async function dispatchPrimaryWorker(
  request: ExecutionRequest,
  workers: Partial<Record<ManagerWorker, WorkerAdapter>>,
): Promise<WorkerExecutionResult> {
  const worker = workers[request.selected_worker];
  if (!worker) {
    return {
      summary: `No worker adapter is registered for ${request.selected_worker}.`,
      status: 'failed',
      artifacts: [{
        type: 'note',
        ref: `worker://${request.selected_worker}/missing-adapter`,
        description: `Manager could not find a registered adapter for ${request.selected_worker}.`,
      }],
      proposed_checks: [{
        name: 'worker-adapter-available',
        passed: false,
        detail: `Missing adapter for ${request.selected_worker}.`,
      }],
      raw_output: '',
    };
  }

  return worker.execute(request);
}

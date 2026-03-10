import type { VerificationArtifact } from '../types.ts';
import type { WorkerAdapter, VerifierAdapter } from '../manager/adapters/types.ts';
import type { ExecutionRequest, WorkerExecutionResult, VerificationRequest } from '../manager/types.ts';
import {
  type WorkerDefinition,
  type WorkerId,
  type WorkerTaskInput,
  type WorkerTaskResult,
  validateWorkerTaskInput,
  validateWorkerTaskResult,
} from './types.ts';

export const PHASE2_REQUIRED_WORKERS = [
  'claude',
  'codex',
  'shell',
  'verifier',
] as const;

export type Phase2WorkerId = (typeof PHASE2_REQUIRED_WORKERS)[number];

const DEFAULT_WORKER_DEFINITIONS: Record<WorkerId, WorkerDefinition> = {
  claude: {
    id: 'claude',
    title: 'Claude Code Worker',
    execution_mode: 'cli',
    capabilities: ['analysis'],
    phase2_required: true,
    produces_runtime_process: true,
    manager_owned: false,
    available: true,
  },
  codex: {
    id: 'codex',
    title: 'Codex Worker',
    execution_mode: 'cli',
    capabilities: ['implementation'],
    phase2_required: true,
    produces_runtime_process: true,
    manager_owned: false,
    available: true,
  },
  shell: {
    id: 'shell',
    title: 'Shell Worker',
    execution_mode: 'local_process',
    capabilities: ['command_execution'],
    phase2_required: true,
    produces_runtime_process: true,
    manager_owned: false,
    available: true,
  },
  browser: {
    id: 'browser',
    title: 'Browser Worker',
    execution_mode: 'reserved',
    capabilities: ['browser_navigation'],
    phase2_required: false,
    produces_runtime_process: false,
    manager_owned: false,
    available: false,
  },
  mail: {
    id: 'mail',
    title: 'Mail Worker',
    execution_mode: 'reserved',
    capabilities: ['mail_processing'],
    phase2_required: false,
    produces_runtime_process: false,
    manager_owned: false,
    available: false,
  },
  verifier: {
    id: 'verifier',
    title: 'Verifier Worker',
    execution_mode: 'manager_owned',
    capabilities: ['verification'],
    phase2_required: true,
    produces_runtime_process: false,
    manager_owned: true,
    available: true,
  },
};

export interface WorkerCatalogSnapshot {
  required: Phase2WorkerId[];
  available: Phase2WorkerId[];
  missing: Phase2WorkerId[];
}

export interface WorkerDispatchResult {
  definition: WorkerDefinition;
  task_input: WorkerTaskInput;
  task_result: WorkerTaskResult;
  manager_result: WorkerExecutionResult;
  chain: Array<ExecutionRequest['selected_worker']>;
}

export interface VerifierDispatchResult {
  definition: WorkerDefinition;
  task_input: WorkerTaskInput;
  task_result: WorkerTaskResult;
  verification_request: VerificationRequest;
}

function synthesizeInvocation(request: ExecutionRequest, result: WorkerExecutionResult): NonNullable<WorkerExecutionResult['invocation']> {
  const now = Date.now();
  const shellCommand = request.selected_worker === 'shell' ? request.shell_command : null;
  return {
    command: shellCommand?.command ?? request.selected_worker,
    args: shellCommand?.args ?? [request.task_id, request.playbook_id],
    cwd: request.cwd,
    exit_code: result.status === 'success' ? 0 : 1,
    timed_out: false,
    started_at: now,
    completed_at: now,
    transport: request.selected_worker === 'shell' ? 'local_process' : 'cli',
  };
}

function normalizeManagerResult(request: ExecutionRequest, result: WorkerExecutionResult): WorkerExecutionResult {
  return {
    ...result,
    invocation: result.invocation ?? synthesizeInvocation(request, result),
    process_output: result.process_output ?? {
      stdout: result.status === 'success' ? result.raw_output : '',
      stderr: result.status === 'success' ? '' : (result.raw_output || result.summary),
    },
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
    proposed_checks: Array.isArray(result.proposed_checks) ? result.proposed_checks : [],
  };
}

function buildTaskInput(
  worker: WorkerId,
  request: ExecutionRequest,
  instructions: string,
  expectedArtifacts: Array<VerificationArtifact['type']>,
  overrides: {
    task_id?: string;
    objective?: string;
  } = {},
): WorkerTaskInput {
  return validateWorkerTaskInput({
    worker,
    mission_id: request.mission_id,
    task_id: overrides.task_id ?? request.task_id,
    objective: overrides.objective ?? request.task_title,
    instructions,
    cwd: request.cwd,
    constraints: request.prompt
      .split('\n')
      .filter((line) => line.startsWith('Constraints: '))
      .flatMap((line) => line.replace('Constraints: ', '').split(' | '))
      .filter(Boolean),
    expected_artifacts: expectedArtifacts,
    context_citations: request.context_citations,
    verification_required: request.verification_required,
    playbook_id: request.playbook_id,
  });
}

function buildMissingAdapterResult(worker: ExecutionRequest['selected_worker'], chain: string[]): WorkerExecutionResult {
  return {
    summary: `No worker adapter is registered for ${worker}.`,
    status: 'failed',
    artifacts: [{
      type: 'note',
      ref: `worker://${worker}/missing-adapter`,
      description: `Manager could not find a registered adapter for ${worker}. Planned chain: ${chain.join(' -> ')}.`,
    }],
    proposed_checks: [{
      name: 'worker-adapter-available',
      passed: false,
      detail: `Missing adapter for ${worker}. Planned chain: ${chain.join(' -> ')}.`,
    }],
    raw_output: '',
    invocation: null,
    process_output: null,
  };
}

function buildRuntimeErrorResult(worker: ExecutionRequest['selected_worker'], error: unknown): WorkerExecutionResult {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    summary: `Worker execution failed before producing a verifiable result: ${detail}`,
    status: 'failed',
    artifacts: [{
      type: 'note',
      ref: `worker://${worker}/runtime-error`,
      description: detail,
    }],
    proposed_checks: [{
      name: 'worker-execution',
      passed: false,
      detail,
    }],
    raw_output: detail,
    invocation: null,
    process_output: null,
  };
}

function toTaskResult(worker: WorkerId, request: ExecutionRequest, managerResult: WorkerExecutionResult): WorkerTaskResult {
  return validateWorkerTaskResult({
    worker,
    mission_id: request.mission_id,
    task_id: request.task_id,
    status: managerResult.status,
    summary: managerResult.summary,
    artifacts: managerResult.artifacts,
    checks: managerResult.proposed_checks,
    raw_output: managerResult.raw_output,
    started_at: managerResult.invocation?.started_at ?? Date.now(),
    completed_at: managerResult.invocation?.completed_at ?? Date.now(),
    retry_recommendation: managerResult.status === 'needs_retry'
      ? managerResult.summary
      : null,
    invocation: managerResult.invocation ?? null,
  });
}

function toVerifierTaskResult(request: ExecutionRequest, verificationRequest: VerificationRequest): WorkerTaskResult {
  const now = Date.now();
  return validateWorkerTaskResult({
    worker: 'verifier',
    mission_id: request.mission_id,
    task_id: 'verification_gate',
    status: verificationRequest.status === 'verified_complete'
      ? 'success'
      : verificationRequest.status === 'verification_failed'
        ? 'needs_retry'
        : 'failed',
    summary: verificationRequest.summary,
    artifacts: verificationRequest.evidence,
    checks: verificationRequest.verification_checks,
    raw_output: JSON.stringify(verificationRequest),
    started_at: now,
    completed_at: now,
    retry_recommendation: verificationRequest.status === 'verification_failed'
      ? verificationRequest.summary
      : null,
    invocation: {
      command: 'verifier',
      args: [request.playbook_id, request.task_id],
      cwd: request.cwd,
      exit_code: verificationRequest.status === 'rejected' ? 1 : 0,
      timed_out: false,
      started_at: now,
      completed_at: now,
      transport: 'manager_owned',
    },
  });
}

export class WorkerFabric {
  readonly definitions: Record<WorkerId, WorkerDefinition>;
  readonly workers: Partial<Record<ExecutionRequest['selected_worker'], WorkerAdapter>>;
  readonly verifier: VerifierAdapter;

  constructor(
    workers: Partial<Record<ExecutionRequest['selected_worker'], WorkerAdapter>>,
    verifier: VerifierAdapter,
    definitions: Record<WorkerId, WorkerDefinition> = DEFAULT_WORKER_DEFINITIONS,
  ) {
    this.workers = workers;
    this.verifier = verifier;
    this.definitions = definitions;
  }

  catalogSnapshot(): WorkerCatalogSnapshot {
    const required = [...PHASE2_REQUIRED_WORKERS];
    const available = required.filter((worker) => {
      if (worker === 'verifier') {
        return true;
      }
      return this.workers[worker] != null;
    });
    return {
      required,
      available,
      missing: required.filter((worker) => !available.includes(worker)),
    };
  }

  primaryWorkerChain(request: ExecutionRequest): Array<ExecutionRequest['selected_worker']> {
    return Array.from(new Set([
      request.selected_worker,
      ...request.playbook.preferred_workers.filter(
        (worker): worker is ExecutionRequest['selected_worker'] =>
          worker === 'claude' || worker === 'codex' || worker === 'shell',
      ),
    ]));
  }

  async dispatchPrimary(request: ExecutionRequest): Promise<WorkerDispatchResult> {
    const chain = this.primaryWorkerChain(request);
    const definition = this.definitions[request.selected_worker];
    const taskInput = buildTaskInput(
      request.selected_worker,
      request,
      request.prompt,
      request.expected_artifacts,
    );
    const adapter = this.workers[request.selected_worker];
    const managerResult = normalizeManagerResult(request, await (async () => {
      if (!adapter) {
        return buildMissingAdapterResult(request.selected_worker, chain);
      }
      try {
        return await adapter.execute(request);
      } catch (error) {
        return buildRuntimeErrorResult(request.selected_worker, error);
      }
    })());
    const taskResult = toTaskResult(request.selected_worker, request, managerResult);

    return {
      definition,
      task_input: taskInput,
      task_result: taskResult,
      manager_result: managerResult,
      chain,
    };
  }

  async dispatchVerifier(request: ExecutionRequest, workerResult: WorkerExecutionResult): Promise<VerifierDispatchResult> {
    const verificationRequest = await this.verifier.review(request, workerResult);
    const taskInput = buildTaskInput(
      'verifier',
      request,
      `Review the worker result and apply the playbook checklist: ${request.playbook.verifier_checklist.map((item) => item.name).join(' | ')}`,
      request.expected_artifacts,
      {
        task_id: 'verification_gate',
        objective: 'Verify the mission result against the playbook checklist.',
      },
    );
    const taskResult = toVerifierTaskResult(request, verificationRequest);

    return {
      definition: this.definitions.verifier,
      task_input: taskInput,
      task_result: taskResult,
      verification_request: verificationRequest,
    };
  }
}

export function getDefaultWorkerDefinitions(): Record<WorkerId, WorkerDefinition> {
  return DEFAULT_WORKER_DEFINITIONS;
}

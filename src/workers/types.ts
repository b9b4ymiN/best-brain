import type { ConsultCitation, VerificationArtifact, VerificationCheck } from '../types.ts';

export const WORKER_IDS = [
  'claude',
  'codex',
  'shell',
  'browser',
  'mail',
  'verifier',
] as const;

export type WorkerId = (typeof WORKER_IDS)[number];

export const WORKER_EXECUTION_MODES = [
  'cli',
  'local_process',
  'manager_owned',
  'reserved',
] as const;

export type WorkerExecutionMode = (typeof WORKER_EXECUTION_MODES)[number];

export const WORKER_CAPABILITIES = [
  'analysis',
  'implementation',
  'command_execution',
  'verification',
  'browser_navigation',
  'mail_processing',
] as const;

export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];

export const WORKER_TASK_STATUSES = [
  'queued',
  'running',
  'success',
  'needs_retry',
  'failed',
  'blocked',
] as const;

export type WorkerTaskStatus = (typeof WORKER_TASK_STATUSES)[number];

export interface WorkerDefinition {
  id: WorkerId;
  title: string;
  execution_mode: WorkerExecutionMode;
  capabilities: WorkerCapability[];
  phase2_required: boolean;
  produces_runtime_process: boolean;
  manager_owned: boolean;
  available: boolean;
}

export interface WorkerInvocation {
  command: string;
  args: string[];
  cwd: string | null;
  exit_code: number | null;
  timed_out: boolean;
  started_at: number;
  completed_at: number;
  transport: Exclude<WorkerExecutionMode, 'reserved'>;
}

export interface WorkerTaskInput {
  worker: WorkerId;
  mission_id: string;
  task_id: string;
  objective: string;
  instructions: string;
  cwd: string | null;
  constraints: string[];
  expected_artifacts: Array<VerificationArtifact['type']>;
  context_citations: ConsultCitation[];
  verification_required: boolean;
  playbook_id: string | null;
}

export interface WorkerTaskResult {
  worker: WorkerId;
  mission_id: string;
  task_id: string;
  status: WorkerTaskStatus;
  summary: string;
  artifacts: VerificationArtifact[];
  checks: VerificationCheck[];
  raw_output: string;
  started_at: number;
  completed_at: number;
  retry_recommendation: string | null;
  invocation: WorkerInvocation | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function readNullableString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }
  return value.trim();
}

function readBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function readArray(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value;
}

function readNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = readArray(input, key);
  return value.map((item) => {
    if (typeof item !== 'string') {
      throw new Error(`${key} must contain only strings`);
    }
    return item;
  });
}

function readInvocation(value: unknown): WorkerInvocation | null {
  if (value == null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error('invocation must be an object');
  }

  const transport = readString(value, 'transport');
  if (!WORKER_EXECUTION_MODES.includes(transport as WorkerExecutionMode) || transport === 'reserved') {
    throw new Error('invocation.transport must be a supported execution mode');
  }

  return {
    command: readString(value, 'command'),
    args: readStringArray(value, 'args'),
    cwd: readNullableString(value, 'cwd'),
    exit_code: (() => {
      const exitCode = value.exit_code;
      if (exitCode == null) {
        return null;
      }
      if (typeof exitCode !== 'number' || Number.isNaN(exitCode)) {
        throw new Error('invocation.exit_code must be a number');
      }
      return exitCode;
    })(),
    timed_out: readBoolean(value, 'timed_out'),
    started_at: readNumber(value, 'started_at'),
    completed_at: readNumber(value, 'completed_at'),
    transport: transport as Exclude<WorkerExecutionMode, 'reserved'>,
  };
}

export function validateWorkerTaskInput(value: unknown): WorkerTaskInput {
  if (!isRecord(value)) {
    throw new Error('worker task input must be an object');
  }

  const worker = readString(value, 'worker');
  if (!WORKER_IDS.includes(worker as WorkerId)) {
    throw new Error('worker must be a supported worker id');
  }

  return {
    worker: worker as WorkerId,
    mission_id: readString(value, 'mission_id'),
    task_id: readString(value, 'task_id'),
    objective: readString(value, 'objective'),
    instructions: readString(value, 'instructions'),
    cwd: readNullableString(value, 'cwd'),
    constraints: readStringArray(value, 'constraints'),
    expected_artifacts: readArray(value, 'expected_artifacts') as Array<VerificationArtifact['type']>,
    context_citations: readArray(value, 'context_citations') as ConsultCitation[],
    verification_required: readBoolean(value, 'verification_required'),
    playbook_id: readNullableString(value, 'playbook_id'),
  };
}

export function validateWorkerTaskResult(value: unknown): WorkerTaskResult {
  if (!isRecord(value)) {
    throw new Error('worker task result must be an object');
  }

  const worker = readString(value, 'worker');
  const status = readString(value, 'status');
  if (!WORKER_IDS.includes(worker as WorkerId)) {
    throw new Error('worker must be a supported worker id');
  }
  if (!WORKER_TASK_STATUSES.includes(status as WorkerTaskStatus)) {
    throw new Error('status must be a supported worker task status');
  }

  return {
    worker: worker as WorkerId,
    mission_id: readString(value, 'mission_id'),
    task_id: readString(value, 'task_id'),
    status: status as WorkerTaskStatus,
    summary: readString(value, 'summary'),
    artifacts: readArray(value, 'artifacts') as VerificationArtifact[],
    checks: readArray(value, 'checks') as VerificationCheck[],
    raw_output: readString(value, 'raw_output'),
    started_at: readNumber(value, 'started_at'),
    completed_at: readNumber(value, 'completed_at'),
    retry_recommendation: readNullableString(value, 'retry_recommendation'),
    invocation: readInvocation(value.invocation),
  };
}

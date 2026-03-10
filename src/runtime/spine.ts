import fs from 'fs';
import os from 'os';
import path from 'path';
import { createId } from '../utils/id.ts';
import type {
  RuntimeArtifactKind,
  RuntimeArtifactRecord,
  RuntimeCheckpointRecord,
  RuntimeEventRecord,
  RuntimeProcessRun,
  RuntimeSessionBundle,
  RuntimeSessionSpec,
  RuntimeSessionStatus,
  RuntimeWorkerTaskRun,
} from './types.ts';
import type { VerificationArtifact } from '../types.ts';

function cloneBundle(bundle: RuntimeSessionBundle): RuntimeSessionBundle {
  return {
    session: { ...bundle.session, checkpoint_ids: [...bundle.session.checkpoint_ids] },
    processes: bundle.processes.map((process) => ({ ...process, args: [...process.args] })),
    worker_tasks: bundle.worker_tasks.map((task) => ({
      ...task,
      artifact_refs: [...task.artifact_refs],
      check_names: [...task.check_names],
      invocation_args: [...task.invocation_args],
    })),
    artifacts: bundle.artifacts.map((artifact) => ({ ...artifact })),
    checkpoints: bundle.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      artifact_ids: [...checkpoint.artifact_ids],
      snapshot_path: checkpoint.snapshot_path,
    })),
    events: bundle.events.map((event) => ({ ...event, data: { ...event.data } })),
  };
}

function mapArtifactKind(type: VerificationArtifact['type']): RuntimeArtifactKind {
  switch (type) {
    case 'file':
      return 'file';
    case 'note':
      return 'report';
    case 'test':
      return 'json';
    default:
      return 'other';
  }
}

export interface RuntimeSessionContext {
  missionId: string;
  missionDefinitionId?: string | null;
  acceptanceProfileId?: string | null;
  reportContractId?: string | null;
  acceptanceRunId?: string | null;
  workspaceRoot: string;
  owner: string;
}

export class LocalRuntimeSpine {
  private bundle: RuntimeSessionBundle | null = null;
  private checkpointDir: string | null = null;

  openSession(context: RuntimeSessionContext): RuntimeSessionBundle {
    const now = Date.now();
    const session: RuntimeSessionSpec = {
      id: createId('session'),
      mission_id: context.missionId,
      mission_definition_id: context.missionDefinitionId ?? null,
      acceptance_profile_id: context.acceptanceProfileId ?? null,
      report_contract_id: context.reportContractId ?? null,
      acceptance_run_id: context.acceptanceRunId ?? null,
      final_report_artifact_id: null,
      workspace_root: context.workspaceRoot,
      owner: context.owner,
      status: 'pending',
      checkpoint_ids: [],
      created_at: now,
      updated_at: now,
    };

    this.bundle = {
      session,
      processes: [],
      worker_tasks: [],
      artifacts: [],
      checkpoints: [],
      events: [],
    };
    this.checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-runtime-'));

    this.recordEvent({
      task_id: null,
      event_type: 'runtime_session_opened',
      actor: 'runtime',
      detail: 'Runtime session opened for the mission.',
      data: {},
    });
    this.setSessionStatus('active');
    return this.snapshot();
  }

  ensureSession(): RuntimeSessionBundle {
    if (!this.bundle) {
      throw new Error('runtime session is not open');
    }
    return this.bundle;
  }

  setSessionStatus(status: RuntimeSessionStatus): void {
    const bundle = this.ensureSession();
    bundle.session.status = status;
    bundle.session.updated_at = Date.now();
  }

  recordEvent(input: {
    task_id: string | null;
    event_type: string;
    actor: string;
    detail: string;
    data: Record<string, unknown>;
  }): RuntimeEventRecord {
    const bundle = this.ensureSession();
    const event: RuntimeEventRecord = {
      id: createId('event'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      task_id: input.task_id,
      event_type: input.event_type,
      actor: input.actor,
      detail: input.detail,
      data: input.data,
      created_at: Date.now(),
    };
    bundle.events.push(event);
    bundle.session.updated_at = event.created_at;
    return event;
  }

  startProcess(input: {
    actor: string;
    command: string;
    args: string[];
    cwd: string;
  }): RuntimeProcessRun {
    const bundle = this.ensureSession();
    const process: RuntimeProcessRun = {
      id: createId('proc'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      actor: input.actor,
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      status: 'running',
      exit_code: null,
      stdout_artifact_id: null,
      stderr_artifact_id: null,
      started_at: Date.now(),
      completed_at: null,
    };
    bundle.processes.push(process);
    this.recordEvent({
      task_id: null,
      event_type: 'process_started',
      actor: input.actor,
      detail: `Started runtime process ${input.command}.`,
      data: {
        process_id: process.id,
        args: input.args,
      },
    });
    return process;
  }

  recordCompletedProcess(input: {
    actor: string;
    command: string;
    args: string[];
    cwd: string;
    status: RuntimeProcessRun['status'];
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
    task_id: string | null;
    started_at: number;
    completed_at: number;
  }): RuntimeProcessRun {
    const bundle = this.ensureSession();
    const process: RuntimeProcessRun = {
      id: createId('proc'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      actor: input.actor,
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      status: input.status,
      exit_code: input.exit_code,
      stdout_artifact_id: null,
      stderr_artifact_id: null,
      started_at: input.started_at,
      completed_at: input.completed_at,
    };
    bundle.processes.push(process);
    this.recordEvent({
      task_id: input.task_id,
      event_type: 'process_started',
      actor: input.actor,
      detail: `Started runtime process ${input.command}.`,
      data: {
        process_id: process.id,
        args: input.args,
      },
    });

    if (input.stdout && input.stdout.trim().length > 0) {
      const stdoutArtifact = this.recordTextArtifact({
        task_id: input.task_id,
        kind: 'stdout',
        uri: `runtime://${process.id}/stdout`,
        description: input.stdout.slice(0, 500),
        source: input.actor,
      });
      process.stdout_artifact_id = stdoutArtifact.id;
    }

    if (input.stderr && input.stderr.trim().length > 0) {
      const stderrArtifact = this.recordTextArtifact({
        task_id: input.task_id,
        kind: 'stderr',
        uri: `runtime://${process.id}/stderr`,
        description: input.stderr.slice(0, 500),
        source: input.actor,
      });
      process.stderr_artifact_id = stderrArtifact.id;
    }

    this.recordEvent({
      task_id: input.task_id,
      event_type: 'process_completed',
      actor: input.actor,
      detail: `Completed runtime process ${input.command} with status ${input.status}.`,
      data: {
        process_id: process.id,
        exit_code: input.exit_code,
      },
    });
    return process;
  }

  startWorkerTask(input: {
    task_id: string;
    worker: string;
    requested_worker?: string | null;
    fallback_from?: string | null;
    execution_mode: string;
    objective: string;
    playbook_id: string | null;
    verifier_owned: boolean;
  }): RuntimeWorkerTaskRun {
    const bundle = this.ensureSession();
    const now = Date.now();
    const workerTask: RuntimeWorkerTaskRun = {
      id: createId('worker_task'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      task_id: input.task_id,
      worker: input.worker,
      requested_worker: input.requested_worker ?? input.worker,
      fallback_from: input.fallback_from ?? null,
      execution_mode: input.execution_mode,
      objective: input.objective,
      playbook_id: input.playbook_id,
      status: 'running',
      summary: null,
      artifact_refs: [],
      check_names: [],
      retry_recommendation: null,
      invocation_command: null,
      invocation_args: [],
      verifier_owned: input.verifier_owned,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    bundle.worker_tasks.push(workerTask);
    this.recordEvent({
      task_id: input.task_id,
      event_type: 'worker_task_started',
      actor: input.worker,
      detail: `Started worker task ${input.task_id} with ${input.worker}.`,
      data: {
        worker_task_id: workerTask.id,
        execution_mode: input.execution_mode,
        playbook_id: input.playbook_id,
        verifier_owned: input.verifier_owned,
        requested_worker: workerTask.requested_worker,
        fallback_from: workerTask.fallback_from,
      },
    });
    return workerTask;
  }

  completeWorkerTask(input: {
    worker_task_id: string;
    status: RuntimeWorkerTaskRun['status'];
    summary: string;
    artifact_refs: string[];
    check_names: string[];
    retry_recommendation: string | null;
    invocation_command: string | null;
    invocation_args: string[];
  }): RuntimeWorkerTaskRun {
    const bundle = this.ensureSession();
    const workerTask = bundle.worker_tasks.find((candidate) => candidate.id === input.worker_task_id);
    if (!workerTask) {
      throw new Error(`runtime worker task not found: ${input.worker_task_id}`);
    }

    const completedAt = Date.now();
    workerTask.status = input.status;
    workerTask.summary = input.summary;
    workerTask.artifact_refs = [...input.artifact_refs];
    workerTask.check_names = [...input.check_names];
    workerTask.retry_recommendation = input.retry_recommendation;
    workerTask.invocation_command = input.invocation_command;
    workerTask.invocation_args = [...input.invocation_args];
    workerTask.updated_at = completedAt;
    workerTask.completed_at = completedAt;
    bundle.session.updated_at = completedAt;

    this.recordEvent({
      task_id: workerTask.task_id,
      event_type: 'worker_task_completed',
      actor: workerTask.worker,
      detail: `Completed worker task ${workerTask.task_id} with status ${input.status}.`,
      data: {
        worker_task_id: workerTask.id,
        artifact_refs: input.artifact_refs,
        check_names: input.check_names,
      },
    });

    return workerTask;
  }

  recordTextArtifact(input: {
    task_id: string | null;
    kind: 'stdout' | 'stderr' | 'log' | 'report';
    uri: string;
    description: string | null;
    source: string;
    acceptance_run_id?: string | null;
  }): RuntimeArtifactRecord {
    const bundle = this.ensureSession();
    const artifact: RuntimeArtifactRecord = {
      id: createId('artifact'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      acceptance_run_id: input.acceptance_run_id ?? bundle.session.acceptance_run_id,
      task_id: input.task_id,
      kind: input.kind,
      uri: input.uri,
      description: input.description,
      checksum: null,
      source: input.source,
      created_at: Date.now(),
    };
    bundle.artifacts.push(artifact);
    bundle.session.updated_at = artifact.created_at;
    return artifact;
  }

  recordVerificationArtifacts(
    taskId: string | null,
    source: string,
    artifacts: VerificationArtifact[],
  ): RuntimeArtifactRecord[] {
    const bundle = this.ensureSession();
    return artifacts.map((artifact) => {
      const record: RuntimeArtifactRecord = {
        id: createId('artifact'),
        session_id: bundle.session.id,
        mission_id: bundle.session.mission_id,
        acceptance_run_id: bundle.session.acceptance_run_id,
        task_id: taskId,
        kind: mapArtifactKind(artifact.type),
        uri: artifact.ref,
        description: artifact.description ?? null,
        checksum: null,
        source,
        created_at: Date.now(),
      };
      bundle.artifacts.push(record);
      bundle.session.updated_at = record.created_at;
      return record;
    });
  }

  recordFinalReportArtifact(input: {
    task_id: string | null;
    uri: string;
    description: string;
  }): RuntimeArtifactRecord {
    const artifact = this.recordTextArtifact({
      task_id: input.task_id,
      kind: 'report',
      uri: input.uri,
      description: input.description,
      source: 'manager',
    });
    const bundle = this.ensureSession();
    bundle.session.final_report_artifact_id = artifact.id;
    bundle.session.updated_at = Date.now();
    this.recordEvent({
      task_id: input.task_id,
      event_type: 'final_report_emitted',
      actor: 'manager',
      detail: 'Recorded the final mission report artifact.',
      data: {
        artifact_id: artifact.id,
        uri: input.uri,
      },
    });
    return artifact;
  }

  completeProcess(processId: string, input: {
    status: RuntimeProcessRun['status'];
    exit_code: number | null;
    stdout: string | null;
    stderr: string | null;
    task_id: string | null;
  }): RuntimeProcessRun {
    const bundle = this.ensureSession();
    const process = bundle.processes.find((candidate) => candidate.id === processId);
    if (!process) {
      throw new Error(`runtime process not found: ${processId}`);
    }

    process.status = input.status;
    process.exit_code = input.exit_code;
    process.completed_at = Date.now();

    if (input.stdout && input.stdout.trim().length > 0) {
      const stdoutArtifact = this.recordTextArtifact({
        task_id: input.task_id,
        kind: 'stdout',
        uri: `runtime://${process.id}/stdout`,
        description: input.stdout.slice(0, 500),
        source: process.actor,
      });
      process.stdout_artifact_id = stdoutArtifact.id;
    }

    if (input.stderr && input.stderr.trim().length > 0) {
      const stderrArtifact = this.recordTextArtifact({
        task_id: input.task_id,
        kind: 'stderr',
        uri: `runtime://${process.id}/stderr`,
        description: input.stderr.slice(0, 500),
        source: process.actor,
      });
      process.stderr_artifact_id = stderrArtifact.id;
    }

    this.recordEvent({
      task_id: input.task_id,
      event_type: 'process_completed',
      actor: process.actor,
      detail: `Completed runtime process ${process.command} with status ${input.status}.`,
      data: {
        process_id: process.id,
        exit_code: input.exit_code,
      },
    });
    return process;
  }

  createCheckpoint(input: {
    label: string;
    artifact_ids: string[];
    restore_supported: boolean;
  }): RuntimeCheckpointRecord {
    const bundle = this.ensureSession();
    const checkpoint: RuntimeCheckpointRecord = {
      id: createId('checkpoint'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
      label: input.label,
      artifact_ids: [...input.artifact_ids],
      restore_supported: input.restore_supported,
      snapshot_path: this.checkpointDir ? path.join(this.checkpointDir, `${bundle.session.id}-${Date.now()}.json`) : null,
      created_at: Date.now(),
    };
    bundle.checkpoints.push(checkpoint);
    bundle.session.checkpoint_ids.push(checkpoint.id);
    bundle.session.updated_at = checkpoint.created_at;
    bundle.session.status = 'checkpointed';
    this.recordEvent({
      task_id: null,
      event_type: 'checkpoint_created',
      actor: 'runtime',
      detail: `Created checkpoint ${input.label}.`,
      data: {
        checkpoint_id: checkpoint.id,
        artifact_ids: input.artifact_ids,
      },
    });
    if (checkpoint.snapshot_path) {
      fs.writeFileSync(checkpoint.snapshot_path, JSON.stringify(this.snapshot(), null, 2));
    }
    return checkpoint;
  }

  latestRestorableCheckpoint(): RuntimeCheckpointRecord | null {
    const bundle = this.ensureSession();
    const checkpoint = [...bundle.checkpoints]
      .reverse()
      .find((candidate) => candidate.restore_supported);
    return checkpoint ?? null;
  }

  restoreCheckpoint(checkpointId: string): RuntimeSessionBundle {
    const bundle = this.ensureSession();
    const checkpoint = bundle.checkpoints.find((candidate) => candidate.id === checkpointId);
    if (!checkpoint || !checkpoint.restore_supported || !checkpoint.snapshot_path) {
      throw new Error(`runtime checkpoint cannot be restored: ${checkpointId}`);
    }
    if (!fs.existsSync(checkpoint.snapshot_path)) {
      throw new Error(`runtime checkpoint snapshot is missing: ${checkpoint.snapshot_path}`);
    }

    const restored = JSON.parse(fs.readFileSync(checkpoint.snapshot_path, 'utf8')) as RuntimeSessionBundle;
    this.bundle = restored;
    this.setSessionStatus('active');
    this.recordEvent({
      task_id: null,
      event_type: 'checkpoint_restored',
      actor: 'runtime',
      detail: `Restored runtime state from checkpoint ${checkpoint.label}.`,
      data: {
        checkpoint_id: checkpoint.id,
        snapshot_path: checkpoint.snapshot_path,
      },
    });
    return this.snapshot();
  }

  finalize(status: RuntimeSessionStatus, detail: string, data: Record<string, unknown> = {}): RuntimeSessionBundle {
    this.setSessionStatus(status);
    this.recordEvent({
      task_id: null,
      event_type: 'runtime_session_finalized',
      actor: 'runtime',
      detail,
      data,
    });
    return this.snapshot();
  }

  snapshot(): RuntimeSessionBundle {
    return cloneBundle(this.ensureSession());
  }
}

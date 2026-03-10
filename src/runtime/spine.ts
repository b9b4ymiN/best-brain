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
} from './types.ts';
import type { VerificationArtifact } from '../types.ts';

function cloneBundle(bundle: RuntimeSessionBundle): RuntimeSessionBundle {
  return {
    session: { ...bundle.session, checkpoint_ids: [...bundle.session.checkpoint_ids] },
    processes: bundle.processes.map((process) => ({ ...process, args: [...process.args] })),
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

  recordTextArtifact(input: {
    task_id: string | null;
    kind: 'stdout' | 'stderr' | 'log' | 'report';
    uri: string;
    description: string | null;
    source: string;
  }): RuntimeArtifactRecord {
    const bundle = this.ensureSession();
    const artifact: RuntimeArtifactRecord = {
      id: createId('artifact'),
      session_id: bundle.session.id,
      mission_id: bundle.session.mission_id,
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

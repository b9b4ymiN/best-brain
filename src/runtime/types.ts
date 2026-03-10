export const RUNTIME_SESSION_STATUSES = [
  'pending',
  'active',
  'checkpointed',
  'completed',
  'failed',
  'aborted',
] as const;

export type RuntimeSessionStatus = (typeof RUNTIME_SESSION_STATUSES)[number];

export const RUNTIME_PROCESS_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'killed',
] as const;

export type RuntimeProcessStatus = (typeof RUNTIME_PROCESS_STATUSES)[number];

export const RUNTIME_ARTIFACT_KINDS = [
  'file',
  'directory',
  'report',
  'log',
  'stdout',
  'stderr',
  'screenshot',
  'json',
  'other',
] as const;

export type RuntimeArtifactKind = (typeof RUNTIME_ARTIFACT_KINDS)[number];

export interface RuntimeSessionSpec {
  id: string;
  mission_id: string;
  workspace_root: string;
  owner: string;
  status: RuntimeSessionStatus;
  checkpoint_ids: string[];
  created_at: number;
  updated_at: number;
}

export interface RuntimeProcessRun {
  id: string;
  session_id: string;
  mission_id: string;
  actor: string;
  command: string;
  args: string[];
  cwd: string;
  status: RuntimeProcessStatus;
  exit_code: number | null;
  stdout_artifact_id: string | null;
  stderr_artifact_id: string | null;
  started_at: number;
  completed_at: number | null;
}

export interface RuntimeArtifactRecord {
  id: string;
  session_id: string;
  mission_id: string;
  task_id: string | null;
  kind: RuntimeArtifactKind;
  uri: string;
  description: string | null;
  checksum: string | null;
  source: string;
  created_at: number;
}

export interface RuntimeCheckpointRecord {
  id: string;
  session_id: string;
  mission_id: string;
  label: string;
  artifact_ids: string[];
  restore_supported: boolean;
  created_at: number;
}

export interface RuntimeEventRecord {
  id: string;
  session_id: string;
  mission_id: string;
  task_id: string | null;
  event_type: string;
  actor: string;
  detail: string;
  data: Record<string, unknown>;
  created_at: number;
}

export interface RuntimeSessionBundle {
  session: RuntimeSessionSpec;
  processes: RuntimeProcessRun[];
  artifacts: RuntimeArtifactRecord[];
  checkpoints: RuntimeCheckpointRecord[];
  events: RuntimeEventRecord[];
}

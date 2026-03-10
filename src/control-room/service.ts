import fs from 'fs';
import path from 'path';
import type { MissionStatus } from '../types.ts';
import type { ManagerRuntime } from '../manager/runtime.ts';
import type { ManagerRunResult } from '../manager/types.ts';
import type { RuntimeArtifactRecord, RuntimeEventRecord, RuntimeWorkerTaskRun } from '../runtime/types.ts';
import type {
  ControlRoomAction,
  ControlRoomActionRequest,
  ControlRoomActionResult,
  ControlRoomDashboardView,
  ControlRoomLaunchRequest,
  MissionTimelineEntry,
  ControlRoomMissionSummary,
  MissionConsoleView,
  OperatorReviewView,
  WorkerCardStatus,
  WorkerStatusCard,
} from './types.ts';

interface StoredOperatorEvent {
  id: string;
  action: Extract<ControlRoomAction, 'approve_verdict' | 'reject_verdict'>;
  note: string | null;
  created_at: number;
}

interface StoredMissionRun {
  id: string;
  action: Extract<ControlRoomAction, 'launch_mission' | 'retry_mission' | 'resume_mission'>;
  recorded_at: number;
  result: ManagerRunResult;
}

interface StoredMissionRecord {
  mission_id: string;
  goal: string;
  created_at: number;
  updated_at: number;
  runs: StoredMissionRun[];
  operator_events: StoredOperatorEvent[];
  operator_review: OperatorReviewView;
}

export interface ControlRoomManagerFactory {
  (): Promise<ManagerRuntime> | ManagerRuntime;
}

export interface ControlRoomServiceOptions {
  dataDir: string;
  managerFactory: ControlRoomManagerFactory;
  now?: () => number;
}

function toTitle(eventType: string): string {
  return eventType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function timelineStatusFromEvent(event: RuntimeEventRecord, missionStatus: MissionStatus): string {
  const verificationStatus = typeof event.data.verification_status === 'string'
    ? event.data.verification_status
    : null;
  if (verificationStatus === 'verified_complete') {
    return 'completed';
  }
  if (verificationStatus === 'verification_failed' || verificationStatus === 'rejected') {
    return 'failed';
  }
  if (event.event_type.includes('failed')) {
    return 'failed';
  }
  if (event.event_type.includes('started') || event.event_type.includes('requested') || event.event_type.includes('restored')) {
    return 'running';
  }
  if (event.event_type.includes('finalized') && missionStatus !== 'verified_complete') {
    return missionStatus === 'verification_failed' || missionStatus === 'rejected' ? 'failed' : 'completed';
  }
  return 'completed';
}

function timelineArtifacts(event: RuntimeEventRecord): string[] {
  const values: string[] = [];
  const artifactId = event.data.artifact_id;
  if (typeof artifactId === 'string') {
    values.push(artifactId);
  }
  const artifactIds = event.data.artifact_ids;
  if (Array.isArray(artifactIds)) {
    values.push(...artifactIds.filter((value): value is string => typeof value === 'string'));
  }
  return values;
}

function mapWorkerCardStatus(task: RuntimeWorkerTaskRun): WorkerCardStatus {
  switch (task.status) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'blocked':
      return 'blocked';
    case 'success':
      return 'completed';
    case 'needs_retry':
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

function buildWorkerCards(workerTasks: RuntimeWorkerTaskRun[]): WorkerStatusCard[] {
  const latestByWorker = new Map<string, RuntimeWorkerTaskRun>();
  for (const task of workerTasks) {
    const existing = latestByWorker.get(task.worker);
    if (!existing || task.updated_at >= existing.updated_at) {
      latestByWorker.set(task.worker, task);
    }
  }

  return Array.from(latestByWorker.values())
    .sort((left, right) => left.worker.localeCompare(right.worker))
    .map((task) => ({
      worker: task.worker as WorkerStatusCard['worker'],
      status: mapWorkerCardStatus(task),
      current_task_id: task.status === 'running' ? task.task_id : null,
      current_task_title: task.status === 'running' ? task.objective : null,
      last_update_at: task.updated_at,
    }));
}

function resolveMissionStatus(result: ManagerRunResult): MissionStatus {
  if (result.verification_result) {
    return result.verification_result.status;
  }
  if (result.decision.blocked_reason) {
    return 'rejected';
  }
  if (result.decision.kind === 'chat') {
    return 'draft';
  }
  return result.retryable ? 'verification_failed' : 'in_progress';
}

function buildAllowedActions(result: ManagerRunResult, operatorReview: OperatorReviewView): ControlRoomAction[] {
  const actions: ControlRoomAction[] = [];
  const status = resolveMissionStatus(result);

  if (status === 'verification_failed' || status === 'rejected') {
    actions.push('retry_mission', 'resume_mission');
  } else if (status === 'verified_complete') {
    actions.push('retry_mission');
  }

  if (status === 'verified_complete' && operatorReview.status !== 'approved') {
    actions.push('approve_verdict');
  }

  if ((status === 'verified_complete' || status === 'verification_failed') && operatorReview.status !== 'rejected') {
    actions.push('reject_verdict');
  }

  return actions;
}

function operatorTimelineEntries(
  missionId: string,
  operatorEvents: StoredOperatorEvent[],
): MissionTimelineEntry[] {
  return operatorEvents.map((event) => ({
    id: event.id,
    mission_id: missionId,
    source: 'operator',
    status: event.action === 'approve_verdict' ? 'completed' : 'failed',
    title: event.action === 'approve_verdict' ? 'Operator approved verdict' : 'Operator rejected verdict',
    detail: event.note ?? 'No operator note was recorded.',
    artifact_ids: [],
    created_at: event.created_at,
  }));
}

function buildTimeline(result: ManagerRunResult, operatorEvents: StoredOperatorEvent[]): MissionTimelineEntry[] {
  const missionId = result.mission_brief.mission_id;
  const missionStatus = resolveMissionStatus(result);
  const runtimeEntries: MissionTimelineEntry[] = (result.runtime_bundle?.events ?? []).map((event) => ({
    id: event.id,
    mission_id: missionId,
    source: event.actor === 'runtime'
      ? 'runtime'
      : event.actor === 'verifier'
        ? 'verifier'
        : event.actor === 'manager' || event.actor === 'brain'
          ? 'manager'
          : 'worker',
    status: timelineStatusFromEvent(event, missionStatus),
    title: toTitle(event.event_type),
    detail: event.detail,
    artifact_ids: timelineArtifacts(event),
    created_at: event.created_at,
  }));

  if (runtimeEntries.length === 0) {
    runtimeEntries.push({
      id: `${missionId}_planning`,
      mission_id: missionId,
      source: 'manager',
      status: result.decision.should_execute ? 'completed' : 'blocked',
      title: 'Mission Brief Compiled',
      detail: result.final_message,
      artifact_ids: [],
      created_at: Date.now(),
    });
  }

  return [...runtimeEntries, ...operatorTimelineEntries(missionId, operatorEvents)]
    .sort((left, right) => left.created_at - right.created_at);
}

export function buildMissionConsoleView(
  result: ManagerRunResult,
  operatorReview: OperatorReviewView,
  operatorEvents: StoredOperatorEvent[] = [],
): MissionConsoleView {
  const artifacts = result.runtime_bundle?.artifacts ?? [];
  const finalReportArtifact = result.runtime_bundle?.session.final_report_artifact_id
    ? artifacts.find((artifact) => artifact.id === result.runtime_bundle?.session.final_report_artifact_id) ?? null
    : null;
  const verdict = result.verification_result
    && ['awaiting_verification', 'verification_failed', 'verified_complete', 'rejected'].includes(result.verification_result.status)
    ? {
        mission_id: result.verification_result.mission_id,
        status: result.verification_result.status as MissionConsoleView['verdict'] extends infer TVerdict
          ? TVerdict extends { status: infer TStatus }
            ? TStatus
            : never
          : never,
        summary: result.final_message,
        evidence_count: result.verification_result.evidence_count,
        checks_passed: result.verification_result.checks_passed,
        checks_total: result.verification_result.checks_total,
      }
    : null;
  const updatedAt = result.runtime_bundle?.session.updated_at
    ?? result.runtime_bundle?.events.at(-1)?.created_at
    ?? Date.now();

  return {
    mission_id: result.mission_brief.mission_id,
    goal: result.input.goal,
    status: resolveMissionStatus(result),
    mission_graph: result.mission_graph,
    plan_overview: result.mission_graph.nodes.map((node) => `${node.id}: ${node.title} (${node.status})`),
    timeline: buildTimeline(result, operatorEvents),
    workers: buildWorkerCards(result.runtime_bundle?.worker_tasks ?? []),
    artifacts,
    final_report_artifact: finalReportArtifact,
    verdict,
    operator_review: operatorReview,
    allowed_actions: buildAllowedActions(result, operatorReview),
    updated_at: updatedAt,
  };
}

function buildMissionSummary(record: StoredMissionRecord): ControlRoomMissionSummary {
  const latestRun = record.runs.at(-1);
  if (!latestRun) {
    throw new Error(`control-room record is missing a run: ${record.mission_id}`);
  }

  return {
    mission_id: record.mission_id,
    goal: record.goal,
    status: resolveMissionStatus(latestRun.result),
    selected_worker: latestRun.result.decision.selected_worker,
    retryable: latestRun.result.retryable,
    final_message: latestRun.result.final_message,
    updated_at: record.updated_at,
  };
}

function createInitialOperatorReview(): OperatorReviewView {
  return {
    status: 'pending',
    note: null,
    updated_at: null,
  };
}

export class ControlRoomService {
  private readonly missionsDir: string;
  private readonly managerFactory: ControlRoomManagerFactory;
  private readonly now: () => number;

  constructor(options: ControlRoomServiceOptions) {
    this.missionsDir = path.join(options.dataDir, 'control-room', 'missions');
    this.managerFactory = options.managerFactory;
    this.now = options.now ?? (() => Date.now());
    fs.mkdirSync(this.missionsDir, { recursive: true });
  }

  private missionPath(missionId: string): string {
    return path.join(this.missionsDir, `${missionId}.json`);
  }

  private readRecord(missionId: string): StoredMissionRecord | null {
    const filePath = this.missionPath(missionId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredMissionRecord;
  }

  private writeRecord(record: StoredMissionRecord): void {
    fs.writeFileSync(this.missionPath(record.mission_id), JSON.stringify(record, null, 2));
  }

  private persistRun(goal: string, run: StoredMissionRun): StoredMissionRecord {
    const missionId = run.result.mission_brief.mission_id;
    const existing = this.readRecord(missionId);
    const timestamp = this.now();
    const record: StoredMissionRecord = existing
      ? {
          ...existing,
          goal,
          updated_at: timestamp,
          runs: [...existing.runs, run],
          operator_review: createInitialOperatorReview(),
        }
      : {
          mission_id: missionId,
          goal,
          created_at: timestamp,
          updated_at: timestamp,
          runs: [run],
          operator_events: [],
          operator_review: createInitialOperatorReview(),
        };
    this.writeRecord(record);
    return record;
  }

  recordManagerResult(goal: string, result: ManagerRunResult): MissionConsoleView {
    const run: StoredMissionRun = {
      id: `launch_mission_${this.now()}`,
      action: 'launch_mission',
      recorded_at: this.now(),
      result,
    };
    const record = this.persistRun(goal, run);
    return buildMissionConsoleView(result, record.operator_review, record.operator_events);
  }

  listDashboard(): ControlRoomDashboardView {
    const missions = fs.readdirSync(this.missionsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => JSON.parse(fs.readFileSync(path.join(this.missionsDir, entry), 'utf8')) as StoredMissionRecord)
      .sort((left, right) => right.updated_at - left.updated_at);

    return {
      latest_mission_id: missions[0]?.mission_id ?? null,
      missions: missions.map(buildMissionSummary),
    };
  }

  getMissionView(missionId: string): MissionConsoleView | null {
    const record = this.readRecord(missionId);
    if (!record) {
      return null;
    }
    const latestRun = record.runs.at(-1);
    if (!latestRun) {
      return null;
    }
    return buildMissionConsoleView(latestRun.result, record.operator_review, record.operator_events);
  }

  private async runManagerMission(
    request: ControlRoomLaunchRequest,
    overrides: { mission_id?: string | null; action: Extract<ControlRoomAction, 'launch_mission' | 'retry_mission' | 'resume_mission'> },
  ): Promise<StoredMissionRun> {
    const manager = await this.managerFactory();
    try {
      const result = await manager.run({
        goal: request.goal,
        worker_preference: 'auto',
        mission_id: overrides.mission_id ?? null,
        dry_run: request.dry_run,
        no_execute: request.no_execute ?? false,
        output_mode: 'json',
      });
      return {
        id: `${overrides.action}_${this.now()}`,
        action: overrides.action,
        recorded_at: this.now(),
        result,
      };
    } finally {
      await manager.dispose();
    }
  }

  async launchMission(request: ControlRoomLaunchRequest): Promise<MissionConsoleView> {
    const run = await this.runManagerMission(request, {
      mission_id: null,
      action: 'launch_mission',
    });
    const record = this.persistRun(request.goal, run);
    return buildMissionConsoleView(run.result, record.operator_review, record.operator_events);
  }

  async runAction(missionId: string, request: ControlRoomActionRequest): Promise<ControlRoomActionResult> {
    const record = this.readRecord(missionId);
    if (!record) {
      throw new Error(`control-room mission not found: ${missionId}`);
    }

    const latestRun = record.runs.at(-1);
    if (!latestRun) {
      throw new Error(`control-room mission has no runs: ${missionId}`);
    }

    const currentView = buildMissionConsoleView(latestRun.result, record.operator_review, record.operator_events);
    if (!currentView.allowed_actions.includes(request.action)) {
      throw new Error(`control-room action is not allowed for this mission: ${request.action}`);
    }

    if (request.action === 'retry_mission' || request.action === 'resume_mission') {
      const rerun = await this.runManagerMission({
        goal: record.goal,
        dry_run: false,
        no_execute: false,
      }, {
        mission_id: missionId,
        action: request.action,
      });
      record.runs.push(rerun);
      record.updated_at = this.now();
      record.operator_review = createInitialOperatorReview();
      this.writeRecord(record);
      const view = buildMissionConsoleView(rerun.result, record.operator_review, record.operator_events);
      return {
        accepted: true,
        mission_id: missionId,
        action: request.action,
        message: `Mission rerun completed with status ${view.status}.`,
        view,
      };
    }

    if (request.action === 'approve_verdict' || request.action === 'reject_verdict') {
      const event: StoredOperatorEvent = {
        id: `${request.action}_${this.now()}`,
        action: request.action,
        note: request.note?.trim() || null,
        created_at: this.now(),
      };
      record.operator_events.push(event);
      record.operator_review = {
        status: request.action === 'approve_verdict' ? 'approved' : 'rejected',
        note: event.note,
        updated_at: event.created_at,
      };
      record.updated_at = event.created_at;
      this.writeRecord(record);
      const view = buildMissionConsoleView(latestRun.result, record.operator_review, record.operator_events);
      return {
        accepted: true,
        mission_id: missionId,
        action: request.action,
        message: request.action === 'approve_verdict'
          ? 'Operator approval recorded.'
          : 'Operator rejection recorded.',
        view,
      };
    }

    throw new Error(`control-room action is not supported yet: ${request.action}`);
  }
}

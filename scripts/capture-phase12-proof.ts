import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';
import { AutonomousTaskQueue } from '../src/runtime/task-queue.ts';
import { OperatorSafetyController } from '../src/runtime/safety.ts';
import type { ScheduledMissionRecord } from '../src/runtime/types.ts';

class StaticWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(_request: ExecutionRequest): Promise<WorkerExecutionResult> {
    return this.result;
  }
}

function toScheduledRunStatus(status: string): 'verified_complete' | 'verification_failed' | 'rejected' | 'failed' {
  return status === 'verified_complete'
    ? 'verified_complete'
    : status === 'verification_failed'
      ? 'verification_failed'
      : status === 'rejected'
        ? 'rejected'
        : 'failed';
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson<T>(baseUrl: string, endpoint: string, init?: RequestInit): Promise<{ status: number; payload: T }> {
  const response = await fetch(`${baseUrl}${endpoint}`, init);
  const payload = await response.json() as T;
  return {
    status: response.status,
    payload,
  };
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase12-'));
const dbPath = path.join(dataDir, 'best-brain.db');

const brain = await BestBrain.open({
  owner: 'phase12-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

let server: ReturnType<typeof Bun.serve>;
const safety = new OperatorSafetyController({
  dataDir: brain.config.dataDir,
});

const managerFactory = () => new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
  workers: {
    shell: new StaticWorkerAdapter('shell', {
      summary: 'Shell command completed with deterministic proof for Phase 12.',
      status: 'success',
      artifacts: [
        { type: 'note', ref: 'worker://phase12/shell-proof', description: 'Phase 12 deterministic shell proof.' },
      ],
      proposed_checks: [{
        name: 'phase12-shell-proof',
        passed: true,
        detail: 'Deterministic shell proof check passed.',
      }],
      raw_output: 'phase12-shell-proof',
      invocation: null,
      process_output: null,
    }),
  },
});

const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory,
  memoryQualityProvider: () => brain.getMemoryQualityMetrics(),
  operatorSafetyProvider: () => safety.getState(),
});

const scheduler = new MissionScheduler({
  store: brain.store,
  isExecutionAllowed: () => safety.isExecutionAllowed(),
  blockedReason: () => safety.getState().reason ?? 'operator safety stop is active',
  runMission: async (schedule: ScheduledMissionRecord) => {
    const view = await controlRoom.launchMission({
      goal: schedule.goal,
      dry_run: false,
      no_execute: false,
      worker_preference: schedule.worker_preference,
    });
    return {
      mission_id: view.mission_id,
      status: toScheduledRunStatus(view.status),
      final_message: view.verdict?.summary ?? `status=${view.status}`,
    };
  },
});

const queue = new AutonomousTaskQueue({
  store: brain.store,
  isExecutionAllowed: () => safety.isExecutionAllowed(),
  blockedReason: () => safety.getState().reason ?? 'operator safety stop is active',
  executeTask: async (item) => ({
    mission_id: `mission_queue_${item.id}`,
    status: 'verified_complete',
    final_message: 'queue task completed',
    retryable: false,
  }),
});

const app = createApp(brain, {
  controlRoom,
  scheduler,
  taskQueue: queue,
  operatorSafety: safety,
});

server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

try {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const nowIso = new Date().toISOString();

  const health = await requestJson<{ status: string }>(baseUrl, '/health');
  assert(health.status === 200, 'phase12 proof expected /health 200');

  const stop = await requestJson<{ safety: { emergency_stop: boolean; reason: string | null } }>(
    baseUrl,
    '/operator/safety/stop',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Phase12 proof emergency stop.' }),
    },
  );
  assert(stop.status === 200, 'phase12 proof expected safety stop 200');
  assert(stop.payload.safety.emergency_stop === true, 'phase12 proof expected emergency_stop=true after stop');

  const launchBlocked = await requestJson<{ error: string }>(baseUrl, '/control-room/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Run a blocked mission while safety stop is active.',
      dry_run: false,
      no_execute: false,
      worker_preference: 'shell',
    }),
  });
  assert(launchBlocked.status === 423, 'phase12 proof expected blocked control-room launch');

  const scheduleCreate = await requestJson<{ schedule: { id: string } }>(baseUrl, '/operator/schedules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'phase12_safety_schedule',
      goal: 'Run deterministic scheduled proof mission.',
      cadence: { kind: 'interval', every_minutes: 30 },
      worker_preference: 'shell',
      start_immediately: true,
    }),
  });
  assert(scheduleCreate.status === 200, 'phase12 proof expected schedule creation success');

  const schedulerBlocked = await requestJson<{
    report: { skipped: boolean; blocked_reason: string; processed_count: number };
  }>(baseUrl, '/operator/scheduler/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  assert(schedulerBlocked.status === 423, 'phase12 proof expected blocked scheduler tick');
  assert(schedulerBlocked.payload.report.skipped === true, 'phase12 proof expected skipped scheduler report while blocked');

  const queueEnqueue = await requestJson<{ item: { id: string } }>(baseUrl, '/operator/queue/enqueue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Process deterministic queued task after resume.',
      priority: 'urgent',
      source: 'phase12_proof',
    }),
  });
  assert(queueEnqueue.status === 200, 'phase12 proof expected queue enqueue success');

  const queueBlocked = await requestJson<{
    report: { skipped: boolean; blocked_reason: string; processed_count: number };
  }>(baseUrl, '/operator/queue/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  assert(queueBlocked.status === 423, 'phase12 proof expected blocked queue tick');
  assert(queueBlocked.payload.report.skipped === true, 'phase12 proof expected skipped queue report while blocked');

  const dashboardBlocked = await requestJson<{
    safety_state: { emergency_stop: boolean; reason: string | null } | null;
  }>(baseUrl, '/control-room/api/operator-dashboard');
  assert(dashboardBlocked.status === 200, 'phase12 proof expected operator dashboard to remain readable while blocked');
  assert(dashboardBlocked.payload.safety_state?.emergency_stop === true, 'phase12 proof expected dashboard emergency stop=true');

  const resume = await requestJson<{ safety: { emergency_stop: boolean; reason: string | null } }>(
    baseUrl,
    '/operator/safety/resume',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Phase12 proof resume.' }),
    },
  );
  assert(resume.status === 200, 'phase12 proof expected safety resume 200');
  assert(resume.payload.safety.emergency_stop === false, 'phase12 proof expected emergency_stop=false after resume');

  const launchAfterResume = await requestJson<{ mission_id: string; status: string }>(baseUrl, '/control-room/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Run deterministic mission after safety resume.',
      dry_run: false,
      no_execute: false,
      worker_preference: 'shell',
    }),
  });
  assert(launchAfterResume.status === 200, 'phase12 proof expected launch success after resume');
  assert(launchAfterResume.payload.status === 'verified_complete', 'phase12 proof expected verified_complete after resume');

  const schedulerAfterResume = await requestJson<{
    report: { skipped: boolean; processed_count: number; runs: Array<{ mission_id: string | null }> };
  }>(baseUrl, '/operator/scheduler/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  assert(schedulerAfterResume.status === 200, 'phase12 proof expected scheduler tick success after resume');
  assert(schedulerAfterResume.payload.report.skipped === false, 'phase12 proof expected scheduler tick not skipped after resume');

  const queueAfterResume = await requestJson<{
    report: { skipped: boolean; processed_count: number; items: Array<{ id: string }> };
  }>(baseUrl, '/operator/queue/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  assert(queueAfterResume.status === 200, 'phase12 proof expected queue tick success after resume');
  assert(queueAfterResume.payload.report.skipped === false, 'phase12 proof expected queue tick not skipped after resume');

  const payload = {
    generated_at: nowIso,
    safety_stop_reason: stop.payload.safety.reason,
    blocked_paths: {
      launch_status: launchBlocked.status,
      scheduler_tick_status: schedulerBlocked.status,
      queue_tick_status: queueBlocked.status,
    },
    resume_paths: {
      launch_status: launchAfterResume.status,
      launch_mission_status: launchAfterResume.payload.status,
      scheduler_tick_status: schedulerAfterResume.status,
      scheduler_processed_count: schedulerAfterResume.payload.report.processed_count,
      queue_tick_status: queueAfterResume.status,
      queue_processed_count: queueAfterResume.payload.report.processed_count,
    },
    invariants: {
      dashboard_readable_while_blocked: dashboardBlocked.status === 200,
      blocked_launch_returns_423: launchBlocked.status === 423,
      blocked_scheduler_returns_423: schedulerBlocked.status === 423,
      blocked_queue_returns_423: queueBlocked.status === 423,
      resume_restores_launch: launchAfterResume.status === 200,
      resume_restores_scheduler_tick: schedulerAfterResume.status === 200,
      resume_restores_queue_tick: queueAfterResume.status === 200,
    },
    artifacts: {
      created_schedule_id: scheduleCreate.payload.schedule.id,
      queued_item_id: queueEnqueue.payload.item.id,
      resumed_launch_mission_id: launchAfterResume.payload.mission_id,
    },
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase12-safety.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  scheduler.stopPolling();
  queue.stopPolling();
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Ignore temp cleanup failures.
  }
}

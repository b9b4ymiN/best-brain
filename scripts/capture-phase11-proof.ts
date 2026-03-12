import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';
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

function toScheduledRunStatus(view: { status: string }): 'verified_complete' | 'verification_failed' | 'rejected' | 'failed' {
  return view.status === 'verified_complete'
    ? 'verified_complete'
    : view.status === 'verification_failed'
      ? 'verification_failed'
      : view.status === 'rejected'
        ? 'rejected'
        : 'failed';
}

function isConsecutiveDaily(timestamps: number[]): boolean {
  if (timestamps.length <= 1) {
    return true;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  for (let index = 1; index < timestamps.length; index += 1) {
    const previous = timestamps[index - 1];
    const current = timestamps[index];
    if (previous == null || current == null) {
      return false;
    }
    const deltaDays = Math.round((current - previous) / dayMs);
    if (deltaDays !== 1) {
      return false;
    }
  }
  return true;
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase11-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const anchor = Date.parse('2026-03-10T08:55:00+07:00');
let nowMs = anchor;
const now = () => nowMs;

const brain = await BestBrain.open({
  owner: 'phase11-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

let server: ReturnType<typeof Bun.serve>;
const managerFactory = () => new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
  now: () => new Date(nowMs),
  workers: {
    shell: new StaticWorkerAdapter('shell', {
      summary: 'Shell command succeeded with deterministic proof for scheduled operator run.',
      status: 'success',
      artifacts: [
        { type: 'note', ref: 'worker://phase11/shell-proof', description: 'Scheduled shell proof note.' },
      ],
      proposed_checks: [{
        name: 'scheduled-shell-proof',
        passed: true,
        detail: 'Scheduled run returned a deterministic shell proof note.',
      }],
      raw_output: 'scheduled-shell-proof',
      invocation: null,
      process_output: null,
    }),
  },
});

const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory,
  memoryQualityProvider: () => brain.getMemoryQualityMetrics(),
  now,
});

controlRoom.updateAutonomyPolicy({
  default_level: 'semi_autonomous',
  routine_min_verified_runs: 1,
  mission_kind_levels: {
    command_execution_mission: 'semi_autonomous',
  },
});

const scheduler = new MissionScheduler({
  store: brain.store,
  now,
  runMission: async (schedule: ScheduledMissionRecord) => {
    const view = await controlRoom.launchMission({
      goal: schedule.goal,
      dry_run: false,
      no_execute: false,
      worker_preference: schedule.worker_preference,
    });
    return {
      mission_id: view.mission_id,
      status: toScheduledRunStatus(view),
      final_message: view.verdict?.summary ?? `Scheduled mission finished with ${view.status}.`,
    };
  },
});

const app = createApp(brain, { controlRoom, scheduler });
server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

try {
  const createdSchedule = scheduler.createSchedule({
    name: 'phase11_daily_operator_scan',
    goal: 'Run `bun --version` locally and return a concise proof note.',
    cadence: {
      kind: 'daily',
      time_hhmm: '09:00',
      timezone: 'Asia/Bangkok',
    },
    worker_preference: 'shell',
  });

  const runProofs: Array<{
    day_index: number;
    mission_id: string | null;
    schedule_status: string;
    mission_status: string | null;
    operator_review_status: string | null;
    autonomy_level: string | null;
    autonomy_auto_approved: boolean | null;
    autonomy_prior_verified_runs: number | null;
    started_at: number;
    finished_at: number;
  }> = [];

  for (let dayIndex = 1; dayIndex <= 3; dayIndex += 1) {
    const latestSchedule = scheduler.listSchedules().find((schedule) => schedule.id === createdSchedule.id);
    if (!latestSchedule) {
      throw new Error(`phase11 schedule missing before day ${dayIndex}`);
    }
    nowMs = Math.max(nowMs + 1_000, latestSchedule.next_run_at + 1_000);
    const tickReport = await scheduler.tick(1);
    if (tickReport.processed_count !== 1 || tickReport.runs.length !== 1) {
      throw new Error(`phase11 scheduler tick did not process exactly one run on day ${dayIndex}`);
    }
    const run = tickReport.runs[0]!;
    const missionView = run.mission_id ? controlRoom.getMissionView(run.mission_id) : null;
    runProofs.push({
      day_index: dayIndex,
      mission_id: run.mission_id,
      schedule_status: run.status,
      mission_status: missionView?.status ?? null,
      operator_review_status: missionView?.operator_review.status ?? null,
      autonomy_level: missionView?.autonomy?.effective_level ?? null,
      autonomy_auto_approved: missionView?.autonomy?.auto_approved ?? null,
      autonomy_prior_verified_runs: missionView?.autonomy?.prior_verified_runs ?? null,
      started_at: run.started_at,
      finished_at: run.finished_at,
    });
  }

  const verifiedCompleteCount = runProofs.filter((run) => run.schedule_status === 'verified_complete').length;
  const runStartTimes = runProofs.map((run) => run.started_at);
  const run1 = runProofs[0];
  const run2 = runProofs[1];
  const run3 = runProofs[2];

  const autonomyGatingCorrect = Boolean(
    run1
    && run2
    && run3
    && run1.autonomy_auto_approved === false
    && run1.operator_review_status === 'pending'
    && run2.autonomy_auto_approved === true
    && run2.operator_review_status === 'approved'
    && run3.autonomy_auto_approved === true
    && run3.operator_review_status === 'approved',
  );

  const operatorDashboard = controlRoom.listOperatorDashboard({
    scheduledMissions: scheduler.listSchedules(),
    queuedTasks: [],
  });

  const payload = {
    generated_at: new Date(nowMs).toISOString(),
    schedule_id: createdSchedule.id,
    scheduled_run_count: runProofs.length,
    scheduled_verified_complete_rate: Math.round((verifiedCompleteCount / runProofs.length) * 100),
    consecutive_daily_runs: isConsecutiveDaily(runStartTimes),
    autonomy_gating_correct: autonomyGatingCorrect,
    no_manual_intervention_steps: true,
    operator_dashboard_streams: {
      active_missions: operatorDashboard.active_missions.length,
      approval_queue: operatorDashboard.approval_queue.length,
      scheduled_missions: operatorDashboard.scheduled_missions.length,
      queued_tasks: operatorDashboard.queued_tasks.length,
      recent_alerts: operatorDashboard.recent_alerts.length,
    },
    runs: runProofs,
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase11-operator.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  scheduler.stopPolling();
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Ignore temp cleanup failures.
  }
}

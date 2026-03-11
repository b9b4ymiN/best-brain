import { BrainStore } from '../db/client.ts';
import type {
  ScheduleCadence,
  ScheduleRunStatus,
  ScheduleWorkerPreference,
  ScheduledMissionRecord,
} from './types.ts';

function parseDailyTime(value: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`invalid daily time format: ${value} (expected HH:mm)`);
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function nextRunAtFromCadence(cadence: ScheduleCadence, referenceTimestamp: number): number {
  if (cadence.kind === 'interval') {
    return referenceTimestamp + cadence.every_minutes * 60 * 1000;
  }

  const { hour, minute } = parseDailyTime(cadence.time_hhmm);
  const next = new Date(referenceTimestamp);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= referenceTimestamp) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

export interface ScheduledMissionCreateInput {
  name: string;
  goal: string;
  cadence: ScheduleCadence;
  worker_preference?: ScheduleWorkerPreference;
  start_immediately?: boolean;
}

export interface ScheduledMissionExecutionResult {
  mission_id: string | null;
  status: 'verified_complete' | 'verification_failed' | 'rejected' | 'failed';
  final_message: string;
}

export interface ScheduledMissionRunReport {
  schedule_id: string;
  mission_id: string | null;
  status: ScheduleRunStatus;
  error: string | null;
  started_at: number;
  finished_at: number;
  next_run_at: number;
}

export interface SchedulerTickReport {
  started_at: number;
  finished_at: number;
  claimed_count: number;
  processed_count: number;
  skipped: boolean;
  runs: ScheduledMissionRunReport[];
}

export interface MissionSchedulerOptions {
  store: BrainStore;
  runMission: (schedule: ScheduledMissionRecord) => Promise<ScheduledMissionExecutionResult>;
  now?: () => number;
  logger?: (message: string, data?: Record<string, unknown>) => void;
}

export class MissionScheduler {
  private readonly store: BrainStore;
  private readonly runMission: MissionSchedulerOptions['runMission'];
  private readonly now: () => number;
  private readonly logger: MissionSchedulerOptions['logger'] | null;
  private pollTimer: Timer | null = null;
  private tickActive = false;

  constructor(options: MissionSchedulerOptions) {
    this.store = options.store;
    this.runMission = options.runMission;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? null;
  }

  listSchedules(): ScheduledMissionRecord[] {
    return this.store.listScheduledMissions();
  }

  createSchedule(input: ScheduledMissionCreateInput): ScheduledMissionRecord {
    const name = input.name.trim();
    const goal = input.goal.trim();
    if (!name) {
      throw new Error('schedule name is required');
    }
    if (!goal) {
      throw new Error('schedule goal is required');
    }
    if (input.cadence.kind === 'interval' && input.cadence.every_minutes <= 0) {
      throw new Error('interval cadence must have every_minutes > 0');
    }
    if (input.cadence.kind === 'daily') {
      parseDailyTime(input.cadence.time_hhmm);
    }

    const timestamp = this.now();
    const nextRunAt = input.start_immediately === true
      ? timestamp
      : nextRunAtFromCadence(input.cadence, timestamp);

    return this.store.insertScheduledMission({
      name,
      goal,
      workerPreference: input.worker_preference ?? 'auto',
      cadenceKind: input.cadence.kind,
      cadenceConfig: input.cadence,
      nextRunAt,
      createdAt: timestamp,
    });
  }

  pauseSchedule(scheduleId: string): ScheduledMissionRecord {
    const updated = this.store.setScheduledMissionPaused(scheduleId, true, this.now());
    if (!updated) {
      throw new Error(`schedule not found: ${scheduleId}`);
    }
    return updated;
  }

  resumeSchedule(scheduleId: string): ScheduledMissionRecord {
    const updated = this.store.setScheduledMissionPaused(scheduleId, false, this.now());
    if (!updated) {
      throw new Error(`schedule not found: ${scheduleId}`);
    }
    return updated;
  }

  async runNow(scheduleId: string): Promise<ScheduledMissionRunReport> {
    const timestamp = this.now();
    const updated = this.store.scheduleMissionRunNow(scheduleId, timestamp);
    if (!updated) {
      throw new Error(`schedule not found or disabled: ${scheduleId}`);
    }
    const claimed = this.store.claimScheduledMissionById(scheduleId, timestamp);
    if (!claimed) {
      throw new Error(`schedule is not runnable right now: ${scheduleId}`);
    }
    return await this.executeClaimedSchedule(claimed);
  }

  async tick(limit = 3): Promise<SchedulerTickReport> {
    const startedAt = this.now();
    if (this.tickActive) {
      return {
        started_at: startedAt,
        finished_at: this.now(),
        claimed_count: 0,
        processed_count: 0,
        skipped: true,
        runs: [],
      };
    }

    this.tickActive = true;
    try {
      const claimed = this.store.claimDueScheduledMissions(startedAt, Math.max(1, limit));
      const runs: ScheduledMissionRunReport[] = [];
      for (const schedule of claimed) {
        runs.push(await this.executeClaimedSchedule(schedule));
      }
      const finishedAt = this.now();
      return {
        started_at: startedAt,
        finished_at: finishedAt,
        claimed_count: claimed.length,
        processed_count: runs.length,
        skipped: false,
        runs,
      };
    } finally {
      this.tickActive = false;
    }
  }

  startPolling(intervalMs = 30_000): void {
    if (this.pollTimer) {
      return;
    }
    const effectiveInterval = Math.max(1_000, intervalMs);
    this.pollTimer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger?.('scheduler_tick_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, effectiveInterval);
    this.pollTimer.unref?.();
  }

  stopPolling(): void {
    if (!this.pollTimer) {
      return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async executeClaimedSchedule(schedule: ScheduledMissionRecord): Promise<ScheduledMissionRunReport> {
    if (!schedule.run_lock_token) {
      throw new Error(`claimed schedule is missing run lock token: ${schedule.id}`);
    }

    const startedAt = this.now();
    let status: ScheduleRunStatus = 'failed';
    let error: string | null = null;
    let missionId: string | null = null;

    try {
      const result = await this.runMission(schedule);
      missionId = result.mission_id;
      status = result.status;
      if (status === 'failed') {
        error = result.final_message;
      }
    } catch (runError) {
      status = 'failed';
      error = runError instanceof Error ? runError.message : String(runError);
    }

    const finishedAt = this.now();
    const nextRunAt = nextRunAtFromCadence(schedule.cadence_config, finishedAt);
    const completed = this.store.completeScheduledMissionRun({
      scheduleId: schedule.id,
      lockToken: schedule.run_lock_token,
      status,
      errorMessage: error,
      missionId,
      finishedAt,
      nextRunAt,
    });
    if (!completed) {
      throw new Error(`failed to finalize schedule run: ${schedule.id}`);
    }

    const report: ScheduledMissionRunReport = {
      schedule_id: schedule.id,
      mission_id: missionId,
      status,
      error,
      started_at: startedAt,
      finished_at: finishedAt,
      next_run_at: nextRunAt,
    };
    this.logger?.('scheduler_run_completed', { ...report });
    return report;
  }
}

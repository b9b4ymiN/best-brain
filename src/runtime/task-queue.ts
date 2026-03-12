import { BrainStore } from '../db/client.ts';
import type { ManagerRunResult } from '../manager/types.ts';
import type {
  ScheduleWorkerPreference,
  TaskQueueItemRecord,
  TaskQueuePriority,
} from './types.ts';

export interface TaskQueueEnqueueInput {
  parent_mission_id?: string | null;
  goal: string;
  priority: TaskQueuePriority;
  source: string;
  worker_preference?: ScheduleWorkerPreference;
  queued_by?: string;
  max_attempts?: number;
  next_attempt_at?: number;
}

export interface QueueExecutionResult {
  mission_id: string | null;
  status: 'verified_complete' | 'verification_failed' | 'rejected' | 'failed';
  final_message: string;
  retryable: boolean;
}

export interface TaskQueueTickItemReport {
  queue_item_id: string;
  mission_id: string | null;
  status: QueueExecutionResult['status'];
  final_status: TaskQueueItemRecord['status'];
  retry_scheduled: boolean;
  retry_at: number | null;
  error: string | null;
}

export interface TaskQueueTickReport {
  started_at: number;
  finished_at: number;
  processed_count: number;
  skipped: boolean;
  blocked_reason: string | null;
  items: TaskQueueTickItemReport[];
}

export interface AutonomousTaskQueueOptions {
  store: BrainStore;
  executeTask: (item: TaskQueueItemRecord) => Promise<QueueExecutionResult>;
  isExecutionAllowed?: () => boolean;
  blockedReason?: () => string;
  now?: () => number;
  logger?: (message: string, data?: Record<string, unknown>) => void;
}

function buildRetryGoal(result: ManagerRunResult): string {
  const heuristics = result.mission_brief.playbook.repair_heuristics
    .slice(0, 2)
    .map((heuristic) => heuristic.instruction);
  const notes = [
    `Retry mission ${result.mission_brief.mission_id} after ${result.verification_result?.status ?? 'failed'} verification.`,
    `Original goal: ${result.input.goal}`,
    `Last failure summary: ${result.final_message}`,
  ];
  if (heuristics.length > 0) {
    notes.push(`Repair heuristics: ${heuristics.join(' | ')}`);
  }
  return notes.join('\n');
}

function retryDelayMs(attemptCount: number): number {
  const backoffMinutes = Math.min(15, 2 ** Math.max(0, attemptCount - 1));
  return backoffMinutes * 60 * 1000;
}

export class AutonomousTaskQueue {
  private readonly store: BrainStore;
  private readonly executeTask: AutonomousTaskQueueOptions['executeTask'];
  private readonly isExecutionAllowed: () => boolean;
  private readonly blockedReason: () => string;
  private readonly now: () => number;
  private readonly logger: AutonomousTaskQueueOptions['logger'] | null;
  private pollTimer: Timer | null = null;
  private tickActive = false;

  constructor(options: AutonomousTaskQueueOptions) {
    this.store = options.store;
    this.executeTask = options.executeTask;
    this.isExecutionAllowed = options.isExecutionAllowed ?? (() => true);
    this.blockedReason = options.blockedReason ?? (() => 'task queue execution is paused by operator safety stop');
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? null;
  }

  listItems(): TaskQueueItemRecord[] {
    return this.store.listTaskQueueItems();
  }

  enqueue(input: TaskQueueEnqueueInput): TaskQueueItemRecord {
    const goal = input.goal.trim();
    if (!goal) {
      throw new Error('queue goal is required');
    }
    const timestamp = this.now();
    return this.store.insertTaskQueueItem({
      parentMissionId: input.parent_mission_id ?? null,
      goal,
      priority: input.priority,
      source: input.source,
      workerPreference: input.worker_preference ?? 'auto',
      queuedBy: input.queued_by ?? 'manager',
      maxAttempts: input.max_attempts ?? 3,
      nextAttemptAt: input.next_attempt_at ?? timestamp,
      createdAt: timestamp,
    });
  }

  enqueueIfMissing(input: TaskQueueEnqueueInput): { enqueued: boolean; item: TaskQueueItemRecord } {
    const duplicate = this.store.findOpenTaskQueueDuplicate({
      parentMissionId: input.parent_mission_id ?? null,
      goal: input.goal.trim(),
      source: input.source,
    });
    if (duplicate) {
      return { enqueued: false, item: duplicate };
    }
    return { enqueued: true, item: this.enqueue(input) };
  }

  enqueueFollowupsFromResult(result: ManagerRunResult): TaskQueueItemRecord[] {
    const queued: TaskQueueItemRecord[] = [];
    if (result.decision.kind === 'chat' || !result.verification_result) {
      return queued;
    }
    const normalizedGoal = result.input.goal.trim().toLowerCase();
    const queueGeneratedGoal = normalizedGoal.startsWith('retry mission ')
      || normalizedGoal.startsWith('process follow-up task derived from mission ');
    if (queueGeneratedGoal) {
      return queued;
    }

    if (result.verification_result.status === 'verification_failed' && result.retryable) {
      const retryGoal = buildRetryGoal(result);
      const retry = this.enqueueIfMissing({
        parent_mission_id: result.mission_brief.mission_id,
        goal: retryGoal,
        priority: 'urgent',
        source: 'verification_retry',
        worker_preference: result.decision.selected_worker ?? 'auto',
        queued_by: 'manager',
        max_attempts: 3,
      });
      if (retry.enqueued) {
        queued.push(retry.item);
      }
    }

    if (result.verification_result.status === 'verified_complete' && result.mission_brief.planning_hints.length > 0) {
      const nextActionGoal = [
        `Process follow-up task derived from mission ${result.mission_brief.mission_id}.`,
        `Original goal: ${result.input.goal}`,
        `Planning hints: ${result.mission_brief.planning_hints.slice(0, 2).join(' | ')}`,
      ].join('\n');
      const followup = this.enqueueIfMissing({
        parent_mission_id: result.mission_brief.mission_id,
        goal: nextActionGoal,
        priority: 'background',
        source: 'planning_followup',
        worker_preference: 'auto',
        queued_by: 'manager',
        max_attempts: 2,
      });
      if (followup.enqueued) {
        queued.push(followup.item);
      }
    }

    return queued;
  }

  cancel(queueItemId: string, reason: string | null = null): TaskQueueItemRecord {
    const item = this.store.cancelTaskQueueItem(queueItemId, this.now(), reason);
    if (!item) {
      throw new Error(`queue item not found or not cancellable: ${queueItemId}`);
    }
    return item;
  }

  async tick(limit = 3): Promise<TaskQueueTickReport> {
    const startedAt = this.now();
    if (!this.isExecutionAllowed()) {
      return {
        started_at: startedAt,
        finished_at: this.now(),
        processed_count: 0,
        skipped: true,
        blocked_reason: this.blockedReason(),
        items: [],
      };
    }
    if (this.tickActive) {
      return {
        started_at: startedAt,
        finished_at: this.now(),
        processed_count: 0,
        skipped: true,
        blocked_reason: null,
        items: [],
      };
    }

    this.tickActive = true;
    try {
      const max = Math.max(1, limit);
      const reports: TaskQueueTickItemReport[] = [];
      for (let index = 0; index < max; index += 1) {
        const claimed = this.store.claimNextTaskQueueItem(this.now());
        if (!claimed) {
          break;
        }
        reports.push(await this.executeClaimedItem(claimed));
      }
      return {
        started_at: startedAt,
        finished_at: this.now(),
        processed_count: reports.length,
        skipped: false,
        blocked_reason: null,
        items: reports,
      };
    } finally {
      this.tickActive = false;
    }
  }

  startPolling(intervalMs = 20_000): void {
    if (this.pollTimer) {
      return;
    }
    const effectiveInterval = Math.max(1_000, intervalMs);
    this.pollTimer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger?.('task_queue_tick_failed', {
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

  private async executeClaimedItem(item: TaskQueueItemRecord): Promise<TaskQueueTickItemReport> {
    if (!item.run_lock_token) {
      throw new Error(`queue item is missing lock token: ${item.id}`);
    }

    let result: QueueExecutionResult;
    try {
      result = await this.executeTask(item);
    } catch (error) {
      result = {
        mission_id: null,
        status: 'failed',
        final_message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }

    const completedAt = this.now();
    if (result.status === 'verified_complete') {
      const completed = this.store.completeTaskQueueItem({
        id: item.id,
        lockToken: item.run_lock_token,
        missionId: result.mission_id,
        completedAt,
      });
      if (!completed) {
        throw new Error(`failed to complete queue item: ${item.id}`);
      }
      const report: TaskQueueTickItemReport = {
        queue_item_id: item.id,
        mission_id: result.mission_id,
        status: result.status,
        final_status: completed.status,
        retry_scheduled: false,
        retry_at: null,
        error: null,
      };
      this.logger?.('task_queue_item_completed', { ...report });
      return report;
    }

    const canRetry = result.retryable && item.attempt_count < item.max_attempts;
    const retryAt = canRetry
      ? completedAt + retryDelayMs(item.attempt_count)
      : null;
    const failed = this.store.failTaskQueueItem({
      id: item.id,
      lockToken: item.run_lock_token,
      errorMessage: result.final_message,
      retryAt,
      completedAt,
      missionId: result.mission_id,
    });
    if (!failed) {
      throw new Error(`failed to fail queue item: ${item.id}`);
    }
    const report: TaskQueueTickItemReport = {
      queue_item_id: item.id,
      mission_id: result.mission_id,
      status: result.status,
      final_status: failed.status,
      retry_scheduled: retryAt != null,
      retry_at: retryAt,
      error: result.final_message,
    };
    this.logger?.('task_queue_item_failed', { ...report });
    return report;
  }
}

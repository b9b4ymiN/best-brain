import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';
import { AutonomousTaskQueue } from '../src/runtime/task-queue.ts';
import { OperatorSafetyController } from '../src/runtime/safety.ts';
import type { ScheduledMissionRecord } from '../src/runtime/types.ts';
import { createTestBrain } from './helpers.ts';

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

function mapScheduleStatus(status: string): 'verified_complete' | 'verification_failed' | 'rejected' | 'failed' {
  return status === 'verified_complete'
    ? 'verified_complete'
    : status === 'verification_failed'
      ? 'verification_failed'
      : status === 'rejected'
        ? 'rejected'
        : 'failed';
}

describe('operator safety HTTP gates', () => {
  test('blocks launch and runtime ticks while emergency-stop is active', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'safety-http-owner' });
    let server: ReturnType<typeof Bun.serve>;
    const safety = new OperatorSafetyController({
      dataDir: brain.config.dataDir,
    });
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory: () => new ManagerRuntime({
        brain: new BrainHttpAdapter({
          baseUrl: `http://127.0.0.1:${server.port}`,
          autoStart: false,
        }),
        workers: {
          shell: new StaticWorkerAdapter('shell', {
            summary: 'Shell command completed with deterministic proof.',
            status: 'success',
            artifacts: [{ type: 'note', ref: 'worker://safety/shell-proof', description: 'safety test proof' }],
            proposed_checks: [{ name: 'safety-shell-proof', passed: true }],
            raw_output: 'ok',
            invocation: null,
            process_output: null,
          }),
        },
      }),
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
          status: mapScheduleStatus(view.status),
          final_message: view.verdict?.summary ?? `status=${view.status}`,
        };
      },
    });
    const queue = new AutonomousTaskQueue({
      store: brain.store,
      isExecutionAllowed: () => safety.isExecutionAllowed(),
      blockedReason: () => safety.getState().reason ?? 'operator safety stop is active',
      executeTask: async (item) => ({
        mission_id: `mission_${item.id}`,
        status: 'verified_complete',
        final_message: 'ok',
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

      const safetyInitial = await fetch(`${baseUrl}/operator/safety`);
      expect(safetyInitial.status).toBe(200);
      const safetyInitialPayload = await safetyInitial.json() as { safety: { emergency_stop: boolean } };
      expect(safetyInitialPayload.safety.emergency_stop).toBe(false);

      const stopResponse = await fetch(`${baseUrl}/operator/safety/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Safety stop for HTTP gating test.' }),
      });
      expect(stopResponse.status).toBe(200);

      const launchBlocked = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'Run a mission while blocked.', dry_run: false }),
      });
      expect(launchBlocked.status).toBe(423);

      const createSchedule = await fetch(`${baseUrl}/operator/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'safety schedule',
          goal: 'Run a safety schedule mission.',
          cadence: { kind: 'interval', every_minutes: 30 },
          start_immediately: true,
        }),
      });
      expect(createSchedule.status).toBe(200);

      const schedulerTickBlocked = await fetch(`${baseUrl}/operator/scheduler/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
      });
      expect(schedulerTickBlocked.status).toBe(423);
      const schedulerTickPayload = await schedulerTickBlocked.json() as {
        report: { skipped: boolean; blocked_reason: string };
      };
      expect(schedulerTickPayload.report.skipped).toBe(true);
      expect(schedulerTickPayload.report.blocked_reason.toLowerCase()).toContain('operator safety stop');

      const queueEnqueue = await fetch(`${baseUrl}/operator/queue/enqueue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Queue task while blocked.',
          priority: 'urgent',
          source: 'safety_http_test',
        }),
      });
      expect(queueEnqueue.status).toBe(200);

      const queueTickBlocked = await fetch(`${baseUrl}/operator/queue/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
      });
      expect(queueTickBlocked.status).toBe(423);

      const operatorDashboardBlocked = await fetch(`${baseUrl}/control-room/api/operator-dashboard`);
      expect(operatorDashboardBlocked.status).toBe(200);
      const operatorDashboardPayload = await operatorDashboardBlocked.json() as {
        safety_state: { emergency_stop: boolean; reason: string | null } | null;
      };
      expect(operatorDashboardPayload.safety_state?.emergency_stop).toBe(true);
      expect(operatorDashboardPayload.safety_state?.reason).toBe('Safety stop for HTTP gating test.');

      const resumeResponse = await fetch(`${baseUrl}/operator/safety/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Resume after safety test.' }),
      });
      expect(resumeResponse.status).toBe(200);

      const launchAfterResume = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: 'Run mission after safety resume.', dry_run: false }),
      });
      expect(launchAfterResume.status).toBe(200);
      const launchAfterResumePayload = await launchAfterResume.json() as { status: string };
      expect(launchAfterResumePayload.status).toBe('verified_complete');
    } finally {
      scheduler.stopPolling();
      queue.stopPolling();
      server.stop(true);
      cleanup();
    }
  });
});

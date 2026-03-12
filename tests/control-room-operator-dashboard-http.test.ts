import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';
import { AutonomousTaskQueue } from '../src/runtime/task-queue.ts';
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

describe('control-room operator dashboard HTTP', () => {
  test('shows active streams and supports one-click override for running missions', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'operator-owner' });
    let server: ReturnType<typeof Bun.serve>;
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      memoryQualityProvider: () => brain.getMemoryQualityMetrics(),
      managerFactory: () => new ManagerRuntime({
        brain: new BrainHttpAdapter({
          baseUrl: `http://127.0.0.1:${server.port}`,
          autoStart: false,
        }),
        workers: {
          shell: new StaticWorkerAdapter('shell', {
            summary: 'Shell command completed with deterministic proof.',
            status: 'success',
            artifacts: [{ type: 'note', ref: 'worker://operator/success', description: 'operator dashboard test artifact' }],
            proposed_checks: [{ name: 'shell-proof', passed: true }],
            raw_output: 'ok',
            invocation: null,
            process_output: null,
          }),
        },
      }),
    });
    const scheduler = new MissionScheduler({
      store: brain.store,
      runMission: async () => ({
        mission_id: 'mission_scheduler_stub',
        status: 'verified_complete',
        final_message: 'stub',
      }),
    });
    const taskQueue = new AutonomousTaskQueue({
      store: brain.store,
      executeTask: async () => ({
        mission_id: 'mission_queue_stub',
        status: 'failed',
        final_message: 'stub',
        retryable: false,
      }),
    });

    const app = createApp(brain, {
      controlRoom,
      scheduler,
      taskQueue,
      workerDiagnostics: {
        collect: async () => ({
          generated_at: Date.now(),
          platform: 'win32',
          entries: [
            {
              worker: 'claude',
              available: true,
              execution_mode: 'cli',
              command: 'claude',
              args: ['--version'],
              detail: 'claude CLI is executable.',
              version: 'claude 2.x',
              checked_at: Date.now(),
              latency_ms: 10,
            },
            {
              worker: 'codex',
              available: false,
              execution_mode: 'cli',
              command: 'codex',
              args: ['--version'],
              detail: 'codex CLI was not found in PATH.',
              version: null,
              checked_at: Date.now(),
              latency_ms: 5,
            },
          ],
        }),
      } as any,
    });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;

      const verifiedLaunch = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run `bun --version` and return proof.',
          dry_run: false,
        }),
      });
      expect(verifiedLaunch.status).toBe(200);
      const verifiedView = await verifiedLaunch.json() as { mission_id: string; status: string };
      expect(verifiedView.status).toBe('verified_complete');

      const activeLaunch = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Plan next mission but do not execute.',
          dry_run: false,
          no_execute: true,
        }),
      });
      expect(activeLaunch.status).toBe(200);
      const activeView = await activeLaunch.json() as { mission_id: string; status: string };
      expect(activeView.status).toBe('in_progress');

      const scheduleCreate = await fetch(`${baseUrl}/operator/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'daily operator test',
          goal: 'Run a routine operator mission.',
          cadence: {
            kind: 'interval',
            every_minutes: 30,
          },
        }),
      });
      expect(scheduleCreate.status).toBe(200);

      const queueEnqueue = await fetch(`${baseUrl}/operator/queue/enqueue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Follow-up operator task',
          priority: 'urgent',
          source: 'operator_dashboard_test',
        }),
      });
      expect(queueEnqueue.status).toBe(200);

      const operatorDashboard = await fetch(`${baseUrl}/control-room/api/operator-dashboard`);
      expect(operatorDashboard.status).toBe(200);
      const operatorPayload = await operatorDashboard.json() as {
        active_missions: Array<{ mission_id: string; override_allowed: boolean }>;
        approval_queue: Array<{ mission_id: string; status: string }>;
        scheduled_missions: Array<{ id: string }>;
        queued_tasks: Array<{ id: string }>;
        autonomy_policy: { default_level: string };
        worker_diagnostics: { entries: Array<{ worker: string; available: boolean }> } | null;
      };
      expect(operatorPayload.autonomy_policy.default_level).toBe('supervised');
      expect(operatorPayload.active_missions.some((mission) => mission.mission_id === activeView.mission_id && mission.override_allowed)).toBe(true);
      expect(operatorPayload.approval_queue.some((item) => item.mission_id === verifiedView.mission_id && item.status === 'verified_complete')).toBe(true);
      expect(operatorPayload.scheduled_missions.length).toBeGreaterThan(0);
      expect(operatorPayload.queued_tasks.length).toBeGreaterThan(0);
      expect(operatorPayload.worker_diagnostics?.entries.some((entry) => entry.worker === 'claude' && entry.available)).toBe(true);
      expect(operatorPayload.worker_diagnostics?.entries.some((entry) => entry.worker === 'codex' && !entry.available)).toBe(true);

      const override = await fetch(`${baseUrl}/control-room/api/operator/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mission_id: activeView.mission_id,
          note: 'Operator override from dashboard smoke test.',
        }),
      });
      expect(override.status).toBe(200);
      const overridePayload = await override.json() as {
        accepted: boolean;
        view: { status: string; operator_review: { status: string } };
      };
      expect(overridePayload.accepted).toBe(true);
      expect(overridePayload.view.status).toBe('rejected');
      expect(overridePayload.view.operator_review.status).toBe('cancelled');

      const operatorDashboardAfter = await fetch(`${baseUrl}/control-room/api/operator-dashboard`);
      expect(operatorDashboardAfter.status).toBe(200);
      const operatorPayloadAfter = await operatorDashboardAfter.json() as {
        active_missions: Array<{ mission_id: string }>;
      };
      expect(operatorPayloadAfter.active_missions.some((mission) => mission.mission_id === activeView.mission_id)).toBe(false);
    } finally {
      scheduler.stopPolling();
      taskQueue.stopPolling();
      server.stop(true);
      cleanup();
    }
  });
});

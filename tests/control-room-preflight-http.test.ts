import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { OperatorSafetyController } from '../src/runtime/safety.ts';
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

describe('control-room preflight HTTP', () => {
  test('blocks unavailable explicit worker and safety stop, while auto mode receives advisories', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'preflight-owner' });
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
            summary: 'ok',
            status: 'success',
            artifacts: [{ type: 'note', ref: 'worker://preflight/shell' }],
            proposed_checks: [{ name: 'preflight-shell', passed: true }],
            raw_output: 'ok',
            invocation: null,
            process_output: null,
          }),
        },
      }),
      operatorSafetyProvider: () => safety.getState(),
    });

    const app = createApp(brain, {
      controlRoom,
      operatorSafety: safety,
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
            {
              worker: 'shell',
              available: true,
              execution_mode: 'cli',
              command: 'bun',
              args: ['--version'],
              detail: 'bun CLI is executable.',
              version: '1.x',
              checked_at: Date.now(),
              latency_ms: 3,
            },
            {
              worker: 'browser',
              available: true,
              execution_mode: 'manager_owned',
              command: null,
              args: [],
              detail: 'browser worker is manager-owned and available.',
              version: null,
              checked_at: Date.now(),
              latency_ms: 0,
            },
            {
              worker: 'mail',
              available: true,
              execution_mode: 'manager_owned',
              command: null,
              args: [],
              detail: 'mail worker is manager-owned and available.',
              version: null,
              checked_at: Date.now(),
              latency_ms: 0,
            },
            {
              worker: 'verifier',
              available: true,
              execution_mode: 'manager_owned',
              command: null,
              args: [],
              detail: 'verifier worker is manager-owned and available.',
              version: null,
              checked_at: Date.now(),
              latency_ms: 0,
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

      const explicitUnavailable = await fetch(`${baseUrl}/control-room/api/operator/preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run with codex',
          worker_preference: 'codex',
        }),
      });
      expect(explicitUnavailable.status).toBe(423);
      const explicitPayload = await explicitUnavailable.json() as {
        blocked: boolean;
        blockers: Array<{ code: string; worker: string | null }>;
      };
      expect(explicitPayload.blocked).toBe(true);
      expect(explicitPayload.blockers.some((blocker) => blocker.code === 'worker_unavailable' && blocker.worker === 'codex')).toBe(true);

      const autoAdvisory = await fetch(`${baseUrl}/control-room/api/operator/preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run with auto',
          worker_preference: 'auto',
        }),
      });
      expect(autoAdvisory.status).toBe(200);
      const autoPayload = await autoAdvisory.json() as {
        blocked: boolean;
        advisories: Array<{ code: string; worker: string }>;
      };
      expect(autoPayload.blocked).toBe(false);
      expect(autoPayload.advisories.some((advisory) => advisory.code === 'worker_unavailable' && advisory.worker === 'codex')).toBe(true);

      safety.activate('paused for preflight test', 'test');
      const blockedBySafety = await fetch(`${baseUrl}/control-room/api/operator/preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run while paused',
          worker_preference: 'auto',
        }),
      });
      expect(blockedBySafety.status).toBe(423);
      const safetyPayload = await blockedBySafety.json() as {
        blocked: boolean;
        blockers: Array<{ code: string }>;
      };
      expect(safetyPayload.blocked).toBe(true);
      expect(safetyPayload.blockers.some((blocker) => blocker.code === 'safety_stop')).toBe(true);
    } finally {
      server.stop(true);
      cleanup();
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
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

describe('control-room autonomy policy HTTP', () => {
  test('supports policy updates and semi-autonomous routine auto-approval by mission kind', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'autonomy-owner' });
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
            summary: 'Shell command succeeded with a concise proof note.',
            status: 'success',
            artifacts: [{ type: 'note', ref: 'worker://shell/success', description: 'Command proof note.' }],
            proposed_checks: [{ name: 'command-succeeded', passed: true }],
            raw_output: 'ok',
            invocation: null,
            process_output: null,
          }),
        },
      }),
    });
    const app = createApp(brain, { controlRoom });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;

      const defaultPolicyResponse = await fetch(`${baseUrl}/control-room/api/autonomy-policy`);
      expect(defaultPolicyResponse.status).toBe(200);
      const defaultPolicyPayload = await defaultPolicyResponse.json() as {
        policy: { default_level: string };
      };
      expect(defaultPolicyPayload.policy.default_level).toBe('supervised');

      const updatePolicyResponse = await fetch(`${baseUrl}/control-room/api/autonomy-policy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          default_level: 'semi_autonomous',
          routine_min_verified_runs: 1,
        }),
      });
      expect(updatePolicyResponse.status).toBe(200);
      const updatedPolicyPayload = await updatePolicyResponse.json() as {
        policy: {
          default_level: string;
          routine_min_verified_runs: number;
        };
      };
      expect(updatedPolicyPayload.policy.default_level).toBe('semi_autonomous');
      expect(updatedPolicyPayload.policy.routine_min_verified_runs).toBe(1);

      const launch1 = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run `bun --version` locally and return a concise proof note.',
          dry_run: false,
        }),
      });
      expect(launch1.status).toBe(200);
      const mission1 = await launch1.json() as {
        operator_review: { status: string };
        autonomy: {
          effective_level: string;
          is_routine: boolean;
          requires_operator_approval: boolean;
        } | null;
      };
      expect(mission1.autonomy?.effective_level).toBe('semi_autonomous');
      expect(mission1.autonomy?.is_routine).toBe(false);
      expect(mission1.autonomy?.requires_operator_approval).toBe(true);
      expect(mission1.operator_review.status).toBe('pending');

      const launch2 = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run `bun --version` locally and return a concise proof note.',
          dry_run: false,
        }),
      });
      expect(launch2.status).toBe(200);
      const mission2 = await launch2.json() as {
        operator_review: { status: string };
        autonomy: {
          effective_level: string;
          is_routine: boolean;
          requires_operator_approval: boolean;
          auto_approved: boolean;
        } | null;
        allowed_actions: string[];
      };
      expect(mission2.autonomy?.effective_level).toBe('semi_autonomous');
      expect(mission2.autonomy?.is_routine).toBe(true);
      expect(mission2.autonomy?.requires_operator_approval).toBe(false);
      expect(mission2.autonomy?.auto_approved).toBe(true);
      expect(mission2.operator_review.status).toBe('approved');
      expect(mission2.allowed_actions.includes('approve_verdict')).toBe(false);

      const overridePolicyResponse = await fetch(`${baseUrl}/control-room/api/autonomy-policy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mission_kind_levels: {
            command_execution_mission: 'supervised',
          },
        }),
      });
      expect(overridePolicyResponse.status).toBe(200);

      const launch3 = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run `bun --version` locally and return a concise proof note.',
          dry_run: false,
        }),
      });
      expect(launch3.status).toBe(200);
      const mission3 = await launch3.json() as {
        operator_review: { status: string };
        autonomy: {
          effective_level: string;
          requires_operator_approval: boolean;
        } | null;
      };
      expect(mission3.autonomy?.effective_level).toBe('supervised');
      expect(mission3.autonomy?.requires_operator_approval).toBe(true);
      expect(mission3.operator_review.status).toBe('pending');
    } finally {
      server.stop(true);
      cleanup();
    }
  });
});

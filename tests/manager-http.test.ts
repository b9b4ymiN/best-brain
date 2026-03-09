import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'node:net';
import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a free port.'));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

describe('manager alpha via brain HTTP', () => {
  test('executes a one-worker mission end-to-end and persists proof through the real HTTP contract', async () => {
    const { brain, cleanup } = await createTestBrain();
    const app = createApp(brain);
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    const runtime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      workers: {
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Worker produced a verifiable mission note.',
          status: 'success',
          artifacts: [{ type: 'note', ref: 'worker://manager-http/success', description: 'Mission proof note.' }],
          proposed_checks: [{ name: 'worker-proof-note', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      const result = await runtime.run({
        goal: 'Implement the manager proof chain for this repo.',
        mission_id: 'mission_http_manager',
        output_mode: 'json',
      });

      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.started_brain_server).toBe(false);

      const contextResponse = await fetch(`http://127.0.0.1:${server.port}/brain/context?mission_id=mission_http_manager&query=latest%20mission%20context`);
      const context = await contextResponse.json() as {
        verification_state: { status: string } | null;
        verification_artifacts: Array<{ source_kind: string }>;
      };

      expect(context.verification_state?.status).toBe('verified_complete');
      expect(context.verification_artifacts.some((artifact) => artifact.source_kind === 'verification_complete')).toBe(true);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('reuses the latest verified mission in a follow-up brief', async () => {
    const { brain, cleanup } = await createTestBrain();
    const app = createApp(brain);
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    const runtime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      workers: {
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Worker produced a verified mission seed.',
          status: 'success',
          artifacts: [{ type: 'note', ref: 'worker://manager-http/reuse', description: 'Reusable proof.' }],
          proposed_checks: [{ name: 'proof-ready', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      await runtime.run({
        goal: 'Implement the first verified manager mission.',
        mission_id: 'mission_reuse_source',
        output_mode: 'json',
      });

      const followUp = await runtime.run({
        goal: 'Plan the next mission using the latest mission proof.',
        worker_preference: 'claude',
        no_execute: true,
        output_mode: 'json',
      });

      expect(followUp.mission_brief.brain_citations.some((citation) => citation.title.includes('Mission outcome: Implement the first verified manager mission.'))).toBe(true);
      expect(followUp.brain_writes).toHaveLength(0);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('auto-starts the brain server when /health is unavailable', async () => {
    const port = await freePort();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-manager-autostart-'));
    const dbPath = path.join(dataDir, 'best-brain.db');
    const runtime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${port}`,
        autoStart: true,
        stopSpawnedServerOnDispose: true,
        cwd: process.cwd(),
        envOverrides: {
          BEST_BRAIN_DATA_DIR: dataDir,
          BEST_BRAIN_DB_PATH: dbPath,
          BEST_BRAIN_OWNER: 'manager-auto-start',
          BEST_BRAIN_PORT: String(port),
        },
      }),
      workers: {},
    });

    try {
      const result = await runtime.run({
        goal: 'Explain the preferred report format for the owner.',
        no_execute: true,
        output_mode: 'json',
      });

      expect(result.started_brain_server).toBe(true);
      expect(result.mission_brief.brain_trace_id.startsWith('trace_')).toBe(true);
    } finally {
      await runtime.dispose();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can keep SQLite WAL files open briefly.
      }
    }
  });
});

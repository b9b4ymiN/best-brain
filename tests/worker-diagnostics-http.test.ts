import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { createTestBrain } from './helpers.ts';

describe('worker diagnostics HTTP route', () => {
  test('returns a diagnostics snapshot for operator use', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'worker-diagnostics-owner' });
    const app = createApp(brain, {
      workerDiagnostics: {
        collect: async () => ({
          generated_at: 1_700_000_000_000,
          platform: 'win32',
          entries: [
            {
              worker: 'claude',
              available: true,
              execution_mode: 'cli',
              command: 'claude',
              args: ['--version'],
              detail: 'claude CLI is executable.',
              version: 'claude 1.0.0',
              checked_at: 1_700_000_000_000,
              latency_ms: 12,
            },
            {
              worker: 'codex',
              available: false,
              execution_mode: 'cli',
              command: 'codex',
              args: ['--version'],
              detail: 'codex CLI was not found in PATH.',
              version: null,
              checked_at: 1_700_000_000_000,
              latency_ms: 4,
            },
          ],
        }),
      } as any,
    });
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/operator/workers/diagnostics`);
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        diagnostics: {
          platform: string;
          entries: Array<{ worker: string; available: boolean; execution_mode: string }>;
        };
      };
      expect(payload.diagnostics.platform).toBe('win32');
      expect(payload.diagnostics.entries.some((entry) => entry.worker === 'claude' && entry.available)).toBe(true);
      expect(payload.diagnostics.entries.some((entry) => entry.worker === 'codex' && !entry.available)).toBe(true);
    } finally {
      server.stop(true);
      cleanup();
    }
  });
});

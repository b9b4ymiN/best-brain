import { describe, expect, test } from 'bun:test';
import { WorkerDiagnosticsService } from '../src/runtime/worker-diagnostics.ts';

describe('worker diagnostics service', () => {
  test('collects CLI and manager-owned diagnostics entries', async () => {
    const service = new WorkerDiagnosticsService({
      now: () => 1_700_000_000_000,
      cliProbe: async (worker) => ({
        available: worker !== 'codex',
        detail: worker === 'codex' ? 'codex missing from PATH' : `${worker} probe ok`,
        version: worker === 'codex' ? null : `${worker} v-test`,
        latency_ms: worker === 'shell' ? 25 : 10,
      }),
    });

    const snapshot = await service.collect();
    expect(snapshot.generated_at).toBe(1_700_000_000_000);
    expect(snapshot.entries).toHaveLength(6);

    const claude = snapshot.entries.find((entry) => entry.worker === 'claude');
    expect(claude?.execution_mode).toBe('cli');
    expect(claude?.available).toBe(true);
    expect(claude?.version).toBe('claude v-test');

    const codex = snapshot.entries.find((entry) => entry.worker === 'codex');
    expect(codex?.execution_mode).toBe('cli');
    expect(codex?.available).toBe(false);
    expect(codex?.detail).toContain('missing');

    const verifier = snapshot.entries.find((entry) => entry.worker === 'verifier');
    expect(verifier?.execution_mode).toBe('manager_owned');
    expect(verifier?.available).toBe(true);
    expect(verifier?.command).toBeNull();
  });
});

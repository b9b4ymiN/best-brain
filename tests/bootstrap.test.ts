import { describe, expect, test } from 'bun:test';
import { DEFAULT_PORT } from '../src/config.ts';
import { runBootstrapSmoke } from '../src/smoke/bootstrap.ts';

describe('bootstrap smoke', () => {
  test('proves first-run startup, health, and DB init on the current machine', async () => {
    const result = await runBootstrapSmoke({
      cwd: process.cwd(),
      skipInstall: true,
      timeoutMs: 15000,
      port: 0,
    });

    expect(result.install.attempted).toBe(false);
    expect(result.startup.port).toBeGreaterThan(0);
    expect(DEFAULT_PORT).toBe(47888);
    expect(result.startup.health_response?.status).toBe('ok');
    expect(result.startup.first_run_db_init_success).toBe(true);
    expect(result.runtime.default_data_dirs.win32.endsWith('best-brain')).toBe(true);
    expect(result.runtime.default_db_paths.linux.endsWith('/best-brain.db')).toBe(true);
  });
});

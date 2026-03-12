import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import type { SystemHealthSnapshot } from '../src/runtime/health.ts';
import { createTestBrain } from './helpers.ts';

describe('control-room system health HTTP', () => {
  test('exposes system health snapshot and recent alerts in overview and dedicated endpoint', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    const now = 1_700_000_000_000;
    const healthSnapshot: SystemHealthSnapshot = {
      generated_at: now,
      worker_availability: [
        { worker: 'claude', available: false, detail: 'claude missing', checked_at: now },
        { worker: 'codex', available: true, detail: 'ok', checked_at: now },
        { worker: 'shell', available: true, detail: 'ok', checked_at: now },
        { worker: 'browser', available: true, detail: 'ok', checked_at: now },
        { worker: 'mail', available: true, detail: 'ok', checked_at: now },
        { worker: 'verifier', available: true, detail: 'ok', checked_at: now },
      ],
      memory: {
        stale_ratio: 0.42,
        stale_candidate_count: 4,
        active_memory_count: 12,
      },
      missions: {
        window_hours: 24,
        total_runs: 5,
        verified_complete: 2,
        verification_failed: 2,
        rejected: 1,
        failure_rate: 0.6,
      },
      disk: {
        data_dir: brain.config.dataDir,
        bytes_used: 10_000_000,
        threshold_bytes: 2_000_000_000,
        usage_ratio: 0.005,
      },
      alerts: [{
        id: 'alert_worker',
        kind: 'worker_unavailable',
        severity: 'warning',
        message: 'claude worker unavailable',
        source_key: 'claude',
        created_at: now,
      }],
    };

    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory: () => {
        throw new Error('managerFactory should not be used in this health-only test');
      },
      memoryQualityProvider: () => brain.getMemoryQualityMetrics(),
      systemHealthProvider: () => healthSnapshot,
      recentAlertsProvider: () => healthSnapshot.alerts,
    });
    const app = createApp(brain, { controlRoom });

    try {
      const overviewResponse = await app.request('/control-room/api/overview');
      expect(overviewResponse.status).toBe(200);
      const overviewPayload = await overviewResponse.json() as {
        system_health: SystemHealthSnapshot | null;
        recent_alerts: Array<{ id: string }>;
      };
      expect(overviewPayload.system_health?.generated_at).toBe(now);
      expect(overviewPayload.recent_alerts[0]?.id).toBe('alert_worker');

      const healthResponse = await app.request('/control-room/api/system-health');
      expect(healthResponse.status).toBe(200);
      const healthPayload = await healthResponse.json() as {
        system_health: SystemHealthSnapshot | null;
        recent_alerts: Array<{ id: string }>;
      };
      expect(healthPayload.system_health?.worker_availability[0]?.worker).toBe('claude');
      expect(healthPayload.recent_alerts[0]?.id).toBe('alert_worker');
    } finally {
      cleanup();
    }
  });
});

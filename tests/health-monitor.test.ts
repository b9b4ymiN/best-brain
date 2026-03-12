import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'bun:test';
import { RuntimeHealthMonitor } from '../src/runtime/health.ts';
import { createTestBrain } from './helpers.ts';

describe('runtime health monitor', () => {
  test('raises alerts for worker down, memory staleness, failure-rate spikes, and disk pressure', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    const now = 1_700_000_000_000;

    try {
      brain.store.upsertMission({
        id: 'mission_health_ok',
        objective: 'ok',
        domain: 'best-brain',
        status: 'verified_complete',
        planning_hints: [],
        preferred_format: 'brief',
        verification_required: true,
        latest_outcome_memory_id: null,
        created_at: now - 60_000,
        updated_at: now - 30_000,
        started_at: now - 60_000,
        completed_at: now - 30_000,
        rejected_reason: null,
      });
      brain.store.upsertMission({
        id: 'mission_health_failed',
        objective: 'failed',
        domain: 'best-brain',
        status: 'verification_failed',
        planning_hints: [],
        preferred_format: 'brief',
        verification_required: true,
        latest_outcome_memory_id: null,
        created_at: now - 50_000,
        updated_at: now - 20_000,
        started_at: now - 50_000,
        completed_at: now - 20_000,
        rejected_reason: null,
      });
      brain.store.upsertMission({
        id: 'mission_health_rejected',
        objective: 'rejected',
        domain: 'best-brain',
        status: 'rejected',
        planning_hints: [],
        preferred_format: 'brief',
        verification_required: true,
        latest_outcome_memory_id: null,
        created_at: now - 40_000,
        updated_at: now - 10_000,
        started_at: now - 40_000,
        completed_at: now - 10_000,
        rejected_reason: 'policy',
      });

      fs.writeFileSync(path.join(brain.config.dataDir, 'disk-pressure.bin'), Buffer.alloc(2_048));

      const monitor = new RuntimeHealthMonitor({
        store: brain.store,
        dataDir: brain.config.dataDir,
        now: () => now,
        memoryQualityProvider: () => ({
          generated_at: now,
          active_memory_count: 10,
          stale_candidate_count: 5,
          stale_ratio: 0.5,
          unresolved_contradiction_count: 0,
          superseded_retrieval_leakage_count: 0,
          citation_usefulness_rating: 4.2,
        }),
        workerProbes: {
          claude: () => ({ available: false, detail: 'simulated claude outage' }),
          codex: () => ({ available: true, detail: 'ok' }),
          shell: () => ({ available: true, detail: 'ok' }),
          browser: () => ({ available: true, detail: 'ok' }),
          mail: () => ({ available: true, detail: 'ok' }),
          verifier: () => ({ available: true, detail: 'ok' }),
        },
        diskUsageWarnThresholdBytes: 1_024,
        missionWindowHours: 24,
        failureRateWarnThreshold: 0.4,
        memoryStaleRatioWarnThreshold: 0.35,
      });

      const snapshot = await monitor.evaluateNow();
      const alertKinds = snapshot.alerts.map((alert) => alert.kind);
      expect(alertKinds.includes('worker_unavailable')).toBe(true);
      expect(alertKinds.includes('memory_staleness')).toBe(true);
      expect(alertKinds.includes('mission_failure_rate')).toBe(true);
      expect(alertKinds.includes('disk_usage')).toBe(true);
      expect(snapshot.missions.total_runs).toBe(3);
      expect(snapshot.missions.failure_rate).toBeGreaterThanOrEqual(0.66);
      expect(monitor.listRecentAlerts(10).length).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup();
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { createTestBrain } from './helpers.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';

describe('mission scheduler', () => {
  test('creates schedules, toggles pause/resume, and runs immediately with persisted counters', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    let runCount = 0;
    try {
      const scheduler = new MissionScheduler({
        store: brain.store,
        runMission: async (schedule) => {
          runCount += 1;
          return {
            mission_id: `mission_${schedule.id}_${runCount}`,
            status: 'verified_complete',
            final_message: 'ok',
          };
        },
      });

      const created = scheduler.createSchedule({
        name: 'Daily scanner',
        goal: 'Run Thai equities scanner mission.',
        cadence: {
          kind: 'daily',
          time_hhmm: '09:00',
          timezone: 'local',
        },
      });
      expect(created.paused).toBe(false);
      expect(created.run_count).toBe(0);

      const paused = scheduler.pauseSchedule(created.id);
      expect(paused.paused).toBe(true);

      const resumed = scheduler.resumeSchedule(created.id);
      expect(resumed.paused).toBe(false);

      const report = await scheduler.runNow(created.id);
      expect(report.status).toBe('verified_complete');
      expect(report.mission_id).toContain(`mission_${created.id}_1`);

      const refreshed = brain.store.getScheduledMission(created.id);
      expect(refreshed).not.toBeNull();
      expect(refreshed?.run_count).toBe(1);
      expect(refreshed?.success_count).toBe(1);
      expect(refreshed?.failure_count).toBe(0);
      expect(refreshed?.run_lock).toBe(false);
      expect(refreshed?.last_status).toBe('verified_complete');
    } finally {
      cleanup();
    }
  });

  test('tick enforces single active loop and marks failed mission runs with released locks', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    try {
      const scheduler = new MissionScheduler({
        store: brain.store,
        runMission: async () => {
          await Bun.sleep(30);
          throw new Error('worker unavailable');
        },
      });

      const created = scheduler.createSchedule({
        name: 'Fast retry',
        goal: 'Run quick mission.',
        cadence: {
          kind: 'interval',
          every_minutes: 5,
        },
        start_immediately: true,
      });

      const runningTick = scheduler.tick(1);
      const skippedTick = await scheduler.tick(1);
      expect(skippedTick.skipped).toBe(true);
      const firstTick = await runningTick;
      expect(firstTick.skipped).toBe(false);
      expect(firstTick.claimed_count).toBe(1);
      expect(firstTick.processed_count).toBe(1);
      expect(firstTick.runs[0]?.status).toBe('failed');

      const refreshed = brain.store.getScheduledMission(created.id);
      expect(refreshed).not.toBeNull();
      expect(refreshed?.run_lock).toBe(false);
      expect(refreshed?.last_status).toBe('failed');
      expect(refreshed?.failure_count).toBe(1);
      expect(typeof refreshed?.last_error).toBe('string');
      expect((refreshed?.next_run_at ?? 0) > (refreshed?.last_run_finished_at ?? 0)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

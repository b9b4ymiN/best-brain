import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { MissionScheduler } from '../src/runtime/scheduler.ts';
import { createTestBrain } from './helpers.ts';

describe('operator scheduler HTTP routes', () => {
  test('creates, lists, pauses, resumes, ticks, and run-now schedules', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    let missionIndex = 0;
    try {
      const scheduler = new MissionScheduler({
        store: brain.store,
        runMission: async () => {
          missionIndex += 1;
          return {
            mission_id: `mission_sched_${missionIndex}`,
            status: 'verified_complete',
            final_message: 'completed',
          };
        },
      });
      const app = createApp(brain, { scheduler });

      const createResponse = await app.request('/operator/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily Run',
          goal: 'Run daily scanner goal.',
          cadence: {
            kind: 'daily',
            time_hhmm: '09:00',
            timezone: 'local',
          },
          worker_preference: 'auto',
          start_immediately: true,
        }),
      });
      expect(createResponse.status).toBe(200);
      const createdPayload = await createResponse.json() as {
        schedule: { id: string; paused: boolean };
      };
      const scheduleId = createdPayload.schedule.id;
      expect(createdPayload.schedule.paused).toBe(false);

      const listResponse = await app.request('/operator/schedules');
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as {
        schedules: Array<{ id: string }>;
      };
      expect(listPayload.schedules.some((schedule) => schedule.id === scheduleId)).toBe(true);

      const pauseResponse = await app.request(`/operator/schedules/${encodeURIComponent(scheduleId)}/pause`, {
        method: 'POST',
      });
      expect(pauseResponse.status).toBe(200);
      const pausePayload = await pauseResponse.json() as {
        schedule: { paused: boolean };
      };
      expect(pausePayload.schedule.paused).toBe(true);

      const resumeResponse = await app.request(`/operator/schedules/${encodeURIComponent(scheduleId)}/resume`, {
        method: 'POST',
      });
      expect(resumeResponse.status).toBe(200);
      const resumePayload = await resumeResponse.json() as {
        schedule: { paused: boolean };
      };
      expect(resumePayload.schedule.paused).toBe(false);

      const tickResponse = await app.request('/operator/scheduler/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 2 }),
      });
      expect(tickResponse.status).toBe(200);
      const tickPayload = await tickResponse.json() as {
        report: { processed_count: number };
      };
      expect(tickPayload.report.processed_count).toBeGreaterThanOrEqual(1);

      const runNowResponse = await app.request(`/operator/schedules/${encodeURIComponent(scheduleId)}/run-now`, {
        method: 'POST',
      });
      expect(runNowResponse.status).toBe(200);
      const runNowPayload = await runNowResponse.json() as {
        run: { status: string };
      };
      expect(runNowPayload.run.status).toBe('verified_complete');
    } finally {
      cleanup();
    }
  });
});

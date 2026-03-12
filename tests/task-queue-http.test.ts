import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { AutonomousTaskQueue } from '../src/runtime/task-queue.ts';
import { createTestBrain } from './helpers.ts';

describe('operator task queue HTTP routes', () => {
  test('supports enqueue, list, tick, and cancel flows', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    try {
      const queue = new AutonomousTaskQueue({
        store: brain.store,
        executeTask: async (item) => ({
          mission_id: `mission_${item.id}`,
          status: 'verified_complete',
          final_message: 'completed',
          retryable: false,
        }),
      });
      const app = createApp(brain, { taskQueue: queue });

      const enqueueResponse = await app.request('/operator/queue/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Run queued mission task.',
          priority: 'urgent',
          source: 'http_test',
          worker_preference: 'auto',
        }),
      });
      expect(enqueueResponse.status).toBe(200);
      const enqueuePayload = await enqueueResponse.json() as {
        item: { id: string; status: string };
      };
      const queueItemId = enqueuePayload.item.id;
      expect(enqueuePayload.item.status).toBe('queued');

      const listResponse = await app.request('/operator/queue');
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as {
        items: Array<{ id: string }>;
      };
      expect(listPayload.items.some((item) => item.id === queueItemId)).toBe(true);

      const tickResponse = await app.request('/operator/queue/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 2 }),
      });
      expect(tickResponse.status).toBe(200);
      const tickPayload = await tickResponse.json() as {
        report: { processed_count: number; items: Array<{ queue_item_id: string; final_status: string }> };
      };
      expect(tickPayload.report.processed_count).toBeGreaterThanOrEqual(1);
      expect(tickPayload.report.items.some((item) => item.queue_item_id === queueItemId && item.final_status === 'completed')).toBe(true);

      const secondEnqueueResponse = await app.request('/operator/queue/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'Cancel this queued task.',
          priority: 'background',
          source: 'http_test_cancel',
        }),
      });
      const secondPayload = await secondEnqueueResponse.json() as {
        item: { id: string };
      };
      const cancelResponse = await app.request(`/operator/queue/${encodeURIComponent(secondPayload.item.id)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'operator_cancelled' }),
      });
      expect(cancelResponse.status).toBe(200);
      const cancelPayload = await cancelResponse.json() as {
        item: { status: string; last_error: string | null };
      };
      expect(cancelPayload.item.status).toBe('cancelled');
      expect(cancelPayload.item.last_error).toBe('operator_cancelled');
    } finally {
      cleanup();
    }
  });

  test('rejects invalid enqueue payloads', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    try {
      const queue = new AutonomousTaskQueue({
        store: brain.store,
        executeTask: async () => ({
          mission_id: null,
          status: 'verified_complete',
          final_message: 'ok',
          retryable: false,
        }),
      });
      const app = createApp(brain, { taskQueue: queue });

      const invalidResponse = await app.request('/operator/queue/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: ' ',
          priority: 'urgent',
          source: 'http_test_invalid',
        }),
      });
      expect(invalidResponse.status).toBe(400);
      const payload = await invalidResponse.json() as { error?: string };
      expect(typeof payload.error).toBe('string');
    } finally {
      cleanup();
    }
  });
});

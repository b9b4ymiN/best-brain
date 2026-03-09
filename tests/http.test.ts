import { describe, expect, test } from 'bun:test';
import { createTestBrain } from './helpers.ts';
import { createApp } from '../src/http/app.ts';

describe('http routes', () => {
  test('health and consult endpoints respond', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const app = createApp(brain);

      const health = await app.request('/health');
      expect(health.status).toBe(200);

      const consult = await app.request('/brain/consult', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'What report format does the owner prefer?' }),
      });

      expect(consult.status).toBe(200);
      const payload = await consult.json() as { policy_path: string; memory_ids: string[] };
      expect(payload.policy_path).toContain('deterministic');
      expect(Array.isArray(payload.memory_ids)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

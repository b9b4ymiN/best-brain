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
      const payload = await consult.json() as {
        policy_path: string;
        memory_ids: string[];
        citations: Array<{ memory_id: string }>;
        trace_id: string;
      };
      expect(payload.policy_path).toContain('deterministic');
      expect(Array.isArray(payload.memory_ids)).toBe(true);
      expect(payload.citations.length).toBe(payload.memory_ids.length);
      expect(payload.trace_id.startsWith('trace_')).toBe(true);

      const memoryQuality = await app.request('/brain/memory-quality');
      expect(memoryQuality.status).toBe(200);
      const memoryQualityPayload = await memoryQuality.json() as {
        active_memory_count: number;
        stale_candidate_count: number;
        stale_ratio: number;
        unresolved_contradiction_count: number;
        superseded_retrieval_leakage_count: number;
        citation_usefulness_rating: number;
      };
      expect(memoryQualityPayload.active_memory_count).toBeGreaterThan(0);
      expect(memoryQualityPayload.stale_candidate_count).toBeGreaterThanOrEqual(0);
      expect(memoryQualityPayload.stale_ratio).toBeGreaterThanOrEqual(0);
      expect(memoryQualityPayload.unresolved_contradiction_count).toBeGreaterThanOrEqual(0);
      expect(memoryQualityPayload.superseded_retrieval_leakage_count).toBeGreaterThanOrEqual(0);
      expect(memoryQualityPayload.citation_usefulness_rating).toBeGreaterThanOrEqual(0);
    } finally {
      cleanup();
    }
  });
});

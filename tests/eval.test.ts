import path from 'path';
import { describe, expect, test } from 'bun:test';
import {
  loadConsultEvalFixtures,
  prepareConsultEvalData,
  runConsultEvaluation,
} from '../src/eval/consult.ts';
import { createTestBrain } from './helpers.ts';

describe('consult evaluation', () => {
  test('passes the curated v1 consult evaluation gate', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await prepareConsultEvalData(brain);
      const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/consult-eval.json');
      const report = await runConsultEvaluation(brain, loadConsultEvalFixtures(fixturePath), fixturePath);

      expect(report.summary.routing_accuracy).toBeGreaterThanOrEqual(90);
      expect(report.summary.top_k_relevance).toBeGreaterThanOrEqual(85);
      expect(report.summary.stale_or_superseded_leakage).toBe(0);
      expect(report.summary.mission_proof_pass_rate).toBe(100);
      expect(report.summary.passes_v1_gate).toBe(true);
    } finally {
      cleanup();
    }
  });
});

import path from 'path';
import { describe, expect, test } from 'bun:test';
import {
  loadConsultEvalFixtures,
  prepareConsultEvalData,
  runConsultEvaluation,
} from '../src/eval/consult.ts';
import {
  loadChatEvalFixtures,
  prepareChatEvalData,
  runChatEvaluation,
} from '../src/eval/chat.ts';
import { createTestBrain } from './helpers.ts';

describe('consult evaluation', () => {
  test('passes the curated v1 consult evaluation gate', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await prepareConsultEvalData(brain);
      const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/consult');
      const report = await runConsultEvaluation(brain, loadConsultEvalFixtures(fixturePath), fixturePath);

      expect(report.summary.routing_accuracy).toBeGreaterThanOrEqual(90);
      expect(report.summary.top_k_relevance).toBeGreaterThanOrEqual(85);
      expect(report.summary.citation_completeness).toBeGreaterThanOrEqual(95);
      expect(report.summary.trace_presence).toBe(100);
      expect(report.summary.stale_demotion_pass_rate).toBe(100);
      expect(report.summary.superseded_suppression_pass_rate).toBe(100);
      expect(report.summary.duplicate_suppression_pass_rate).toBe(100);
      expect(report.summary.stale_or_superseded_leakage).toBe(0);
      expect(report.summary.mission_proof_pass_rate).toBe(100);
      expect(report.summary.orphan_evidence_count).toBe(0);
      expect(report.summary.passes_v1_gate).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('passes the curated chat evaluation gate', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await prepareChatEvalData(brain);
      const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/chat');
      const report = await runChatEvaluation(brain, loadChatEvalFixtures(fixturePath), fixturePath);

      expect(report.summary.total_cases).toBeGreaterThanOrEqual(10);
      expect(report.summary.decision_accuracy).toBeGreaterThanOrEqual(90);
      expect(report.summary.answer_relevance).toBeGreaterThanOrEqual(85);
      expect(report.summary.memory_write_accuracy).toBeGreaterThanOrEqual(85);
      expect(report.summary.memory_grounding_rate).toBeGreaterThanOrEqual(85);
      expect(report.summary.latency_pass_rate).toBeGreaterThanOrEqual(90);
      expect(report.summary.quality_score).toBeGreaterThanOrEqual(85);
      expect(report.summary.passes_gate).toBe(true);
    } finally {
      cleanup();
    }
  });
});

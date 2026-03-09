import { describe, expect, test } from 'bun:test';
import { createTestBrain } from './helpers.ts';

describe('best-brain core', () => {
  test('rejects persona updates without explicit confirmation', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const result = await brain.learn({
        mode: 'persona',
        title: 'Unconfirmed persona change',
        content: 'This should be rejected without confirmation.',
      });

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('confirmed_by_user=true');
    } finally {
      cleanup();
    }
  });

  test('consult returns grounded persona guidance and persists retrieval trace', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const response = await brain.consult({ query: 'If you were the owner, how should this mission start?' });

      expect(response.memory_ids.length).toBeGreaterThan(0);
      expect(response.answer).toContain('Consult intent');

      const trace = brain.store.sqlite.prepare('SELECT * FROM retrieval_traces WHERE id = ?').get(response.trace_id) as Record<string, string> | null;
      expect(trace).not.toBeNull();
      expect(trace?.why_included).toContain('preferred');
    } finally {
      cleanup();
    }
  });

  test('expires working memory and records exclusion in retrieval trace', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const learnResult = await brain.learn({
        mode: 'working_memory',
        title: 'Current temporary note',
        content: 'This is a temporary note for the current task.',
        mission_id: 'mission-temp',
        tags: ['working', 'current'],
      });

      expect(learnResult.accepted).toBe(true);
      brain.store.sqlite
        .prepare('UPDATE memory_items SET expires_at = ?, updated_at = ? WHERE id = ?')
        .run(Date.now() - 1000, Date.now() - 1000, learnResult.memory_id);

      const response = await brain.consult({ query: 'What is the current working context?' });
      const trace = brain.store.sqlite.prepare('SELECT why_excluded FROM retrieval_traces WHERE id = ?').get(response.trace_id) as Record<string, string> | null;

      expect(trace).not.toBeNull();
      expect(trace?.why_excluded).toContain('expired');
    } finally {
      cleanup();
    }
  });

  test('requires evidence before mission can be marked verified complete', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await brain.saveMissionOutcome({
        mission_id: 'mission-proof',
        objective: 'Ship the mission proof flow',
        result_summary: 'Outcome drafted and awaiting verification.',
        evidence: [{ type: 'note', ref: 'draft://proof' }],
        verification_checks: [{ name: 'unit-tests', passed: true }],
        status: 'in_progress',
      });

      await brain.startVerification({ mission_id: 'mission-proof', requested_by: 'tester' });

      await expect(brain.completeVerification({
        mission_id: 'mission-proof',
        status: 'verified_complete',
        evidence: [],
        verification_checks: [{ name: 'unit-tests', passed: true }],
      })).rejects.toThrow('requires at least one evidence artifact');
    } finally {
      cleanup();
    }
  });

  test('verification_failed missions can re-enter the verification loop', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await brain.saveMissionOutcome({
        mission_id: 'mission-retry',
        objective: 'Retry verification after fixes',
        result_summary: 'Initial outcome ready for review.',
        evidence: [{ type: 'note', ref: 'draft://retry' }],
        verification_checks: [{ name: 'smoke', passed: true }],
        status: 'in_progress',
      });

      const firstProof = await brain.startVerification({ mission_id: 'mission-retry', requested_by: 'tester' });
      expect(firstProof.status).toBe('awaiting_verification');

      const failedProof = await brain.completeVerification({
        mission_id: 'mission-retry',
        status: 'verification_failed',
        summary: 'Verification found missing assertions.',
        evidence: [],
        verification_checks: [{ name: 'smoke', passed: false, detail: 'Assertion missing' }],
      });
      expect(failedProof.status).toBe('verification_failed');

      const restartedProof = await brain.startVerification({ mission_id: 'mission-retry', requested_by: 'tester' });
      expect(restartedProof.status).toBe('awaiting_verification');

      const history = brain.store.listMissionEvents('mission-retry', 10);
      expect(history.some((event) => event.event_type === 'reopened')).toBe(true);
    } finally {
      cleanup();
    }
  });
});

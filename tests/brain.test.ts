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
      expect(response.citations.length).toBe(response.memory_ids.length);
      expect(response.citations[0]?.memory_id).toBe(response.memory_ids[0]);
      expect(response.answer).toContain('Consult intent');

      const trace = brain.getRetrievalTrace(response.trace_id);
      expect(trace).not.toBeNull();
      expect(trace?.why_included.some((item) => item.why_included.some((reason) => reason.includes('preferred')))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('owner identity queries route to persona guidance and can retrieve a confirmed owner name', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const learnResult = await brain.learn({
        mode: 'persona',
        title: 'Owner name',
        content: 'The owner name is Beam.',
        source: 'manual-test',
        confirmed_by_user: true,
        verified_by: 'user',
        evidence_ref: [{ type: 'note', ref: 'manual://owner-name' }],
      });

      expect(learnResult.accepted).toBe(true);

      const response = await brain.consult({ query: 'What is the owner name?' });

      expect(response.policy_path).toBe('deterministic.persona_guidance.v1');
      expect(response.citations.some((citation) => citation.memory_type === 'Persona' && citation.summary.includes('Beam'))).toBe(true);
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

  test('mission context exposes verification artifacts without orphan evidence', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await brain.saveMissionOutcome({
        mission_id: 'mission-artifacts',
        objective: 'Track proof artifacts',
        result_summary: 'Mission recorded outcome evidence.',
        evidence: [{ type: 'note', ref: 'proof://mission-artifacts', description: 'Outcome proof' }],
        verification_checks: [{ name: 'proof', passed: true }],
        status: 'in_progress',
        domain: 'best-brain',
      });

      await brain.startVerification({
        mission_id: 'mission-artifacts',
        requested_by: 'tester',
        checks: [{ name: 'proof', passed: true }],
      });

      await brain.completeVerification({
        mission_id: 'mission-artifacts',
        status: 'verified_complete',
        summary: 'Proof artifacts linked correctly.',
        evidence: [{ type: 'note', ref: 'proof://mission-artifacts', description: 'Outcome proof' }],
        verification_checks: [{ name: 'proof', passed: true }],
      });

      const context = await brain.getContext({ mission_id: 'mission-artifacts', query: 'latest mission context' });
      expect(context.verification_artifacts.length).toBeGreaterThan(0);
      expect(context.verification_artifacts.every((artifact) => artifact.mission_id === 'mission-artifacts')).toBe(true);

      const registry = brain.getVerificationArtifactRegistry('mission-artifacts');
      expect(registry.orphan_count).toBe(0);
      expect(registry.artifacts.some((artifact) => artifact.source_kind === 'mission_outcome')).toBe(true);
      expect(registry.artifacts.some((artifact) => artifact.source_kind === 'verification_complete')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('recent mission consult favors the latest verified mission over unverified mission notes', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      await brain.saveMissionOutcome({
        mission_id: 'mission-verified',
        objective: 'Ship the verified mission',
        result_summary: 'Verified mission outcome exists.',
        evidence: [{ type: 'note', ref: 'proof://verified' }],
        verification_checks: [{ name: 'proof', passed: true }],
        status: 'in_progress',
        domain: 'best-brain',
      });
      await brain.startVerification({
        mission_id: 'mission-verified',
        requested_by: 'tester',
        checks: [{ name: 'proof', passed: true }],
      });
      await brain.completeVerification({
        mission_id: 'mission-verified',
        status: 'verified_complete',
        summary: 'Verified mission complete.',
        evidence: [{ type: 'note', ref: 'proof://verified' }],
        verification_checks: [{ name: 'proof', passed: true }],
      });

      await brain.saveMissionOutcome({
        mission_id: 'mission-unverified',
        objective: 'Keep the stale unverified note around',
        result_summary: 'This outcome never passed verification.',
        evidence: [{ type: 'note', ref: 'proof://unverified' }],
        verification_checks: [{ name: 'proof', passed: false }],
        status: 'in_progress',
        domain: 'best-brain',
      });

      const response = await brain.consult({
        query: 'What happened in the latest mission?',
        mission_id: 'mission-verified',
      });

      expect(response.selected_memories[0]?.title).toBe('Mission outcome: Ship the verified mission');
      const trace = brain.getRetrievalTrace(response.trace_id);
      const unverifiedTrace = trace?.matched_candidates.find((candidate) => candidate.title === 'Mission outcome: Keep the stale unverified note around');
      expect(unverifiedTrace?.why_excluded.some((reason) => reason.includes('mission not verified_complete'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});

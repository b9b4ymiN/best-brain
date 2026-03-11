import fs from 'fs';
import os from 'os';
import path from 'path';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { BestBrain } from '../src/services/brain.ts';
import { validateLearnRequestInput } from '../src/validation.ts';
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
      expect(response.query_profile).toBe('blocked_exact');
      expect(response.retrieval_mode).toBe('blocked_exact');
    } finally {
      cleanup();
    }
  });

  test('generic executable queries use hybrid routing without being misclassified as blocked exact', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const response = await brain.consult({
        query: 'Implement the manager proof chain for this repo.',
        domain: 'best-brain',
        consumer: 'manager',
        bundle_profile: 'manager_plan',
        limit: 50,
      });

      expect(response.query_profile).toBe('balanced');
      expect(response.retrieval_mode).toBe('vector_unavailable_fallback');
      expect(response.citations.length).toBeGreaterThan(0);
      expect(response.memory_ids.length).toBeLessThanOrEqual(12);
      expect(response.retrieval_bundle?.blocked_exact_status).toBe('resolved');
    } finally {
      cleanup();
    }
  });

  test('boots and migrates an existing local database before creating v3 indexes', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-legacy-'));
    const dbPath = path.join(dataDir, 'best-brain.db');
    const sqlite = new Database(dbPath);

    try {
      sqlite.exec(`
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE memory_items (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT NOT NULL,
          memory_type TEXT NOT NULL,
          source TEXT NOT NULL,
          confidence REAL NOT NULL,
          owner TEXT NOT NULL,
          domain TEXT,
          reusable INTEGER NOT NULL,
          supersedes TEXT,
          superseded_by TEXT,
          mission_id TEXT,
          tags TEXT NOT NULL,
          status TEXT NOT NULL,
          verified_by TEXT,
          evidence_ref TEXT NOT NULL,
          version INTEGER NOT NULL,
          review_due_at INTEGER,
          stale_after_at INTEGER,
          archive_after_at INTEGER,
          expires_at INTEGER,
          archived_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE retrieval_traces (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          intent TEXT NOT NULL,
          mission_id TEXT,
          domain TEXT,
          policy_path TEXT NOT NULL,
          matched_candidates TEXT NOT NULL,
          why_included TEXT NOT NULL,
          why_excluded TEXT NOT NULL,
          ranking_contribution TEXT NOT NULL,
          final_selected_set TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      sqlite
        .prepare(
          `INSERT INTO memory_items (
            id, title, content, summary, memory_type, source, confidence, owner, domain, reusable,
            supersedes, superseded_by, mission_id, tags, status, verified_by, evidence_ref, version,
            review_due_at, stale_after_at, archive_after_at, expires_at, archived_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'mem_legacy_owner',
          'Owner name',
          'The owner name is Beam.',
          'Owner name is Beam.',
          'Persona',
          'legacy://seed',
          1,
          'test-owner',
          null,
          1,
          null,
          null,
          null,
          '["identity"]',
          'active',
          'user',
          '[{"type":"note","ref":"legacy://owner"}]',
          1,
          null,
          null,
          null,
          null,
          null,
          Date.now(),
          Date.now(),
        );
    } finally {
      sqlite.close();
    }

    const brain = await BestBrain.open({
      owner: 'test-owner',
      dataDir,
      dbPath,
      port: 0,
      seedDefaults: false,
    });

    try {
      const columns = brain.store.sqlite.prepare('PRAGMA table_info(memory_items)').all() as Array<{ name: string }>;
      const retrievalColumns = brain.store.sqlite.prepare('PRAGMA table_info(retrieval_traces)').all() as Array<{ name: string }>;
      const migrated = brain.store.getMemory('mem_legacy_owner');

      expect(columns.some((column) => column.name === 'memory_scope')).toBe(true);
      expect(columns.some((column) => column.name === 'memory_layer')).toBe(true);
      expect(columns.some((column) => column.name === 'entity_aliases')).toBe(true);
      expect(retrievalColumns.some((column) => column.name === 'query_profile')).toBe(true);
      expect(retrievalColumns.some((column) => column.name === 'retrieval_mode')).toBe(true);
      expect(migrated?.memory_scope).toBe('owner');
      expect(migrated?.memory_layer).toBe('principle');
      expect(migrated?.memory_subtype).toBe('persona.identity');
      expect(migrated?.entity_keys).toContain('owner_name');
    } finally {
      brain.close();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // SQLite WAL cleanup can lag briefly on Windows.
      }
    }
  });

  test('confirmed persona rewrites auto-supersede older conflicting identity memory without leaving active contradictions', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const first = await brain.learn({
        mode: 'persona',
        title: 'Owner name',
        content: 'The owner name is Beam.',
        source: 'test://persona-first',
        confirmed_by_user: true,
        verified_by: 'user',
        evidence_ref: [{ type: 'note', ref: 'test://persona-first' }],
      });
      const second = await brain.learn({
        mode: 'persona',
        title: 'Primary owner identity',
        content: 'The owner name is Beam K.',
        source: 'test://persona-second',
        confirmed_by_user: true,
        verified_by: 'user',
        evidence_ref: [{ type: 'note', ref: 'test://persona-second' }],
      });

      expect(first.accepted).toBe(true);
      expect(second.accepted).toBe(true);

      const memories = brain.store.listMemories().filter((memory) => memory.memory_subtype === 'persona.identity');
      const active = memories.find((memory) => memory.status === 'active');
      const superseded = memories.find((memory) => memory.id === first.memory_id);

      expect(active?.content).toContain('Beam K.');
      expect(superseded?.status).toBe('superseded');
      expect(brain.store.listActiveContradictionsForMemory(second.memory_id!)).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('normalizes AI-friendly learn mode aliases for persona memory updates', () => {
    const request = validateLearnRequestInput({
      mode: 'update',
      title: 'Owner identity',
      content: 'The owner name is Boat.',
      memory_subtype: 'persona.identity',
      confirmed_by_user: true,
      written_by: 'chat',
    });
    const createRequest = validateLearnRequestInput({
      mode: 'create',
      title: 'Owner investment style',
      content: 'The owner invests as a VI quality-growth investor.',
      memory_subtype: 'persona.investor_style',
      confirmed_by_user: true,
      written_by: 'chat',
    });

    expect(request.mode).toBe('persona');
    expect(request.memory_subtype).toBe('persona.identity');
    expect(request.written_by).toBe('chat');
    expect(createRequest.mode).toBe('persona');
    expect(createRequest.memory_subtype).toBe('persona.investor_style');
  });

  test('reused memories increment only after verified completion', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const consult = await brain.consult({
        query: 'If you were the owner, how should this mission start?',
        consumer: 'manager',
        bundle_profile: 'manager_plan',
      });
      const reusedId = consult.memory_ids[0];
      const before = brain.store.getMemory(reusedId);

      await brain.saveMissionOutcome({
        mission_id: 'mission-reuse-proof',
        objective: 'Verify reuse accounting',
        result_summary: 'Prepared proof for reuse accounting.',
        evidence: [{ type: 'note', ref: 'proof://reuse-accounting' }],
        verification_checks: [{ name: 'proof', passed: true }],
        status: 'in_progress',
        reused_memory_ids: [reusedId],
      });

      const afterOutcomeOnly = brain.store.getMemory(reusedId);
      expect(afterOutcomeOnly?.times_reused).toBe(before?.times_reused ?? 0);

      await brain.startVerification({
        mission_id: 'mission-reuse-proof',
        requested_by: 'tester',
        checks: [{ name: 'proof', passed: true }],
      });
      await brain.completeVerification({
        mission_id: 'mission-reuse-proof',
        status: 'verified_complete',
        summary: 'Reuse accounting verified.',
        evidence: [{ type: 'note', ref: 'proof://reuse-accounting' }],
        verification_checks: [{ name: 'proof', passed: true }],
      });

      const afterVerified = brain.store.getMemory(reusedId);
      expect(afterVerified?.times_reused).toBe((before?.times_reused ?? 0) + 1);
      expect(afterVerified?.last_reused_at).not.toBeNull();
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

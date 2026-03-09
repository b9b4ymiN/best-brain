import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';
import type {
  CompletionProofState,
  MemoryRecord,
  MissionEventRecord,
  MissionRecord,
  MissionStatus,
  RuntimeConfig,
  VerificationArtifact,
  VerificationCheck,
} from '../types.ts';
import { parseJson, toJson } from '../utils/json.ts';
import { createId } from '../utils/id.ts';
import { SCHEMA_STATEMENTS } from './schema.ts';

type RawRow = Record<string, string | number | null>;

function asMemoryRecord(row: RawRow): MemoryRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    summary: String(row.summary),
    memory_type: row.memory_type as MemoryRecord['memory_type'],
    source: String(row.source),
    confidence: Number(row.confidence),
    owner: String(row.owner),
    domain: row.domain ? String(row.domain) : null,
    reusable: Number(row.reusable) === 1,
    supersedes: row.supersedes ? String(row.supersedes) : null,
    superseded_by: row.superseded_by ? String(row.superseded_by) : null,
    mission_id: row.mission_id ? String(row.mission_id) : null,
    tags: parseJson<string[]>(row.tags as string, []),
    status: row.status as MemoryRecord['status'],
    verified_by: row.verified_by ? (String(row.verified_by) as MemoryRecord['verified_by']) : null,
    evidence_ref: parseJson<VerificationArtifact[]>(row.evidence_ref as string, []),
    version: Number(row.version),
    review_due_at: row.review_due_at == null ? null : Number(row.review_due_at),
    stale_after_at: row.stale_after_at == null ? null : Number(row.stale_after_at),
    archive_after_at: row.archive_after_at == null ? null : Number(row.archive_after_at),
    expires_at: row.expires_at == null ? null : Number(row.expires_at),
    archived_at: row.archived_at == null ? null : Number(row.archived_at),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

function asMissionRecord(row: RawRow): MissionRecord {
  return {
    id: String(row.id),
    objective: String(row.objective),
    domain: row.domain ? String(row.domain) : null,
    status: row.status as MissionStatus,
    planning_hints: parseJson<string[]>(row.planning_hints as string, []),
    preferred_format: row.preferred_format ? String(row.preferred_format) : null,
    verification_required: Number(row.verification_required) === 1,
    latest_outcome_memory_id: row.latest_outcome_memory_id ? String(row.latest_outcome_memory_id) : null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    started_at: row.started_at == null ? null : Number(row.started_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
    rejected_reason: row.rejected_reason ? String(row.rejected_reason) : null,
  };
}

function asMissionEventRecord(row: RawRow): MissionEventRecord {
  return {
    id: String(row.id),
    mission_id: String(row.mission_id),
    event_type: String(row.event_type),
    actor: String(row.actor),
    detail: String(row.detail),
    data: parseJson<Record<string, unknown>>(row.data as string, {}),
    created_at: Number(row.created_at),
  };
}

export class BrainStore {
  readonly config: RuntimeConfig;
  readonly sqlite: Database;

  constructor(config: RuntimeConfig) {
    this.config = config;
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    this.sqlite = new Database(config.dbPath);
    this.sqlite.exec('PRAGMA journal_mode = WAL');
    this.sqlite.exec('PRAGMA busy_timeout = 5000');
    this.initialize();
  }

  close(): void {
    this.sqlite.close();
  }

  initialize(): void {
    for (const statement of SCHEMA_STATEMENTS) {
      this.sqlite.exec(statement);
    }

    this.setSetting('schema_version', '1');
    this.setSetting('vendor.oracle_core_commit', 'd355e31cb64bd8d5b296f9c3c1d325386cc79834');
  }

  getSetting(key: string): string | null {
    const row = this.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as RawRow | null;
    return row?.value ? String(row.value) : null;
  }

  setSetting(key: string, value: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, Date.now());
  }

  runMaintenance(timestamp: number): void {
    this.sqlite
      .prepare(
        `UPDATE memory_items
         SET status = 'expired', archived_at = COALESCE(archived_at, ?), updated_at = ?
         WHERE memory_type = 'WorkingMemory'
           AND status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at <= ?`,
      )
      .run(timestamp, timestamp, timestamp);

    this.sqlite
      .prepare(
        `UPDATE memory_items
         SET status = 'archived', archived_at = COALESCE(archived_at, ?), updated_at = ?
         WHERE memory_type = 'MissionMemory'
           AND status = 'active'
           AND archive_after_at IS NOT NULL
           AND archive_after_at <= ?`,
      )
      .run(timestamp, timestamp, timestamp);
  }

  listMemories(): MemoryRecord[] {
    const rows = this.sqlite.prepare('SELECT * FROM memory_items ORDER BY updated_at DESC').all() as RawRow[];
    return rows.map(asMemoryRecord);
  }

  getMemory(id: string): MemoryRecord | null {
    const row = this.sqlite.prepare('SELECT * FROM memory_items WHERE id = ?').get(id) as RawRow | null;
    return row ? asMemoryRecord(row) : null;
  }

  findMergeCandidate(title: string, memoryType: string, domain: string | null, missionId: string | null): MemoryRecord | null {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM memory_items
         WHERE title = ?
           AND memory_type = ?
           AND COALESCE(domain, '') = COALESCE(?, '')
           AND COALESCE(mission_id, '') = COALESCE(?, '')
           AND status IN ('active', 'candidate')
           AND superseded_by IS NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(title, memoryType, domain, missionId) as RawRow | null;

    return row ? asMemoryRecord(row) : null;
  }

  insertMemory(memory: MemoryRecord, changeSummary: string | null = null): void {
    this.sqlite
      .prepare(
        `INSERT INTO memory_items (
          id, title, content, summary, memory_type, source, confidence, owner, domain, reusable,
          supersedes, superseded_by, mission_id, tags, status, verified_by, evidence_ref, version,
          review_due_at, stale_after_at, archive_after_at, expires_at, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        memory.id,
        memory.title,
        memory.content,
        memory.summary,
        memory.memory_type,
        memory.source,
        memory.confidence,
        memory.owner,
        memory.domain,
        memory.reusable ? 1 : 0,
        memory.supersedes,
        memory.superseded_by,
        memory.mission_id,
        toJson(memory.tags),
        memory.status,
        memory.verified_by,
        toJson(memory.evidence_ref),
        memory.version,
        memory.review_due_at,
        memory.stale_after_at,
        memory.archive_after_at,
        memory.expires_at,
        memory.archived_at,
        memory.created_at,
        memory.updated_at,
      );

    this.insertMemoryVersion(memory, changeSummary);
  }

  insertMemoryVersion(memory: MemoryRecord, changeSummary: string | null): void {
    this.sqlite
      .prepare(
        `INSERT INTO memory_versions (
          id, memory_id, version, content, summary, source, verified_by, evidence_ref, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        createId('memver'),
        memory.id,
        memory.version,
        memory.content,
        memory.summary,
        memory.source,
        memory.verified_by,
        toJson(memory.evidence_ref),
        changeSummary,
        memory.updated_at,
      );
  }

  supersedeMemory(oldId: string, newId: string, timestamp: number): void {
    this.sqlite
      .prepare(
        `UPDATE memory_items
         SET status = 'superseded', superseded_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(newId, timestamp, oldId);

    this.insertEdge(oldId, newId, 'supersedes', 1, { reason: 'policy_supersede' }, timestamp);
  }

  touchMergedMemory(memoryId: string, updates: Partial<MemoryRecord>, changeSummary: string): MemoryRecord {
    const current = this.getMemory(memoryId);
    if (!current) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    const next: MemoryRecord = {
      ...current,
      ...updates,
      version: current.version + 1,
      updated_at: Date.now(),
    };

    this.sqlite
      .prepare(
        `UPDATE memory_items
         SET content = ?, summary = ?, source = ?, confidence = ?, reusable = ?, tags = ?, status = ?,
             verified_by = ?, evidence_ref = ?, version = ?, review_due_at = ?, stale_after_at = ?,
             archive_after_at = ?, expires_at = ?, archived_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.content,
        next.summary,
        next.source,
        next.confidence,
        next.reusable ? 1 : 0,
        toJson(next.tags),
        next.status,
        next.verified_by,
        toJson(next.evidence_ref),
        next.version,
        next.review_due_at,
        next.stale_after_at,
        next.archive_after_at,
        next.expires_at,
        next.archived_at,
        next.updated_at,
        next.id,
      );

    this.insertMemoryVersion(next, changeSummary);
    return next;
  }

  insertEdge(fromId: string, toId: string, edgeType: string, weight: number, metadata: Record<string, unknown>, timestamp: number): void {
    this.sqlite
      .prepare(
        'INSERT INTO memory_edges (id, from_id, to_id, edge_type, weight, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(createId('edge'), fromId, toId, edgeType, weight, toJson(metadata), timestamp);
  }

  getMission(id: string): MissionRecord | null {
    const row = this.sqlite.prepare('SELECT * FROM missions WHERE id = ?').get(id) as RawRow | null;
    return row ? asMissionRecord(row) : null;
  }

  upsertMission(mission: MissionRecord): MissionRecord {
    this.sqlite
      .prepare(
        `INSERT INTO missions (
          id, objective, domain, status, planning_hints, preferred_format, verification_required,
          latest_outcome_memory_id, created_at, updated_at, started_at, completed_at, rejected_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          objective = excluded.objective,
          domain = excluded.domain,
          status = excluded.status,
          planning_hints = excluded.planning_hints,
          preferred_format = excluded.preferred_format,
          verification_required = excluded.verification_required,
          latest_outcome_memory_id = excluded.latest_outcome_memory_id,
          updated_at = excluded.updated_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          rejected_reason = excluded.rejected_reason`,
      )
      .run(
        mission.id,
        mission.objective,
        mission.domain,
        mission.status,
        toJson(mission.planning_hints),
        mission.preferred_format,
        mission.verification_required ? 1 : 0,
        mission.latest_outcome_memory_id,
        mission.created_at,
        mission.updated_at,
        mission.started_at,
        mission.completed_at,
        mission.rejected_reason,
      );

    return mission;
  }

  insertMissionEvent(missionId: string, eventType: string, actor: string, detail: string, data: Record<string, unknown>, createdAt: number): MissionEventRecord {
    const event: MissionEventRecord = {
      id: createId('mevent'),
      mission_id: missionId,
      event_type: eventType,
      actor,
      detail,
      data,
      created_at: createdAt,
    };

    this.sqlite
      .prepare(
        'INSERT INTO mission_events (id, mission_id, event_type, actor, detail, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(event.id, event.mission_id, event.event_type, event.actor, event.detail, toJson(event.data), event.created_at);

    return event;
  }

  listMissionEvents(missionId: string, limit = 20): MissionEventRecord[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM mission_events WHERE mission_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(missionId, limit) as RawRow[];
    return rows.map(asMissionEventRecord);
  }

  insertVerificationRun(input: {
    missionId: string;
    requestedBy: string;
    status: 'running' | 'verified_complete' | 'verification_failed' | 'rejected';
    summary: string | null;
    evidence: VerificationArtifact[];
    checks: VerificationCheck[];
    startedAt: number;
    completedAt: number | null;
  }): string {
    const id = createId('vrun');
    this.sqlite
      .prepare(
        `INSERT INTO verification_runs (
          id, mission_id, status, requested_by, summary, evidence_ref, verification_checks, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.missionId,
        input.status,
        input.requestedBy,
        input.summary,
        toJson(input.evidence),
        toJson(input.checks),
        input.startedAt,
        input.completedAt,
      );
    return id;
  }

  updateVerificationRun(runId: string, status: 'verified_complete' | 'verification_failed' | 'rejected', summary: string | null, evidence: VerificationArtifact[], checks: VerificationCheck[], completedAt: number): void {
    this.sqlite
      .prepare(
        `UPDATE verification_runs
         SET status = ?, summary = ?, evidence_ref = ?, verification_checks = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(status, summary, toJson(evidence), toJson(checks), completedAt, runId);
  }

  getVerificationRun(runId: string): (RawRow & { evidence_ref: string; verification_checks: string }) | null {
    return this.sqlite.prepare('SELECT * FROM verification_runs WHERE id = ?').get(runId) as (RawRow & {
      evidence_ref: string;
      verification_checks: string;
    }) | null;
  }

  getLatestVerificationRunForMission(missionId: string): (RawRow & { evidence_ref: string; verification_checks: string }) | null {
    return this.sqlite
      .prepare('SELECT * FROM verification_runs WHERE mission_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(missionId) as (RawRow & { evidence_ref: string; verification_checks: string }) | null;
  }

  insertRetrievalTrace(trace: {
    id: string;
    query: string;
    intent: string;
    missionId: string | null;
    domain: string | null;
    policyPath: string;
    matchedCandidates: unknown;
    whyIncluded: unknown;
    whyExcluded: unknown;
    rankingContribution: unknown;
    finalSelectedSet: unknown;
    createdAt: number;
  }): void {
    this.sqlite
      .prepare(
        `INSERT INTO retrieval_traces (
          id, query, intent, mission_id, domain, policy_path, matched_candidates, why_included,
          why_excluded, ranking_contribution, final_selected_set, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trace.id,
        trace.query,
        trace.intent,
        trace.missionId,
        trace.domain,
        trace.policyPath,
        toJson(trace.matchedCandidates),
        toJson(trace.whyIncluded),
        toJson(trace.whyExcluded),
        toJson(trace.rankingContribution),
        toJson(trace.finalSelectedSet),
        trace.createdAt,
      );
  }

  insertLearningEvent(event: {
    mode: string;
    memoryId: string | null;
    missionId: string | null;
    action: string;
    accepted: boolean;
    reason: string;
    payload: unknown;
    createdAt: number;
  }): void {
    this.sqlite
      .prepare(
        `INSERT INTO learning_events (
          id, mode, memory_id, mission_id, action, accepted, reason, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        createId('levent'),
        event.mode,
        event.memoryId,
        event.missionId,
        event.action,
        event.accepted ? 1 : 0,
        event.reason,
        toJson(event.payload),
        event.createdAt,
      );
  }

  getPreferredFormatMemory(): MemoryRecord | null {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM memory_items
         WHERE memory_type = 'Preferences'
           AND status = 'active'
           AND tags LIKE '%"format"%'
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get() as RawRow | null;

    return row ? asMemoryRecord(row) : null;
  }

  getPlanningHintMemories(limit = 5): MemoryRecord[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM memory_items
         WHERE memory_type = 'Procedures'
           AND status = 'active'
           AND (tags LIKE '%"planning"%' OR tags LIKE '%"checklist"%')
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as RawRow[];
    return rows.map(asMemoryRecord);
  }

  getCompletionProofState(missionId: string): CompletionProofState | null {
    const mission = this.getMission(missionId);
    if (!mission) {
      return null;
    }

    const run = this.getLatestVerificationRunForMission(missionId);
    const evidence = parseJson<VerificationArtifact[]>(run?.evidence_ref as string | undefined, []);
    const checks = parseJson<VerificationCheck[]>(run?.verification_checks as string | undefined, []);

    return {
      mission_id: mission.id,
      status: mission.status,
      verification_run_id: run?.id ? String(run.id) : null,
      evidence_count: evidence.length,
      checks_passed: checks.filter((check) => check.passed).length,
      checks_total: checks.length,
    };
  }
}

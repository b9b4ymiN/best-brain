import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';
import type {
  CompletionProofState,
  MemoryRecord,
  MissionEventRecord,
  MissionRecord,
  MissionStatus,
  RetrievalTraceRecord,
  RuntimeConfig,
  VerificationArtifact,
  VerificationArtifactRecord,
  VerificationArtifactRegistrySnapshot,
  VerificationCheck,
} from '../types.ts';
import {
  defaultMemoryLayer,
  defaultMemoryScope,
  deriveEntityAliases,
  deriveEntityKeys,
  normalizeMemorySubtype,
} from '../policies/memory-v2.ts';
import { parseJson, toJson } from '../utils/json.ts';
import { createId } from '../utils/id.ts';
import { tokenize } from '../utils/text.ts';
import { SCHEMA_STATEMENTS } from './schema.ts';

type RawRow = Record<string, string | number | null>;
const MEMORY_ITEM_INSERT_PLACEHOLDERS = Array.from({ length: 42 }, () => '?').join(', ');

function asMemoryRecord(row: RawRow): MemoryRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    summary: String(row.summary),
    memory_type: row.memory_type as MemoryRecord['memory_type'],
    memory_scope: (row.memory_scope ? String(row.memory_scope) : defaultMemoryScope(row.memory_type as MemoryRecord['memory_type'], row.mission_id ? String(row.mission_id) : null)) as MemoryRecord['memory_scope'],
    memory_layer: (row.memory_layer ? String(row.memory_layer) : defaultMemoryLayer(row.memory_type as MemoryRecord['memory_type'])) as MemoryRecord['memory_layer'],
    memory_subtype: row.memory_subtype
      ? String(row.memory_subtype)
      : normalizeMemorySubtype(null, row.memory_type as MemoryRecord['memory_type'], String(row.title), parseJson<string[]>(row.tags as string, [])),
    source: String(row.source),
    confidence: Number(row.confidence),
    owner: String(row.owner),
    owner_scope: (row.owner_scope ? String(row.owner_scope) : 'private') as MemoryRecord['owner_scope'],
    domain: row.domain ? String(row.domain) : null,
    reusable: Number(row.reusable) === 1,
    supersedes: row.supersedes ? String(row.supersedes) : null,
    superseded_by: row.superseded_by ? String(row.superseded_by) : null,
    mission_id: row.mission_id ? String(row.mission_id) : null,
    tags: parseJson<string[]>(row.tags as string, []),
    entity_keys: parseJson<string[]>(row.entity_keys as string | undefined, []),
    entity_aliases: parseJson<string[]>(row.entity_aliases as string | undefined, []),
    written_by: (row.written_by ? String(row.written_by) : 'system') as MemoryRecord['written_by'],
    retrieval_weight: row.retrieval_weight == null ? 1 : Number(row.retrieval_weight),
    promotion_state: (row.promotion_state ? String(row.promotion_state) : 'none') as MemoryRecord['promotion_state'],
    times_reused: row.times_reused == null ? 0 : Number(row.times_reused),
    last_reused_at: row.last_reused_at == null ? null : Number(row.last_reused_at),
    success_rate_hint: row.success_rate_hint == null ? null : Number(row.success_rate_hint),
    status: row.status as MemoryRecord['status'],
    verified_by: row.verified_by ? (String(row.verified_by) as MemoryRecord['verified_by']) : null,
    evidence_ref: parseJson<VerificationArtifact[]>(row.evidence_ref as string, []),
    version: Number(row.version),
    review_due_at: row.review_due_at == null ? null : Number(row.review_due_at),
    stale_after_at: row.stale_after_at == null ? null : Number(row.stale_after_at),
    archive_after_at: row.archive_after_at == null ? null : Number(row.archive_after_at),
    expires_at: row.expires_at == null ? null : Number(row.expires_at),
    archived_at: row.archived_at == null ? null : Number(row.archived_at),
    last_validated_at: row.last_validated_at == null ? null : Number(row.last_validated_at),
    valid_until: row.valid_until == null ? null : Number(row.valid_until),
    embedding_status: (row.embedding_status ? String(row.embedding_status) : 'disabled') as MemoryRecord['embedding_status'],
    embedding_updated_at: row.embedding_updated_at == null ? null : Number(row.embedding_updated_at),
    embedding_model_version: row.embedding_model_version ? String(row.embedding_model_version) : null,
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

function asVerificationArtifactRecord(row: RawRow): VerificationArtifactRecord {
  return {
    id: String(row.id),
    mission_id: row.mission_id ? String(row.mission_id) : null,
    verification_run_id: row.verification_run_id ? String(row.verification_run_id) : null,
    memory_id: row.memory_id ? String(row.memory_id) : null,
    artifact_type: row.artifact_type as VerificationArtifactRecord['artifact_type'],
    artifact_ref: String(row.artifact_ref),
    artifact_description: row.artifact_description ? String(row.artifact_description) : null,
    source_kind: row.source_kind as VerificationArtifactRecord['source_kind'],
    created_at: Number(row.created_at),
  };
}

function asRetrievalTraceRecord(row: RawRow): RetrievalTraceRecord {
  return {
    id: String(row.id),
    query: String(row.query),
    intent: row.intent as RetrievalTraceRecord['intent'],
    query_profile: (row.query_profile ? String(row.query_profile) : 'balanced') as RetrievalTraceRecord['query_profile'],
    mission_id: row.mission_id ? String(row.mission_id) : null,
    domain: row.domain ? String(row.domain) : null,
    policy_path: String(row.policy_path),
    retrieval_mode: (row.retrieval_mode ? String(row.retrieval_mode) : 'fts_only') as RetrievalTraceRecord['retrieval_mode'],
    matched_candidates: parseJson<RetrievalTraceRecord['matched_candidates']>(row.matched_candidates as string, []),
    why_included: parseJson<RetrievalTraceRecord['why_included']>(row.why_included as string, []),
    why_excluded: parseJson<RetrievalTraceRecord['why_excluded']>(row.why_excluded as string, []),
    ranking_contribution: parseJson<RetrievalTraceRecord['ranking_contribution']>(row.ranking_contribution as string, []),
    final_selected_set: parseJson<RetrievalTraceRecord['final_selected_set']>(row.final_selected_set as string, []),
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

    this.migrateToSchemaV3();
    this.setSetting('schema_version', '3');
    this.setSetting('vendor.oracle_core_commit', 'd355e31cb64bd8d5b296f9c3c1d325386cc79834');
  }

  private ensureColumn(table: string, name: string, definition: string): void {
    const columns = this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    if (!columns.some((column) => column.name === name)) {
      this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
  }

  private migrateToSchemaV3(): void {
    this.ensureColumn('memory_items', 'memory_scope', `memory_scope TEXT NOT NULL DEFAULT 'cross_mission'`);
    this.ensureColumn('memory_items', 'memory_layer', `memory_layer TEXT NOT NULL DEFAULT 'working'`);
    this.ensureColumn('memory_items', 'memory_subtype', `memory_subtype TEXT NOT NULL DEFAULT 'custom.general'`);
    this.ensureColumn('memory_items', 'owner_scope', `owner_scope TEXT NOT NULL DEFAULT 'private'`);
    this.ensureColumn('memory_items', 'entity_keys', `entity_keys TEXT NOT NULL DEFAULT '[]'`);
    this.ensureColumn('memory_items', 'entity_aliases', `entity_aliases TEXT NOT NULL DEFAULT '[]'`);
    this.ensureColumn('memory_items', 'written_by', `written_by TEXT NOT NULL DEFAULT 'system'`);
    this.ensureColumn('memory_items', 'retrieval_weight', `retrieval_weight REAL NOT NULL DEFAULT 1`);
    this.ensureColumn('memory_items', 'promotion_state', `promotion_state TEXT NOT NULL DEFAULT 'none'`);
    this.ensureColumn('memory_items', 'times_reused', `times_reused INTEGER NOT NULL DEFAULT 0`);
    this.ensureColumn('memory_items', 'last_reused_at', `last_reused_at INTEGER`);
    this.ensureColumn('memory_items', 'success_rate_hint', `success_rate_hint REAL`);
    this.ensureColumn('memory_items', 'last_validated_at', `last_validated_at INTEGER`);
    this.ensureColumn('memory_items', 'valid_until', `valid_until INTEGER`);
    this.ensureColumn('memory_items', 'embedding_status', `embedding_status TEXT NOT NULL DEFAULT 'disabled'`);
    this.ensureColumn('memory_items', 'embedding_updated_at', `embedding_updated_at INTEGER`);
    this.ensureColumn('memory_items', 'embedding_model_version', `embedding_model_version TEXT`);
    this.ensureColumn('retrieval_traces', 'query_profile', `query_profile TEXT NOT NULL DEFAULT 'balanced'`);
    this.ensureColumn('retrieval_traces', 'retrieval_mode', `retrieval_mode TEXT NOT NULL DEFAULT 'fts_only'`);

    this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_items(memory_scope)`);
    this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memory_layer ON memory_items(memory_layer)`);
    this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memory_subtype ON memory_items(memory_subtype)`);
    this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memory_reused ON memory_items(times_reused, last_reused_at DESC)`);

    for (const memory of this.listMemories()) {
      const subtype = normalizeMemorySubtype(memory.memory_subtype, memory.memory_type, memory.title, memory.tags);
      const entityKeys = memory.entity_keys.length > 0
        ? memory.entity_keys
        : deriveEntityKeys({
            title: memory.title,
            content: memory.content,
            tags: memory.tags,
            memorySubtype: subtype,
          });
      const entityAliases = memory.entity_aliases.length > 0
        ? memory.entity_aliases
        : deriveEntityAliases({
            title: memory.title,
            content: memory.content,
            tags: memory.tags,
            memorySubtype: subtype,
          });
      this.sqlite
        .prepare(
          `UPDATE memory_items
           SET memory_scope = ?, memory_layer = ?, memory_subtype = ?, owner_scope = COALESCE(owner_scope, 'private'),
               entity_keys = ?, entity_aliases = ?, written_by = COALESCE(written_by, 'system'),
               retrieval_weight = COALESCE(retrieval_weight, 1), promotion_state = COALESCE(promotion_state, 'none'),
               times_reused = COALESCE(times_reused, 0), embedding_status = COALESCE(embedding_status, 'disabled')
           WHERE id = ?`,
        )
        .run(
          memory.memory_scope,
          memory.memory_layer,
          subtype,
          toJson(entityKeys),
          toJson(entityAliases),
          memory.id,
        );
      this.syncMemoryFts({
        ...memory,
        memory_subtype: subtype,
        entity_keys: entityKeys,
        entity_aliases: entityAliases,
      });
      this.upsertEmbeddingMetadata(memory.id, {
        embedding_provider: null,
        embedding_model: null,
        embedding_model_version: memory.embedding_model_version,
        embedding_doc_hash: null,
        embedding_status: memory.embedding_status,
        embedding_updated_at: memory.embedding_updated_at,
      });
    }
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

  listActiveMemories(): MemoryRecord[] {
    const rows = this.sqlite
      .prepare(`SELECT * FROM memory_items WHERE status = 'active' ORDER BY updated_at DESC`)
      .all() as RawRow[];
    return rows.map(asMemoryRecord);
  }

  getMemory(id: string): MemoryRecord | null {
    const row = this.sqlite.prepare('SELECT * FROM memory_items WHERE id = ?').get(id) as RawRow | null;
    return row ? asMemoryRecord(row) : null;
  }

  findLatestMemoryByTitle(title: string, memoryType?: string): MemoryRecord | null {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM memory_items
         WHERE title = ?
           AND (? IS NULL OR memory_type = ?)
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(title, memoryType ?? null, memoryType ?? null) as RawRow | null;

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
          id, title, content, summary, memory_type, memory_scope, memory_layer, memory_subtype,
          source, confidence, owner, owner_scope, domain, reusable,
          supersedes, superseded_by, mission_id, tags, entity_keys, entity_aliases, written_by,
          retrieval_weight, promotion_state, times_reused, last_reused_at, success_rate_hint,
          status, verified_by, evidence_ref, version,
          review_due_at, stale_after_at, archive_after_at, expires_at, archived_at,
          last_validated_at, valid_until, embedding_status, embedding_updated_at, embedding_model_version,
          created_at, updated_at
        ) VALUES (${MEMORY_ITEM_INSERT_PLACEHOLDERS})`,
      )
      .run(
        memory.id,
        memory.title,
        memory.content,
        memory.summary,
        memory.memory_type,
        memory.memory_scope,
        memory.memory_layer,
        memory.memory_subtype,
        memory.source,
        memory.confidence,
        memory.owner,
        memory.owner_scope,
        memory.domain,
        memory.reusable ? 1 : 0,
        memory.supersedes,
        memory.superseded_by,
        memory.mission_id,
        toJson(memory.tags),
        toJson(memory.entity_keys),
        toJson(memory.entity_aliases),
        memory.written_by,
        memory.retrieval_weight,
        memory.promotion_state,
        memory.times_reused,
        memory.last_reused_at,
        memory.success_rate_hint,
        memory.status,
        memory.verified_by,
        toJson(memory.evidence_ref),
        memory.version,
        memory.review_due_at,
        memory.stale_after_at,
        memory.archive_after_at,
        memory.expires_at,
        memory.archived_at,
        memory.last_validated_at,
        memory.valid_until,
        memory.embedding_status,
        memory.embedding_updated_at,
        memory.embedding_model_version,
        memory.created_at,
        memory.updated_at,
      );

    this.insertMemoryVersion(memory, changeSummary);
    this.syncMemoryFts(memory);
    this.upsertEmbeddingMetadata(memory.id, {
      embedding_provider: null,
      embedding_model: null,
      embedding_model_version: memory.embedding_model_version,
      embedding_doc_hash: null,
      embedding_status: memory.embedding_status,
      embedding_updated_at: memory.embedding_updated_at,
    });
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
         SET content = ?, summary = ?, memory_scope = ?, memory_layer = ?, memory_subtype = ?, source = ?, confidence = ?, owner_scope = ?, reusable = ?, tags = ?, entity_keys = ?, entity_aliases = ?,
             written_by = ?, retrieval_weight = ?, promotion_state = ?, times_reused = ?, last_reused_at = ?, success_rate_hint = ?,
             status = ?, verified_by = ?, evidence_ref = ?, version = ?, review_due_at = ?, stale_after_at = ?,
             archive_after_at = ?, expires_at = ?, archived_at = ?, last_validated_at = ?, valid_until = ?,
             embedding_status = ?, embedding_updated_at = ?, embedding_model_version = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.content,
        next.summary,
        next.memory_scope,
        next.memory_layer,
        next.memory_subtype,
        next.source,
        next.confidence,
        next.owner_scope,
        next.reusable ? 1 : 0,
        toJson(next.tags),
        toJson(next.entity_keys),
        toJson(next.entity_aliases),
        next.written_by,
        next.retrieval_weight,
        next.promotion_state,
        next.times_reused,
        next.last_reused_at,
        next.success_rate_hint,
        next.status,
        next.verified_by,
        toJson(next.evidence_ref),
        next.version,
        next.review_due_at,
        next.stale_after_at,
        next.archive_after_at,
        next.expires_at,
        next.archived_at,
        next.last_validated_at,
        next.valid_until,
        next.embedding_status,
        next.embedding_updated_at,
        next.embedding_model_version,
        next.updated_at,
        next.id,
      );

    this.insertMemoryVersion(next, changeSummary);
    this.syncMemoryFts(next);
    this.upsertEmbeddingMetadata(next.id, {
      embedding_provider: null,
      embedding_model: null,
      embedding_model_version: next.embedding_model_version,
      embedding_doc_hash: null,
      embedding_status: next.embedding_status,
      embedding_updated_at: next.embedding_updated_at,
    });
    return next;
  }

  private syncMemoryFts(memory: Pick<MemoryRecord, 'id' | 'title' | 'summary' | 'content' | 'entity_keys' | 'entity_aliases' | 'tags' | 'memory_subtype'>): void {
    this.sqlite.prepare('DELETE FROM memory_fts WHERE memory_id = ?').run(memory.id);
    this.sqlite
      .prepare(
        `INSERT INTO memory_fts (memory_id, title, summary, content, entity_keys, entity_aliases, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        memory.id,
        memory.title,
        memory.summary,
        memory.content,
        memory.entity_keys.join(' '),
        memory.entity_aliases.join(' '),
        memory.tags.join(' '),
      );
  }

  private upsertEmbeddingMetadata(memoryId: string, metadata: {
    embedding_provider: string | null;
    embedding_model: string | null;
    embedding_model_version: string | null;
    embedding_doc_hash: string | null;
    embedding_status: MemoryRecord['embedding_status'];
    embedding_updated_at: number | null;
  }): void {
    this.sqlite
      .prepare(
        `INSERT INTO memory_embeddings (
          memory_id, embedding_provider, embedding_model, embedding_model_version, embedding_doc_hash, embedding_status, embedding_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id) DO UPDATE SET
          embedding_provider = excluded.embedding_provider,
          embedding_model = excluded.embedding_model,
          embedding_model_version = excluded.embedding_model_version,
          embedding_doc_hash = excluded.embedding_doc_hash,
          embedding_status = excluded.embedding_status,
          embedding_updated_at = excluded.embedding_updated_at`,
      )
      .run(
        memoryId,
        metadata.embedding_provider,
        metadata.embedding_model,
        metadata.embedding_model_version,
        metadata.embedding_doc_hash,
        metadata.embedding_status,
        metadata.embedding_updated_at,
      );
  }

  searchMemoriesLexical(query: string, limit = 40): Array<{ memory_id: string; score: number }> {
    const sanitizedTokens = tokenize(query)
      .map((token) => token.replace(/"/g, ''))
      .filter(Boolean)
      .slice(0, 8);
    if (sanitizedTokens.length === 0) {
      return [];
    }

    const ftsQuery = sanitizedTokens.map((token) => `"${token}"`).join(' OR ');
    const rows = this.sqlite
      .prepare(
        `SELECT memory_id, bm25(memory_fts, 10.0, 8.0, 3.0, 8.0, 8.0, 2.0) AS rank
         FROM memory_fts
         WHERE memory_fts MATCH ?
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{ memory_id: string; rank: number }>;

    return rows.map((row) => ({
      memory_id: String(row.memory_id),
      score: 1 / (1 + Math.max(Number(row.rank ?? 0), 0)),
    }));
  }

  listActiveContradictionsForMemory(memoryId: string): Array<{
    id: string;
    left_memory_id: string;
    right_memory_id: string;
    conflict_kind: string;
    resolution_state: string;
    chosen_memory_id: string | null;
    resolution_reason: string | null;
    resolved_by: string | null;
    resolved_at: number | null;
    mission_id: string | null;
    created_at: number;
  }> {
    return this.sqlite
      .prepare(
        `SELECT *
         FROM memory_contradictions
         WHERE (left_memory_id = ? OR right_memory_id = ?)
           AND resolution_state != 'resolved'
         ORDER BY created_at DESC`,
      )
      .all(memoryId, memoryId) as Array<{
      id: string;
      left_memory_id: string;
      right_memory_id: string;
      conflict_kind: string;
      resolution_state: string;
      chosen_memory_id: string | null;
      resolution_reason: string | null;
      resolved_by: string | null;
      resolved_at: number | null;
      mission_id: string | null;
      created_at: number;
    }>;
  }

  findActiveConflict(leftMemoryId: string, rightMemoryId: string): { id: string } | null {
    return this.sqlite
      .prepare(
        `SELECT id
         FROM memory_contradictions
         WHERE ((left_memory_id = ? AND right_memory_id = ?) OR (left_memory_id = ? AND right_memory_id = ?))
           AND resolution_state != 'resolved'
         LIMIT 1`,
      )
      .get(leftMemoryId, rightMemoryId, rightMemoryId, leftMemoryId) as { id: string } | null;
  }

  insertMemoryContradiction(input: {
    leftMemoryId: string;
    rightMemoryId: string;
    conflictKind: string;
    resolutionState: string;
    chosenMemoryId?: string | null;
    resolutionReason?: string | null;
    resolvedBy?: string | null;
    resolvedAt?: number | null;
    missionId?: string | null;
    createdAt: number;
  }): void {
    const existing = this.findActiveConflict(input.leftMemoryId, input.rightMemoryId);
    if (existing) {
      return;
    }

    this.sqlite
      .prepare(
        `INSERT INTO memory_contradictions (
          id, left_memory_id, right_memory_id, conflict_kind, resolution_state, chosen_memory_id,
          resolution_reason, resolved_by, resolved_at, mission_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        createId('mconf'),
        input.leftMemoryId,
        input.rightMemoryId,
        input.conflictKind,
        input.resolutionState,
        input.chosenMemoryId ?? null,
        input.resolutionReason ?? null,
        input.resolvedBy ?? null,
        input.resolvedAt ?? null,
        input.missionId ?? null,
        input.createdAt,
      );
  }

  resolveMemoryContradiction(conflictId: string, input: {
    resolutionState: string;
    chosenMemoryId?: string | null;
    resolutionReason?: string | null;
    resolvedBy: string;
    resolvedAt: number;
  }): void {
    this.sqlite
      .prepare(
        `UPDATE memory_contradictions
         SET resolution_state = ?, chosen_memory_id = ?, resolution_reason = ?, resolved_by = ?, resolved_at = ?
         WHERE id = ?`,
      )
      .run(
        input.resolutionState,
        input.chosenMemoryId ?? null,
        input.resolutionReason ?? null,
        input.resolvedBy,
        input.resolvedAt,
        conflictId,
      );
  }

  incrementMemoryReuse(memoryIds: string[], timestamp: number): void {
    const uniqueIds = Array.from(new Set(memoryIds.filter(Boolean)));
    for (const memoryId of uniqueIds) {
      this.sqlite
        .prepare(
          `UPDATE memory_items
           SET times_reused = COALESCE(times_reused, 0) + 1,
               last_reused_at = ?,
               updated_at = updated_at
           WHERE id = ?`,
        )
        .run(timestamp, memoryId);
    }
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

  registerVerificationArtifacts(input: {
    missionId: string | null;
    verificationRunId: string | null;
    memoryId: string | null;
    artifacts: VerificationArtifact[];
    sourceKind: VerificationArtifactRecord['source_kind'];
    createdAt: number;
  }): VerificationArtifactRecord[] {
    const created: VerificationArtifactRecord[] = [];

    for (const artifact of input.artifacts) {
      const record: VerificationArtifactRecord = {
        id: createId('vart'),
        mission_id: input.missionId,
        verification_run_id: input.verificationRunId,
        memory_id: input.memoryId,
        artifact_type: artifact.type,
        artifact_ref: artifact.ref,
        artifact_description: artifact.description ?? null,
        source_kind: input.sourceKind,
        created_at: input.createdAt,
      };

      this.sqlite
        .prepare(
          `INSERT INTO verification_artifacts (
            id, mission_id, verification_run_id, memory_id, artifact_type, artifact_ref, artifact_description, source_kind, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.mission_id,
          record.verification_run_id,
          record.memory_id,
          record.artifact_type,
          record.artifact_ref,
          record.artifact_description,
          record.source_kind,
          record.created_at,
        );

      created.push(record);
    }

    return created;
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
    queryProfile: string;
    missionId: string | null;
    domain: string | null;
    policyPath: string;
    retrievalMode: string;
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
          id, query, intent, query_profile, mission_id, domain, policy_path, retrieval_mode, matched_candidates, why_included,
          why_excluded, ranking_contribution, final_selected_set, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trace.id,
        trace.query,
        trace.intent,
        trace.queryProfile,
        trace.missionId,
        trace.domain,
        trace.policyPath,
        trace.retrievalMode,
        toJson(trace.matchedCandidates),
        toJson(trace.whyIncluded),
        toJson(trace.whyExcluded),
        toJson(trace.rankingContribution),
        toJson(trace.finalSelectedSet),
        trace.createdAt,
      );
  }

  getRetrievalTrace(traceId: string): RetrievalTraceRecord | null {
    const row = this.sqlite.prepare('SELECT * FROM retrieval_traces WHERE id = ?').get(traceId) as RawRow | null;
    return row ? asRetrievalTraceRecord(row) : null;
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

  listVerificationArtifactsForMission(missionId: string): VerificationArtifactRecord[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM verification_artifacts WHERE mission_id = ? ORDER BY created_at DESC')
      .all(missionId) as RawRow[];
    return rows.map(asVerificationArtifactRecord);
  }

  listVerificationArtifactsForMemory(memoryId: string): VerificationArtifactRecord[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM verification_artifacts WHERE memory_id = ? ORDER BY created_at DESC')
      .all(memoryId) as RawRow[];
    return rows.map(asVerificationArtifactRecord);
  }

  getVerificationArtifactRegistrySnapshot(missionId: string | null): VerificationArtifactRegistrySnapshot {
    const artifacts = missionId
      ? this.listVerificationArtifactsForMission(missionId)
      : [];
    const orphanRow = this.sqlite
      .prepare(`SELECT COUNT(*) AS count
        FROM verification_artifacts
        WHERE mission_id IS NULL
          AND source_kind != 'memory_reference'`)
      .get() as RawRow | null;

    return {
      mission_id: missionId,
      artifacts,
      orphan_count: Number(orphanRow?.count ?? 0),
    };
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

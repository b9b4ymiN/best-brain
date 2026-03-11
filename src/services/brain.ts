import type {
  BrainOpenOptions,
  CandidateTrace,
  CompletionProofState,
  ConsultCitation,
  ExactFactResolution,
  ConsultRequest,
  ConsultResponse,
  CuratedMemoryInput,
  FailureInput,
  LearnRequest,
  LearnResult,
  ManagerRetrievalBundle,
  MemoryRecord,
  MemoryQualityMetrics,
  MissionContextBundle,
  MissionOutcomeInput,
  MissionRecord,
  MissionStatus,
  RetrievalTraceRecord,
  RetrievalContribution,
  RuntimeConfig,
  VerificationArtifact,
  VerificationArtifactRegistrySnapshot,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../types.ts';
import { createRuntimeConfig } from '../config.ts';
import { ONBOARDING_MEMORY_TITLES } from '../contracts.ts';
import { BrainStore } from '../db/client.ts';
import { getLearningRule, validateLearnRequest } from '../policies/learning.ts';
import {
  bundleMaxK,
  classifyQueryProfile,
  computeStalenessScore,
  defaultMemoryLayer,
  defaultMemoryScope,
  deriveConflictKind,
  deriveEntityAliases,
  deriveEntityKeys,
  isStaleCandidate,
  normalizeMemorySubtype,
  retrievalWeights,
  targetLayerBudgets,
} from '../policies/memory-v2.ts';
import { deriveLifecycle, getRetentionProfile } from '../policies/retention.ts';
import { classifyIntent, policyPathForIntent, preferredTypesForIntent } from '../policies/retrieval.ts';
import { ensureDefaultSeedData } from '../seed/seed.ts';
import { createId } from '../utils/id.ts';
import { summarizeText, countKeywordHits, slugify, tokenize } from '../utils/text.ts';
import { daysToMs, nowMs } from '../utils/time.ts';

interface RetrievalResult {
  selected: MemoryRecord[];
  traceId: string;
  policyPath: string;
  candidates: CandidateTrace[];
  queryProfile: ConsultResponse['query_profile'];
  retrievalMode: ConsultResponse['retrieval_mode'];
  retrievalBundle: ManagerRetrievalBundle | null;
}

function uniqueArtifacts(items: VerificationArtifact[]): VerificationArtifact[] {
  const seen = new Set<string>();
  const result: VerificationArtifact[] = [];

  for (const item of items) {
    const key = `${item.type}:${item.ref}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function scoreToBand(score: number, selectedCount: number): 'low' | 'medium' | 'high' {
  if (score >= 45 && selectedCount >= 2) {
    return 'high';
  }

  if (score >= 22 && selectedCount >= 1) {
    return 'medium';
  }

  return 'low';
}

function buildFollowups(intent: ReturnType<typeof classifyIntent>): string[] {
  switch (intent) {
    case 'persona_guidance':
      return ['Confirm whether this still matches the owner persona.', 'Capture any new owner-specific rule only after explicit confirmation.'];
    case 'preference_lookup':
      return ['Answer in the preferred format.', 'Only update preferences after confirmation from the owner.'];
    case 'procedure_lookup':
      return ['Turn the selected procedure into a checklist.', 'Add proof-of-done before execution.'];
    case 'recent_mission':
      return ['Compare this mission with the latest verified outcome.', 'Review failure lessons before retrying.'];
    case 'failure_lesson':
      return ['Check whether the failure lesson is confirmed.', 'Promote repeated lessons into procedures.'];
    case 'working_context':
      return ['Promote stable insights out of working memory.', 'Expire stale notes that no longer help the mission.'];
    default:
      return ['Check repo and domain memory before adding new assumptions.', 'Record reusable findings after verification.'];
  }
}

function buildCitations(selected: MemoryRecord[]): ConsultCitation[] {
  return selected.map((memory) => ({
    memory_id: memory.id,
    title: memory.title,
    memory_type: memory.memory_type,
    memory_scope: memory.memory_scope,
    memory_layer: memory.memory_layer,
    memory_subtype: memory.memory_subtype,
    summary: memory.summary,
    source: memory.source,
    verified_by: memory.verified_by,
    evidence_ref: memory.evidence_ref,
    entity_keys: memory.entity_keys,
    entity_aliases: memory.entity_aliases,
  }));
}

function normalizedExactValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesExactFact(query: string, memory: Pick<MemoryRecord, 'title' | 'entity_keys' | 'entity_aliases' | 'memory_subtype'>): boolean {
  const normalizedQuery = normalizedExactValue(query);
  const queryTokens = tokenize(normalizedQuery);
  const exactKeys = Array.from(new Set([
    ...memory.entity_keys.flatMap((key) => [key, key.replace(/_/g, ' ')]),
    ...memory.entity_aliases,
  ]))
    .map(normalizedExactValue)
    .filter((candidate) => candidate.length >= 3);

  return exactKeys.some((candidate) => {
    const candidateTokens = tokenize(candidate);
    if (candidateTokens.length <= 1 && !candidate.includes(' ')) {
      return queryTokens.length <= 3 && queryTokens.includes(candidate);
    }

    return normalizedQuery === candidate
      || normalizedQuery.includes(candidate)
      || candidate.includes(normalizedQuery);
  });
}

function citationForMemory(memory: MemoryRecord): ConsultCitation {
  return buildCitations([memory])[0];
}

function buildExactFactResolutions(requiredExactKeys: string[], exactHits: MemoryRecord[], conflicts: Array<{ key: string; memory_id: string }>): ExactFactResolution[] {
  return requiredExactKeys.map((key) => {
    const exactHit = exactHits.find((memory) => memory.entity_keys.includes(key));
    if (exactHit) {
      return {
        key,
        status: 'resolved',
        memory_id: exactHit.id,
        reason: `resolved via ${exactHit.title}`,
      };
    }

    const conflict = conflicts.find((item) => item.key === key);
    if (conflict) {
      return {
        key,
        status: 'conflict',
        memory_id: conflict.memory_id,
        reason: 'exact fact has conflicting active memories',
      };
    }

    return {
      key,
      status: 'missing',
      memory_id: null,
      reason: 'no exact memory matched the required key',
    };
  });
}

export class BestBrain {
  readonly config: RuntimeConfig;
  readonly store: BrainStore;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.store = new BrainStore(config);
  }

  static async open(options: BrainOpenOptions = {}): Promise<BestBrain> {
    const { seedDefaults = true, ...overrides } = options;
    const brain = new BestBrain(createRuntimeConfig(overrides));
    if (seedDefaults) {
      await ensureDefaultSeedData(brain);
    }
    return brain;
  }

  close(): void {
    this.store.close();
  }

  health(): { status: 'ok'; db_path: string; seeded: boolean; onboarded: boolean } {
    return {
      status: 'ok',
      db_path: this.config.dbPath,
      seeded: this.store.getSetting('seed.default.completed') === 'true',
      onboarded: this.store.getSetting('onboarding.completed') === 'true',
    };
  }

  private buildStoredMemoryRecord(input: {
    title: string;
    content: string;
    source: string;
    confidence?: number;
    owner?: string;
    domain?: string | null;
    reusable?: boolean;
    mission_id?: string | null;
    tags?: string[];
    supersedes?: string | null;
    evidence_ref?: VerificationArtifact[];
    memory_type: MemoryRecord['memory_type'];
    memory_scope?: MemoryRecord['memory_scope'];
    memory_layer?: MemoryRecord['memory_layer'];
    memory_subtype?: string;
    entity_keys?: string[];
    entity_aliases?: string[];
    written_by?: MemoryRecord['written_by'];
    owner_scope?: MemoryRecord['owner_scope'];
    retrieval_weight?: number;
    success_rate_hint?: number | null;
    last_validated_at?: number | null;
    valid_until?: number | null;
  }, timestamp: number, status: MemoryRecord['status'], verifiedBy: MemoryRecord['verified_by']): MemoryRecord {
    const lifecycle = deriveLifecycle(input.memory_type, timestamp);
    const tags = Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
    const memorySubtype = normalizeMemorySubtype(input.memory_subtype, input.memory_type, input.title, tags);
    const entityKeys = input.entity_keys && input.entity_keys.length > 0
      ? Array.from(new Set(input.entity_keys.map((item) => item.trim()).filter(Boolean)))
      : deriveEntityKeys({
          title: input.title,
          content: input.content,
          tags,
          memorySubtype,
        });
    const entityAliases = input.entity_aliases && input.entity_aliases.length > 0
      ? Array.from(new Set(input.entity_aliases.map((item) => item.trim()).filter(Boolean)))
      : deriveEntityAliases({
          title: input.title,
          content: input.content,
          tags,
          memorySubtype,
        });

    return {
      id: createId('mem'),
      title: input.title.trim(),
      content: input.content.trim(),
      summary: summarizeText(input.content),
      memory_type: input.memory_type,
      memory_scope: input.memory_scope ?? defaultMemoryScope(input.memory_type, input.mission_id ?? null),
      memory_layer: input.memory_layer ?? defaultMemoryLayer(input.memory_type),
      memory_subtype: memorySubtype,
      source: input.source.trim(),
      confidence: input.confidence ?? 0.7,
      owner: input.owner?.trim() || this.config.owner,
      owner_scope: input.owner_scope ?? 'private',
      domain: input.domain?.trim() || null,
      reusable: input.reusable ?? true,
      supersedes: input.supersedes ?? null,
      superseded_by: null,
      mission_id: input.mission_id ?? null,
      tags,
      entity_keys: entityKeys,
      entity_aliases: entityAliases,
      written_by: input.written_by ?? 'system',
      retrieval_weight: input.retrieval_weight ?? 1,
      promotion_state: 'none',
      times_reused: 0,
      last_reused_at: null,
      success_rate_hint: input.success_rate_hint ?? null,
      status,
      verified_by: verifiedBy,
      evidence_ref: uniqueArtifacts(input.evidence_ref ?? []),
      version: 1,
      review_due_at: lifecycle.review_due_at,
      stale_after_at: lifecycle.stale_after_at,
      archive_after_at: lifecycle.archive_after_at,
      expires_at: lifecycle.expires_at,
      archived_at: null,
      last_validated_at: input.last_validated_at ?? (verifiedBy && verifiedBy !== 'system_inference' ? timestamp : null),
      valid_until: input.valid_until ?? null,
      embedding_status: 'disabled',
      embedding_updated_at: null,
      embedding_model_version: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
  }

  private buildMemoryRecord(request: LearnRequest, timestamp: number, status: MemoryRecord['status'], verifiedBy: MemoryRecord['verified_by']): MemoryRecord {
    const rule = getLearningRule(request.mode);
    return this.buildStoredMemoryRecord({
      title: request.title,
      content: request.content,
      source: request.source?.trim() || request.mode,
      confidence: request.confidence,
      owner: request.owner,
      domain: request.domain,
      reusable: request.reusable,
      mission_id: request.mission_id,
      tags: request.tags,
      supersedes: request.supersedes,
      evidence_ref: request.evidence_ref,
      memory_type: rule.memoryType,
      memory_scope: request.memory_scope,
      memory_layer: request.memory_layer,
      memory_subtype: request.memory_subtype,
      entity_keys: request.entity_keys,
      entity_aliases: request.entity_aliases,
      written_by: request.written_by ?? 'system',
      owner_scope: request.owner_scope,
      retrieval_weight: request.retrieval_weight,
      success_rate_hint: request.success_rate_hint,
      last_validated_at: request.last_validated_at,
      valid_until: request.valid_until,
    }, timestamp, status, verifiedBy);
  }

  private findConflictingActiveMemories(memory: MemoryRecord): MemoryRecord[] {
    return this.store.listActiveMemories().filter((candidate) => {
      if (candidate.id === memory.id) {
        return false;
      }
      if (candidate.memory_subtype !== memory.memory_subtype) {
        return false;
      }
      if (candidate.owner_scope !== memory.owner_scope) {
        return false;
      }
      const sameTitle = slugify(candidate.title) === slugify(memory.title);
      const structuredOverlap = candidate.entity_keys.some((key) => key.includes('_') && memory.entity_keys.includes(key));
      if (!sameTitle && !structuredOverlap) {
        return false;
      }
      return candidate.content.trim().toLowerCase() !== memory.content.trim().toLowerCase();
    });
  }

  private resolveContradictionsForMemory(memory: MemoryRecord, confirmedByUser: boolean, timestamp: number): {
    status: 'resolved' | 'conflict';
    conflictingMemoryIds: string[];
  } {
    const conflicts = this.findConflictingActiveMemories(memory);
    if (conflicts.length === 0) {
      return { status: 'resolved', conflictingMemoryIds: [] };
    }

    if (confirmedByUser && (memory.memory_type === 'Persona' || memory.memory_type === 'Preferences')) {
      for (const conflict of conflicts) {
        this.store.insertMemoryContradiction({
          leftMemoryId: conflict.id,
          rightMemoryId: memory.id,
          conflictKind: deriveConflictKind(conflict, memory),
          resolutionState: 'resolved',
          chosenMemoryId: memory.id,
          resolutionReason: 'auto_supersede',
          resolvedBy: 'user',
          resolvedAt: timestamp,
          createdAt: timestamp,
        });
        this.store.supersedeMemory(conflict.id, memory.id, timestamp);
      }
      return { status: 'resolved', conflictingMemoryIds: conflicts.map((memoryItem) => memoryItem.id) };
    }

    for (const conflict of conflicts) {
      this.store.insertMemoryContradiction({
        leftMemoryId: conflict.id,
        rightMemoryId: memory.id,
        conflictKind: deriveConflictKind(conflict, memory),
        resolutionState: 'user_confirm',
        createdAt: timestamp,
      });
    }

    return { status: 'conflict', conflictingMemoryIds: conflicts.map((memoryItem) => memoryItem.id) };
  }

  async learn(request: LearnRequest): Promise<LearnResult> {
    const timestamp = nowMs();
    const validationError = validateLearnRequest(request);
    if (validationError) {
      this.store.insertLearningEvent({
        mode: request.mode,
        memoryId: null,
        missionId: request.mission_id ?? null,
        action: 'rejected',
        accepted: false,
        reason: validationError,
        payload: request,
        createdAt: timestamp,
      });

      return {
        accepted: false,
        action: 'rejected',
        reason: validationError,
        memory_id: null,
        memory_type: null,
        status: null,
      };
    }

    const rule = getLearningRule(request.mode);
    const confirmed =
      request.confirmed_by_user === true
      || ['user', 'test', 'verifier', 'trusted_import'].includes(request.verified_by ?? '');
    const derivedStatus =
      request.mode === 'failure_lesson'
        ? (confirmed ? 'active' : 'candidate')
        : rule.defaultStatus;
    const status = request.status_override ?? derivedStatus;
    const verifiedBy =
      request.verified_by ?? (confirmed ? rule.defaultVerifiedBy : 'system_inference');

    const mergeCandidate = rule.allowsAutoMerge
      ? this.store.findMergeCandidate(request.title.trim(), rule.memoryType, request.domain ?? null, request.mission_id ?? null)
      : null;

    if (mergeCandidate && mergeCandidate.content.trim() === request.content.trim()) {
      const merged = this.store.touchMergedMemory(
        mergeCandidate.id,
        {
          confidence: Math.max(mergeCandidate.confidence, request.confidence ?? mergeCandidate.confidence),
          source: request.source?.trim() || mergeCandidate.source,
          summary: summarizeText(request.content),
          evidence_ref: uniqueArtifacts([...mergeCandidate.evidence_ref, ...(request.evidence_ref ?? [])]),
          verified_by: verifiedBy,
          status,
        },
        `Merged duplicate ${request.mode} update`,
      );

      this.store.insertLearningEvent({
        mode: request.mode,
        memoryId: merged.id,
        missionId: merged.mission_id,
        action: 'merged',
        accepted: true,
        reason: 'merged duplicate memory',
        payload: request,
        createdAt: timestamp,
      });

      return {
        accepted: true,
        action: 'merged',
        reason: 'merged duplicate memory',
        memory_id: merged.id,
        memory_type: merged.memory_type,
        status: merged.status,
      };
    }

    const next = this.buildMemoryRecord(request, timestamp, status, verifiedBy);

    if (request.supersedes) {
      this.store.supersedeMemory(request.supersedes, next.id, timestamp);
    } else if (mergeCandidate) {
      next.supersedes = mergeCandidate.id;
      this.store.supersedeMemory(mergeCandidate.id, next.id, timestamp);
    }

    this.store.insertMemory(next, `Created from ${request.mode}`);

    const contradictionResult = this.resolveContradictionsForMemory(next, confirmed, timestamp);

    if (next.supersedes) {
      this.store.insertEdge(next.id, next.supersedes, 'derived_from', 1, { mode: request.mode }, timestamp);
    }

    if (next.mission_id) {
      this.store.insertEdge(next.id, next.mission_id, 'belongs_to_mission', 1, { mode: request.mode }, timestamp);
    }

    this.store.insertLearningEvent({
      mode: request.mode,
      memoryId: next.id,
      missionId: next.mission_id,
      action: request.supersedes || mergeCandidate ? 'updated' : 'created',
      accepted: true,
      reason: contradictionResult.status === 'conflict'
        ? 'created new memory with unresolved contradiction'
        : (request.supersedes || mergeCandidate ? 'created successor memory' : 'created new memory'),
      payload: request,
      createdAt: timestamp,
    });

    return {
      accepted: true,
      action: request.supersedes || mergeCandidate ? 'updated' : 'created',
      reason: request.supersedes || mergeCandidate ? 'created successor memory' : 'created new memory',
      memory_id: next.id,
      memory_type: next.memory_type,
      status: next.status,
    };
  }

  async saveCuratedMemory(input: CuratedMemoryInput): Promise<LearnResult> {
    const timestamp = nowMs();
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title) {
      return {
        accepted: false,
        action: 'rejected',
        reason: 'title is required',
        memory_id: null,
        memory_type: null,
        status: null,
      };
    }
    if (!content) {
      return {
        accepted: false,
        action: 'rejected',
        reason: 'content is required',
        memory_id: null,
        memory_type: null,
        status: null,
      };
    }
    if (['Persona', 'Preferences'].includes(input.memory_type) && input.confirmed_by_user !== true) {
      return {
        accepted: false,
        action: 'rejected',
        reason: `${input.memory_type} curated memories require confirmed_by_user=true`,
        memory_id: null,
        memory_type: null,
        status: null,
      };
    }

    const confirmed =
      input.confirmed_by_user === true
      || ['user', 'test', 'verifier', 'trusted_import'].includes(input.verified_by ?? '');
    const status = input.status ?? (
      input.memory_type === 'FailureMemory'
        ? (confirmed ? 'active' : 'candidate')
        : 'active'
    );
    const verifiedBy = input.verified_by ?? (
      confirmed
        ? (['Persona', 'Preferences', 'Procedures', 'DomainMemory', 'RepoMemory'].includes(input.memory_type) ? 'trusted_import' : 'system_inference')
        : 'system_inference'
    );
    const allowsAutoMerge = !['MissionMemory', 'FailureMemory'].includes(input.memory_type);
    const mergeCandidate = allowsAutoMerge
      ? this.store.findMergeCandidate(title, input.memory_type, input.domain ?? null, input.mission_id ?? null)
      : null;

    if (mergeCandidate && mergeCandidate.content.trim() === content) {
      const merged = this.store.touchMergedMemory(
        mergeCandidate.id,
        {
          confidence: Math.max(mergeCandidate.confidence, input.confidence ?? mergeCandidate.confidence),
          source: input.source.trim(),
          summary: summarizeText(content),
          evidence_ref: uniqueArtifacts([...mergeCandidate.evidence_ref, ...(input.evidence_ref ?? [])]),
          verified_by: verifiedBy,
          status,
        },
        `Merged curated ${input.memory_type} memory`,
      );

      this.store.insertLearningEvent({
        mode: `curated_${input.memory_type}`,
        memoryId: merged.id,
        missionId: merged.mission_id,
        action: 'merged',
        accepted: true,
        reason: 'merged duplicate curated memory',
        payload: input,
        createdAt: timestamp,
      });

      return {
        accepted: true,
        action: 'merged',
        reason: 'merged duplicate curated memory',
        memory_id: merged.id,
        memory_type: merged.memory_type,
        status: merged.status,
      };
    }

    const next = this.buildStoredMemoryRecord({
      title,
      content,
      source: input.source,
      confidence: input.confidence,
      owner: input.owner,
      domain: input.domain,
      reusable: input.reusable,
      mission_id: input.mission_id,
      tags: input.tags,
      supersedes: input.supersedes,
      evidence_ref: input.evidence_ref,
      memory_type: input.memory_type,
      memory_scope: input.memory_scope,
      memory_layer: input.memory_layer,
      memory_subtype: input.memory_subtype,
      entity_keys: input.entity_keys,
      entity_aliases: input.entity_aliases,
      written_by: input.written_by ?? 'system',
      owner_scope: input.owner_scope,
      retrieval_weight: input.retrieval_weight,
      last_validated_at: input.last_validated_at,
      valid_until: input.valid_until,
    }, timestamp, status, verifiedBy);

    if (input.supersedes) {
      this.store.supersedeMemory(input.supersedes, next.id, timestamp);
    } else if (mergeCandidate) {
      next.supersedes = mergeCandidate.id;
      this.store.supersedeMemory(mergeCandidate.id, next.id, timestamp);
    }

    this.store.insertMemory(next, `Created curated ${input.memory_type} memory`);
    const contradictionResult = this.resolveContradictionsForMemory(next, confirmed, timestamp);

    if (next.supersedes) {
      this.store.insertEdge(next.id, next.supersedes, 'derived_from', 1, { mode: `curated_${input.memory_type}` }, timestamp);
    }

    if (next.mission_id) {
      this.store.insertEdge(next.id, next.mission_id, 'belongs_to_mission', 1, { mode: `curated_${input.memory_type}` }, timestamp);
    }

    if (next.evidence_ref.length > 0) {
      this.store.registerVerificationArtifacts({
        missionId: next.mission_id,
        verificationRunId: null,
        memoryId: next.id,
        artifacts: next.evidence_ref,
        sourceKind: 'memory_reference',
        createdAt: timestamp,
      });
    }

    this.store.insertLearningEvent({
      mode: `curated_${input.memory_type}`,
      memoryId: next.id,
      missionId: next.mission_id,
      action: next.supersedes ? 'updated' : 'created',
      accepted: true,
      reason: contradictionResult.status === 'conflict'
        ? 'created curated memory with unresolved contradiction'
        : (next.supersedes ? 'created successor curated memory' : 'created new curated memory'),
      payload: input,
      createdAt: timestamp,
    });

    return {
      accepted: true,
      action: next.supersedes ? 'updated' : 'created',
      reason: next.supersedes ? 'created successor curated memory' : 'created new curated memory',
      memory_id: next.id,
      memory_type: next.memory_type,
      status: next.status,
    };
  }

  private retrieve(request: ConsultRequest, persistTrace: boolean): RetrievalResult {
    const timestamp = nowMs();
    this.store.runMaintenance(timestamp);

    const intent = classifyIntent(request.query, request.mission_id);
    const preferredTypes = preferredTypesForIntent(intent);
    const policyPath = policyPathForIntent(intent);
    const queryTokens = tokenize(request.query);
    const queryProfile = classifyQueryProfile(request.query, intent);
    const weights = retrievalWeights(queryProfile);
    const lexicalScores = new Map(this.store.searchMemoriesLexical(request.query, 40).map((entry) => [entry.memory_id, entry.score]));
    const allMemories = this.store.listMemories();
    const exactConflictKeys = new Map<string, string>();
    const blockedExactCandidates = allMemories.filter((memory) => matchesExactFact(request.query, memory));
    for (const memory of blockedExactCandidates) {
      const hasConflict = this.store.listActiveContradictionsForMemory(memory.id)
        .some((conflict) => conflict.resolution_state !== 'resolved');
      if (hasConflict) {
        for (const key of memory.entity_keys) {
          exactConflictKeys.set(key, memory.id);
        }
      }
    }

    const traces: CandidateTrace[] = [];
    const duplicateKeys = new Map<string, string>();
    for (const memory of allMemories) {
      const linkedMission = memory.mission_id ? this.store.getMission(memory.mission_id) : null;
      const whyIncluded: string[] = [];
      const whyExcluded: string[] = [];
      const rankingContribution: RetrievalContribution[] = [];

      if (memory.status === 'superseded' || memory.superseded_by) {
        whyExcluded.push('superseded');
      }
      if (memory.status === 'expired') {
        whyExcluded.push('expired');
      }
      if (memory.status === 'archived' && memory.memory_type !== 'MissionMemory') {
        whyExcluded.push('archived');
      }
      if (memory.status === 'candidate') {
        whyExcluded.push(memory.memory_type === 'FailureMemory' ? 'unconfirmed_failure' : 'candidate_pending_confirmation');
      }

      const searchable = `${memory.title} ${memory.summary} ${memory.content} ${memory.tags.join(' ')} ${memory.domain ?? ''}`;
      const keywordHits = countKeywordHits(queryTokens, searchable);
      const exactMatch = matchesExactFact(request.query, memory);
      let lexicalScore = lexicalScores.get(memory.id) ?? 0;
      if (keywordHits > 0) {
        lexicalScore = Math.max(lexicalScore, Math.min(1, keywordHits / Math.max(queryTokens.length, 1)));
        rankingContribution.push({ rule: 'keyword_hits', delta: lexicalScore * 24 });
        whyIncluded.push(`matched ${keywordHits} query tokens`);
      }
      if (exactMatch) {
        lexicalScore = Math.max(lexicalScore, 1);
        rankingContribution.push({ rule: 'exact_match', delta: 30 });
        whyIncluded.push('matched exact entity or alias');
      }

      const typeIndex = preferredTypes.indexOf(memory.memory_type);
      let policyScore = 0;
      if (typeIndex !== -1) {
        const typeScore = Math.max(0.25, 0.9 - typeIndex * 0.15);
        policyScore += typeScore;
        rankingContribution.push({ rule: 'intent_memory_type', delta: typeScore * 18 });
        whyIncluded.push(`preferred ${memory.memory_type} for ${intent}`);
      }

      if (request.domain && memory.domain === request.domain) {
        policyScore += 0.2;
        rankingContribution.push({ rule: 'domain_match', delta: 14 });
        whyIncluded.push('matched requested domain');
      } else if (request.domain && memory.domain && memory.domain !== request.domain) {
        rankingContribution.push({ rule: 'domain_mismatch', delta: -10 });
        whyExcluded.push('domain mismatch');
      }

      if (request.mission_id && memory.mission_id === request.mission_id) {
        policyScore += 0.2;
        rankingContribution.push({ rule: 'mission_match', delta: 18 });
        whyIncluded.push('matched requested mission');
      } else if (request.mission_id && memory.mission_id && memory.mission_id !== request.mission_id) {
        rankingContribution.push({ rule: 'other_mission', delta: -8 });
      }
      if (intent === 'recent_mission' && linkedMission?.status === 'verified_complete') {
        rankingContribution.push({ rule: 'verified_mission_state', delta: 20 });
        whyIncluded.push('mission is verified_complete');
      } else if (intent === 'recent_mission' && linkedMission && linkedMission.status !== 'verified_complete') {
        rankingContribution.push({ rule: 'unverified_mission_penalty', delta: -10 });
        whyExcluded.push('mission not verified_complete');
      }

      if (memory.verified_by && memory.verified_by !== 'system_inference') {
        rankingContribution.push({ rule: 'verified_signal', delta: 8 });
        whyIncluded.push(`verified by ${memory.verified_by}`);
      }
      if (memory.memory_type === 'MissionMemory' && memory.verified_by === 'verifier') {
        rankingContribution.push({ rule: 'verified_mission_bonus', delta: 16 });
        whyIncluded.push('latest verified mission memory');
      }
      if (memory.evidence_ref.length > 0) {
        rankingContribution.push({ rule: 'has_evidence', delta: 4 });
      }
      if (memory.reusable) {
        rankingContribution.push({ rule: 'reusable', delta: 3 });
      }

      const ageDays = Math.max(0, (timestamp - memory.updated_at) / daysToMs(1));
      if (getRetentionProfile(memory.memory_type).recentPriority) {
        rankingContribution.push({ rule: 'recent_priority', delta: Math.max(0, 12 - ageDays / 7) });
      } else if (ageDays < 30) {
        rankingContribution.push({ rule: 'freshness', delta: 4 });
      }
      if (intent === 'recent_mission' && linkedMission?.completed_at) {
        const missionAgeDays = Math.max(0, (timestamp - linkedMission.completed_at) / daysToMs(1));
        rankingContribution.push({ rule: 'verified_mission_recency', delta: Math.max(0, 12 - missionAgeDays / 7) });
      }

      if (memory.stale_after_at && memory.stale_after_at <= timestamp) {
        rankingContribution.push({ rule: 'stale_penalty', delta: -12 });
        whyExcluded.push('stale-check due');
      }

      const staleScore = computeStalenessScore(memory, timestamp);
      if (isStaleCandidate(memory, timestamp)) {
        rankingContribution.push({ rule: 'stale_candidate', delta: -18 });
        whyExcluded.push('stale_candidate');
      }

      if (queryProfile === 'blocked_exact' && !exactMatch) {
        whyExcluded.push('not_exact_match');
      }
      const conflictingExactKey = memory.entity_keys.find((key) => exactConflictKeys.has(key));
      if (queryProfile === 'blocked_exact' && exactMatch && conflictingExactKey) {
        whyExcluded.push(`exact_conflict:${conflictingExactKey}`);
      }

      const vectorScore = 0;
      const finalScore =
        (lexicalScore * weights.lexical + policyScore * weights.policy + vectorScore * weights.vector) * 100
        + rankingContribution.reduce((sum, item) => sum + item.delta, 0)
        - staleScore * 10;
      const duplicateKey = `${memory.memory_type}:${slugify(memory.title)}:${memory.mission_id ?? ''}`;
      const prior = duplicateKeys.get(duplicateKey);
      if (prior) {
        whyExcluded.push(`duplicate_of:${prior}`);
      } else {
        duplicateKeys.set(duplicateKey, memory.id);
      }

      if (keywordHits === 0 && lexicalScore === 0 && typeIndex === -1 && !request.mission_id && !request.domain) {
        whyExcluded.push('low lexical relevance');
      }

      traces.push({
        memory_id: memory.id,
        title: memory.title,
        memory_type: memory.memory_type,
        memory_scope: memory.memory_scope,
        memory_layer: memory.memory_layer,
        memory_subtype: memory.memory_subtype,
        source: memory.source,
        lexical_score: lexicalScore,
        vector_score: vectorScore,
        policy_score: policyScore,
        score: finalScore,
        final_score: finalScore,
        why_included: whyIncluded,
        why_excluded: whyExcluded,
        ranking_contribution: rankingContribution,
      });
    }

    const bundleProfile = request.bundle_profile
      ?? (request.consumer === 'manager'
        ? 'manager_plan'
        : request.consumer === 'worker'
          ? 'worker_exec'
          : 'chat_direct');
    const maxSelected = Math.min(request.limit ?? bundleMaxK(bundleProfile), bundleMaxK(bundleProfile));
    const eligible = traces.filter((trace) => trace.why_excluded.length === 0);
    const budgetTargets = targetLayerBudgets(intent);
    const selectedIds: string[] = [];
    const selectedLayerCounts = new Map<MemoryRecord['memory_layer'], number>();
    const eligibleMap = new Map(eligible.map((trace) => [trace.memory_id, trace]));

    if (queryProfile === 'blocked_exact') {
      for (const trace of eligible
        .filter((trace) => trace.why_included.includes('matched exact entity or alias'))
        .sort((left, right) => right.final_score - left.final_score)
        .slice(0, maxSelected)) {
        selectedIds.push(trace.memory_id);
      }
    } else {
      while (selectedIds.length < maxSelected) {
        const remaining = eligible
          .filter((trace) => !selectedIds.includes(trace.memory_id))
          .map((trace) => {
            const memory = this.store.getMemory(trace.memory_id);
            if (!memory) {
              return null;
            }
            const currentCount = selectedLayerCounts.get(memory.memory_layer) ?? 0;
            const currentShare = selectedIds.length === 0 ? 0 : currentCount / selectedIds.length;
            const targetShare = budgetTargets[memory.memory_layer];
            const diversityPenalty = currentShare > targetShare ? (currentShare - targetShare) * 25 : 0;
            return {
              trace,
              adjustedScore: trace.final_score - diversityPenalty,
              layer: memory.memory_layer,
            };
          })
          .filter((item): item is { trace: CandidateTrace; adjustedScore: number; layer: MemoryRecord['memory_layer'] } => item != null)
          .sort((left, right) => right.adjustedScore - left.adjustedScore);

        const next = remaining[0];
        if (!next) {
          break;
        }
        selectedIds.push(next.trace.memory_id);
        selectedLayerCounts.set(next.layer, (selectedLayerCounts.get(next.layer) ?? 0) + 1);
      }
    }
    const selected = selectedIds
      .map((id) => this.store.getMemory(id))
      .filter((memory): memory is MemoryRecord => memory != null);
    const traceId = createId('trace');
    const exactHits = allMemories
      .filter((memory) => matchesExactFact(request.query, memory))
      .filter((memory) => !traces.find((trace) => trace.memory_id === memory.id)?.why_excluded.includes('exact_conflict'))
      .sort((left, right) => (eligibleMap.get(right.id)?.final_score ?? 0) - (eligibleMap.get(left.id)?.final_score ?? 0))
      .slice(0, 4);
    const exactRequirementConflicts = Array.from(exactConflictKeys.entries()).map(([key, memoryId]) => ({ key, memory_id: memoryId }));
    const retrievalBundle = request.consumer || request.bundle_profile
      ? ({
          bundle_profile: bundleProfile,
          query_profile: queryProfile,
          exact_hits: exactHits.map(citationForMemory),
          identity_bundle: selected.filter((memory) => memory.memory_scope === 'owner' || memory.memory_layer === 'principle').map(citationForMemory),
          approach_bundle: selected.filter((memory) => memory.memory_layer === 'pattern' || memory.memory_layer === 'learning').map(citationForMemory),
          proof_bundle: selected.filter((memory) => memory.memory_layer === 'retro' || memory.memory_type === 'FailureMemory').map(citationForMemory),
          working_bundle: selected.filter((memory) => memory.memory_layer === 'working' || memory.memory_scope === 'session').map(citationForMemory),
          suppressed_candidates: traces
            .filter((trace) => trace.why_excluded.length > 0)
            .slice(0, 5)
            .map((trace) => ({
              memory_id: trace.memory_id,
              title: trace.title,
              reason: trace.why_excluded[0] ?? 'suppressed',
            })),
          tension_signals: selected.flatMap((memory) => {
            const conflicts = this.store.listActiveContradictionsForMemory(memory.id).slice(0, 2);
            return conflicts.map((conflict) => ({
              left_memory_id: conflict.left_memory_id,
              right_memory_id: conflict.right_memory_id,
              signal_type: 'contradiction' as const,
              severity: 'high' as const,
              summary: `Conflicting active memories detected for ${memory.title}.`,
              recommended_handling: 'Resolve the contradiction before promoting or relying on an exact fact.',
            }));
          }),
          blocked_exact_status: queryProfile === 'blocked_exact'
            ? (exactRequirementConflicts.length > 0 ? 'exact_conflict' : exactHits.length > 0 ? 'resolved' : 'no_exact_match')
            : 'resolved',
          exact_requirements: buildExactFactResolutions(
            exactHits.flatMap((memory) => memory.entity_keys.filter((key) => key.startsWith('owner_') || key.startsWith('preferred_'))),
            exactHits,
            exactRequirementConflicts,
          ),
        }) satisfies ManagerRetrievalBundle
      : null;
    const retrievalMode =
      queryProfile === 'blocked_exact'
        ? 'blocked_exact'
        : queryProfile === 'semantic_long' || queryProfile === 'balanced'
          ? 'vector_unavailable_fallback'
          : 'fts_only';

    if (persistTrace) {
      this.store.insertRetrievalTrace({
        id: traceId,
        query: request.query,
        intent,
        queryProfile,
        missionId: request.mission_id ?? null,
        domain: request.domain ?? null,
        policyPath,
        retrievalMode,
        matchedCandidates: traces,
        whyIncluded: traces.filter((trace) => trace.why_included.length > 0).map((trace) => ({
          memory_id: trace.memory_id,
          why_included: trace.why_included,
        })),
        whyExcluded: traces.filter((trace) => trace.why_excluded.length > 0).map((trace) => ({
          memory_id: trace.memory_id,
          why_excluded: trace.why_excluded,
        })),
        rankingContribution: traces.map((trace) => ({
          memory_id: trace.memory_id,
          ranking_contribution: trace.ranking_contribution,
          score: trace.score,
        })),
        finalSelectedSet: selectedIds,
        createdAt: timestamp,
      });
    }

    return {
      selected,
      traceId,
      policyPath,
      candidates: traces,
      queryProfile,
      retrievalMode,
      retrievalBundle,
    };
  }

  async consult(request: ConsultRequest): Promise<ConsultResponse> {
    const retrieval = this.retrieve(request, true);
    const topScore = retrieval.candidates
      .filter((candidate) => retrieval.selected.some((memory) => memory.id === candidate.memory_id))
      .reduce((max, candidate) => Math.max(max, candidate.final_score), 0);
    const confidenceBand = scoreToBand(topScore, retrieval.selected.length);
    const intent = classifyIntent(request.query, request.mission_id);

    const answer = retrieval.queryProfile === 'blocked_exact' && retrieval.retrievalBundle?.blocked_exact_status === 'no_exact_match'
      ? 'I could not resolve that exact fact from the current brain memory. Please clarify or confirm the exact value first.'
      : retrieval.selected.length === 0
      ? 'No strong memory match was found. Capture a durable procedure, mission note, or confirmed preference before acting on this query.'
      : [
          `Consult intent: ${intent}.`,
          ...retrieval.selected.slice(0, 3).map((memory) => `- [${memory.memory_type}/${memory.memory_layer}] ${memory.title}: ${memory.summary}`),
        ].join('\n');

    return {
      answer,
      memory_ids: retrieval.selected.map((memory) => memory.id),
      citations: buildCitations(retrieval.selected),
      policy_path: retrieval.policyPath,
      query_profile: retrieval.queryProfile,
      retrieval_mode: retrieval.retrievalMode,
      confidence_band: confidenceBand,
      followup_actions: buildFollowups(intent),
      trace_id: retrieval.traceId,
      selected_memories: retrieval.selected,
      retrieval_bundle: retrieval.retrievalBundle,
    };
  }

  getPreferredFormat(): string {
    return this.store.getPreferredFormatMemory()?.content
      ?? 'Concise, evidence-backed updates with explicit status and next actions.';
  }

  getOnboardingSnapshot(): {
    persona: string | null;
    preferred_report_format: string | null;
    communication_style: string | null;
    quality_bar: string | null;
    planning_playbook: string | null;
    completed: boolean;
  } {
    return {
      persona: this.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.persona, 'Persona')?.content ?? null,
      preferred_report_format: this.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.reportFormat, 'Preferences')?.content ?? null,
      communication_style: this.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.communicationStyle, 'Preferences')?.content ?? null,
      quality_bar: this.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.qualityBar, 'Preferences')?.content ?? null,
      planning_playbook: this.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.planningPlaybook, 'Procedures')?.content ?? null,
      completed: this.store.getSetting('onboarding.completed') === 'true',
    };
  }

  getMemoryQualityMetrics(): MemoryQualityMetrics {
    const timestamp = nowMs();
    const activeMemories = this.store.listActiveMemories().filter((memory) => !memory.superseded_by);
    const staleCandidateCount = activeMemories.filter((memory) => isStaleCandidate(memory, timestamp)).length;
    const staleRatio = activeMemories.length === 0
      ? 0
      : Number(((staleCandidateCount / activeMemories.length) * 100).toFixed(2));
    const unresolvedContradictionCount = this.store.countUnresolvedContradictions();

    const traces = this.store.listRetrievalTraces(120);
    let supersededLeakageCount = 0;
    let usefulTraceCount = 0;
    let groundedTraceCount = 0;
    for (const trace of traces) {
      if (trace.final_selected_set.length === 0) {
        continue;
      }
      usefulTraceCount += 1;
      let grounded = false;
      for (const memoryId of trace.final_selected_set) {
        const memory = this.store.getMemory(memoryId);
        if (!memory) {
          continue;
        }
        if (memory.status === 'superseded' || memory.status === 'expired' || (memory.status === 'archived' && memory.memory_type !== 'MissionMemory')) {
          supersededLeakageCount += 1;
        }
        if ((memory.verified_by != null && memory.verified_by !== 'system_inference') || memory.evidence_ref.length > 0) {
          grounded = true;
        }
      }
      if (grounded) {
        groundedTraceCount += 1;
      }
    }

    const citationUsefulnessRating = usefulTraceCount === 0
      ? 0
      : Number((((groundedTraceCount / usefulTraceCount) * 5)).toFixed(2));

    return {
      generated_at: timestamp,
      active_memory_count: activeMemories.length,
      stale_candidate_count: staleCandidateCount,
      stale_ratio: staleRatio,
      unresolved_contradiction_count: unresolvedContradictionCount,
      superseded_retrieval_leakage_count: supersededLeakageCount,
      citation_usefulness_rating: citationUsefulnessRating,
    };
  }

  getVerificationArtifactRegistry(missionId: string | null): VerificationArtifactRegistrySnapshot {
    return this.store.getVerificationArtifactRegistrySnapshot(missionId);
  }

  getRetrievalTrace(traceId: string): RetrievalTraceRecord | null {
    return this.store.getRetrievalTrace(traceId);
  }

  private getPlanningHints(): string[] {
    return Array.from(new Set(this.store.getPlanningHintMemories(5).map((memory) => memory.summary))).slice(0, 5);
  }

  private ensureMission(id: string, objective: string, domain: string | null): MissionRecord {
    const existing = this.store.getMission(id);
    if (existing) {
      return this.store.upsertMission({
        ...existing,
        objective,
        domain: domain ?? existing.domain,
        planning_hints: existing.planning_hints.length > 0 ? existing.planning_hints : this.getPlanningHints(),
        preferred_format: existing.preferred_format ?? this.getPreferredFormat(),
        verification_required: true,
        updated_at: nowMs(),
      });
    }

    const timestamp = nowMs();
    return this.store.upsertMission({
      id,
      objective,
      domain,
      status: 'draft',
      planning_hints: this.getPlanningHints(),
      preferred_format: this.getPreferredFormat(),
      verification_required: true,
      latest_outcome_memory_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      started_at: null,
      completed_at: null,
      rejected_reason: null,
    });
  }

  private transitionMission(mission: MissionRecord, status: MissionStatus, reason: string | null = null): MissionRecord {
    const timestamp = nowMs();
    return this.store.upsertMission({
      ...mission,
      status,
      updated_at: timestamp,
      started_at: mission.started_at ?? (status !== 'draft' ? timestamp : null),
      completed_at: status === 'verified_complete' ? timestamp : mission.completed_at,
      rejected_reason: status === 'rejected' ? reason : null,
    });
  }

  async saveMissionOutcome(input: MissionOutcomeInput): Promise<{ mission: MissionRecord; learn_result: LearnResult; proof_state: CompletionProofState | null }> {
    const mission = this.ensureMission(input.mission_id, input.objective, input.domain ?? null);
    let updatedMission = mission;

    if (mission.status === 'verification_failed' && input.status === 'in_progress') {
      updatedMission = this.transitionMission(mission, 'in_progress');
    }

    const nextStatus = input.status ?? 'awaiting_verification';
    if (nextStatus === 'draft') {
      throw new Error('mission outcomes cannot move a mission back to draft');
    }

    const content = [
      `Objective: ${input.objective}`,
      `Mission kind: ${input.mission_kind ?? 'unknown'}`,
      `Result: ${input.result_summary}`,
      `Evidence: ${input.evidence.map((artifact) => `${artifact.type}:${artifact.ref}`).join(', ') || 'none'}`,
      `Verification checks: ${input.verification_checks.map((check) => `${check.name}=${check.passed ? 'pass' : 'fail'}`).join(', ') || 'none'}`,
    ].join('\n');
    const missionKindTag = input.mission_kind?.trim()
      ? `mission-kind:${slugify(input.mission_kind.replace(/_/g, ' '))}`
      : null;

    const learnResult = await this.learn({
      mode: 'mission_outcome',
      title: `Mission outcome: ${input.objective}`,
      content,
      source: 'mission_outcome',
      confidence: 0.8,
      owner: this.config.owner,
      domain: input.domain ?? mission.domain,
      reusable: true,
      mission_id: input.mission_id,
      tags: missionKindTag ? ['mission', 'outcome', missionKindTag] : ['mission', 'outcome'],
      verified_by: 'system_inference',
      evidence_ref: input.evidence,
    });

    const nextMission = this.store.upsertMission({
      ...updatedMission,
      status: nextStatus,
      latest_outcome_memory_id: learnResult.memory_id,
      updated_at: nowMs(),
      started_at: updatedMission.started_at ?? nowMs(),
      preferred_format: updatedMission.preferred_format ?? this.getPreferredFormat(),
      planning_hints: updatedMission.planning_hints.length > 0 ? updatedMission.planning_hints : this.getPlanningHints(),
    });

    this.store.insertMissionEvent(
      nextMission.id,
      'outcome_saved',
      'brain',
      `Mission outcome recorded and mission moved to ${nextMission.status}.`,
      {
        outcome_memory_id: learnResult.memory_id,
        mission_kind: input.mission_kind ?? null,
        checks: input.verification_checks,
        evidence: input.evidence,
        reused_memory_ids: input.reused_memory_ids ?? [],
      },
      nowMs(),
    );

    if (input.evidence.length > 0) {
      this.store.registerVerificationArtifacts({
        missionId: nextMission.id,
        verificationRunId: null,
        memoryId: learnResult.memory_id,
        artifacts: input.evidence,
        sourceKind: 'mission_outcome',
        createdAt: nowMs(),
      });
    }

    return {
      mission: nextMission,
      learn_result: learnResult,
      proof_state: this.store.getCompletionProofState(nextMission.id),
    };
  }

  async saveFailure(input: FailureInput): Promise<LearnResult> {
    const result = await this.learn({
      mode: 'failure_lesson',
      title: input.title,
      content: [`Cause: ${input.cause}`, `Lesson: ${input.lesson}`, `Prevention: ${input.prevention}`].join('\n'),
      source: 'failure_lesson',
      confidence: input.confirmed ? 0.85 : 0.6,
      owner: this.config.owner,
      domain: input.domain ?? null,
      reusable: true,
      mission_id: input.mission_id ?? null,
      tags: ['failure', 'lesson'],
      confirmed_by_user: input.confirmed === true,
      verified_by: input.confirmed ? 'user' : 'system_inference',
      evidence_ref: input.evidence_ref ?? [],
    });

    if (result.accepted && (input.evidence_ref?.length ?? 0) > 0) {
      this.store.registerVerificationArtifacts({
        missionId: input.mission_id ?? null,
        verificationRunId: null,
        memoryId: result.memory_id,
        artifacts: input.evidence_ref ?? [],
        sourceKind: 'failure_lesson',
        createdAt: nowMs(),
      });
    }

    return result;
  }

  async getContext(params: { mission_id?: string | null; domain?: string | null; query?: string | null }): Promise<MissionContextBundle> {
    const mission = params.mission_id ? this.store.getMission(params.mission_id) : null;
    const history = mission ? this.store.listMissionEvents(mission.id, 10) : [];
    const retrieval = params.query
      ? this.retrieve({
          query: params.query,
          mission_id: params.mission_id ?? null,
          domain: params.domain ?? null,
          limit: 5,
          consumer: 'manager',
          bundle_profile: 'manager_plan',
        }, false)
      : null;
    const selected = retrieval?.selected
      ?? this.store.listMemories().filter((memory) => memory.status === 'active').slice(0, 5);

    return {
      mission,
      history,
      working_memory: selected.filter((memory) => memory.memory_type === 'WorkingMemory' || memory.memory_type === 'MissionMemory'),
      durable_memory: selected.filter((memory) => memory.memory_type !== 'WorkingMemory'),
      planning_hints: mission?.planning_hints ?? this.getPlanningHints(),
      preferred_format: mission?.preferred_format ?? this.getPreferredFormat(),
      verification_state: mission ? this.store.getCompletionProofState(mission.id) : null,
      verification_artifacts: mission ? this.store.getVerificationArtifactRegistrySnapshot(mission.id).artifacts : [],
      manager_bundle: retrieval?.retrievalBundle ?? null,
    };
  }

  async startVerification(input: VerificationStartInput): Promise<CompletionProofState> {
    const mission = this.store.getMission(input.mission_id);
    if (!mission) {
      throw new Error(`Mission not found: ${input.mission_id}`);
    }
    if (mission.status === 'draft') {
      throw new Error('draft missions cannot enter verification');
    }

    let updatedMission = mission;
    if (mission.status === 'verification_failed') {
      updatedMission = this.transitionMission(mission, 'in_progress');
      this.store.insertMissionEvent(updatedMission.id, 'reopened', input.requested_by ?? 'brain', 'Mission moved back to in_progress after failed verification.', {}, nowMs());
    }

    updatedMission = this.transitionMission(updatedMission, 'awaiting_verification');
    const runId = this.store.insertVerificationRun({
      missionId: updatedMission.id,
      requestedBy: input.requested_by ?? 'brain',
      status: 'running',
      summary: null,
      evidence: [],
      checks: input.checks ?? [],
      startedAt: nowMs(),
      completedAt: null,
    });

    this.store.insertMissionEvent(
      updatedMission.id,
      'verification_started',
      input.requested_by ?? 'brain',
      'Verification loop started.',
      { verification_run_id: runId, checks: input.checks ?? [] },
      nowMs(),
    );

    const proof = this.store.getCompletionProofState(updatedMission.id);
    if (!proof) {
      throw new Error('Unable to load completion proof state');
    }
    return proof;
  }

  async completeVerification(input: VerificationCompleteInput): Promise<CompletionProofState> {
    const run =
      (input.verification_run_id ? this.store.getVerificationRun(input.verification_run_id) : null)
      ?? (input.mission_id ? this.store.getLatestVerificationRunForMission(input.mission_id) : null);

    if (!run) {
      throw new Error('Verification run not found');
    }

    const mission = this.store.getMission(String(run.mission_id));
    if (!mission) {
      throw new Error(`Mission not found: ${String(run.mission_id)}`);
    }

    if (input.status === 'verified_complete') {
      if (input.evidence.length === 0) {
        throw new Error('verified_complete requires at least one evidence artifact');
      }
      if (input.verification_checks.some((check) => !check.passed)) {
        throw new Error('verified_complete requires all verification checks to pass');
      }
    }

    this.store.updateVerificationRun(String(run.id), input.status, input.summary ?? null, input.evidence, input.verification_checks, nowMs());

    const nextMission = this.transitionMission(mission, input.status, input.summary ?? null);
    this.store.insertMissionEvent(
      nextMission.id,
      'verification_completed',
      'verifier',
      `Verification finished with status ${input.status}.`,
      { verification_run_id: String(run.id), evidence: input.evidence, checks: input.verification_checks },
      nowMs(),
    );

    if (input.evidence.length > 0) {
      this.store.registerVerificationArtifacts({
        missionId: nextMission.id,
        verificationRunId: String(run.id),
        memoryId: nextMission.latest_outcome_memory_id,
        artifacts: input.evidence,
        sourceKind: 'verification_complete',
        createdAt: nowMs(),
      });
    }

    if (input.status === 'verified_complete') {
      const latestOutcomeEvent = this.store.listMissionEvents(nextMission.id, 10)
        .find((event) => event.event_type === 'outcome_saved');
      const reusedMemoryIds = Array.isArray(latestOutcomeEvent?.data.reused_memory_ids)
        ? latestOutcomeEvent?.data.reused_memory_ids.filter((item): item is string => typeof item === 'string')
        : [];
      if (reusedMemoryIds.length > 0) {
        this.store.incrementMemoryReuse(reusedMemoryIds, nowMs());
      }
    }

    if (input.status === 'verified_complete' && nextMission.latest_outcome_memory_id) {
      const outcomeMemory = this.store.getMemory(nextMission.latest_outcome_memory_id);
      if (outcomeMemory) {
        this.store.touchMergedMemory(
          outcomeMemory.id,
          {
            evidence_ref: uniqueArtifacts([...outcomeMemory.evidence_ref, ...input.evidence]),
            verified_by: 'verifier',
            confidence: Math.max(outcomeMemory.confidence, 0.95),
          },
          'Verification completed',
        );
      }
    }

    const proof = this.store.getCompletionProofState(nextMission.id);
    if (!proof) {
      throw new Error('Unable to compute completion proof state');
    }
    return proof;
  }
}

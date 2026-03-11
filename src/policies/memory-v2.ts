import type {
  ConsultIntent,
  MemoryLayer,
  MemoryRecord,
  MemoryScope,
  MemoryType,
  QueryProfile,
  RetrievalBundleProfile,
} from '../types.ts';
import { slugify, tokenize } from '../utils/text.ts';
import { daysToMs } from '../utils/time.ts';

const SUBTYPE_ALIASES: Record<string, string> = {
  'preferences.report_format': 'preference.report_format',
  'preferences.communication_style': 'preference.communication_style',
  'procedures.planning': 'procedure.planning',
  'procedures.verification': 'procedure.verification',
  'verify.procedure': 'procedure.verification',
  'repo.command': 'repo.commands',
  'persona.name': 'persona.identity',
};

export const CANONICAL_MEMORY_SUBTYPES = [
  'persona.identity',
  'persona.values',
  'persona.investor_style',
  'preference.report_format',
  'preference.communication_style',
  'preference.workflow',
  'procedure.planning',
  'procedure.verification',
  'procedure.debugging',
  'domain.model',
  'domain.risk',
  'repo.commands',
  'repo.conventions',
  'repo.risks',
  'mission.brief',
  'mission.outcome',
  'mission.report',
  'failure.cause',
  'failure.prevention',
  'working.session_note',
] as const;

const SUBTYPE_REGISTRY = new Set<string>(CANONICAL_MEMORY_SUBTYPES);

const GENERIC_ENTITY_TOKENS = new Set<string>([
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'your',
  'owner',
  'persona',
  'preference',
  'procedure',
  'mission',
  'report',
  'system',
  'plan',
  'proof',
  'playbook',
  'quality',
  'style',
  'format',
]);

export function normalizeMemorySubtype(value: string | null | undefined, memoryType: MemoryType, title = '', tags: string[] = []): string {
  const candidate = value?.trim().toLowerCase();
  if (candidate) {
    const normalized = SUBTYPE_ALIASES[candidate] ?? candidate;
    if (SUBTYPE_REGISTRY.has(normalized) || normalized.startsWith('custom.')) {
      return normalized;
    }
    throw new Error(`memory_subtype is not recognized: ${value}`);
  }

  const normalizedTitle = `${title} ${tags.join(' ')}`.toLowerCase();
  switch (memoryType) {
    case 'Persona':
      if (normalizedTitle.includes('name') || normalizedTitle.includes('identity')) {
        return 'persona.identity';
      }
      if (normalizedTitle.includes('value')) {
        return 'persona.values';
      }
      if (normalizedTitle.includes('investor') || normalizedTitle.includes('ลงทุน') || normalizedTitle.includes('vi')) {
        return 'persona.investor_style';
      }
      return 'persona.identity';
    case 'Preferences':
      if (normalizedTitle.includes('format') || normalizedTitle.includes('report')) {
        return 'preference.report_format';
      }
      if (normalizedTitle.includes('style') || normalizedTitle.includes('tone') || normalizedTitle.includes('communication')) {
        return 'preference.communication_style';
      }
      return 'preference.workflow';
    case 'Procedures':
      if (normalizedTitle.includes('verify') || normalizedTitle.includes('proof') || normalizedTitle.includes('checklist')) {
        return 'procedure.verification';
      }
      if (normalizedTitle.includes('debug')) {
        return 'procedure.debugging';
      }
      return 'procedure.planning';
    case 'DomainMemory':
      return normalizedTitle.includes('risk') ? 'domain.risk' : 'domain.model';
    case 'RepoMemory':
      if (normalizedTitle.includes('command')) {
        return 'repo.commands';
      }
      if (normalizedTitle.includes('risk')) {
        return 'repo.risks';
      }
      return 'repo.conventions';
    case 'MissionMemory':
      if (normalizedTitle.includes('report')) {
        return 'mission.report';
      }
      if (normalizedTitle.includes('brief')) {
        return 'mission.brief';
      }
      return 'mission.outcome';
    case 'FailureMemory':
      return normalizedTitle.includes('prevent') ? 'failure.prevention' : 'failure.cause';
    case 'WorkingMemory':
      return 'working.session_note';
    default:
      return 'custom.general';
  }
}

export function defaultMemoryScope(memoryType: MemoryType, missionId: string | null): MemoryScope {
  switch (memoryType) {
    case 'Persona':
    case 'Preferences':
      return 'owner';
    case 'Procedures':
      return 'cross_mission';
    case 'DomainMemory':
      return 'domain';
    case 'RepoMemory':
      return 'workspace';
    case 'MissionMemory':
    case 'FailureMemory':
      return missionId ? 'mission' : 'cross_mission';
    case 'WorkingMemory':
      return 'session';
    default:
      return 'cross_mission';
  }
}

export function defaultMemoryLayer(memoryType: MemoryType): MemoryLayer {
  switch (memoryType) {
    case 'Persona':
    case 'Preferences':
      return 'principle';
    case 'Procedures':
    case 'DomainMemory':
    case 'RepoMemory':
      return 'pattern';
    case 'MissionMemory':
    case 'FailureMemory':
      return 'retro';
    case 'WorkingMemory':
      return 'working';
    default:
      return 'working';
  }
}

function slugTokenize(values: string[]): string[] {
  return values
    .flatMap((value) => tokenize(value))
    .filter(Boolean);
}

export function deriveEntityKeys(input: {
  title: string;
  content: string;
  tags?: string[];
  memorySubtype: string;
}): string[] {
  const keys = new Set<string>();
  const tokens = slugTokenize([input.title, ...(input.tags ?? [])])
    .filter((token) => token.length >= 3 && !GENERIC_ENTITY_TOKENS.has(token))
    .slice(0, 8);
  for (const token of tokens) {
    keys.add(token);
  }

  if (input.memorySubtype === 'persona.identity') {
    keys.add('owner_name');
    keys.add('owner_identity');
  }
  if (input.memorySubtype === 'persona.investor_style') {
    keys.add('owner_investor_style');
  }
  if (input.memorySubtype === 'preference.report_format') {
    keys.add('preferred_report_format');
  }
  if (input.memorySubtype === 'procedure.verification') {
    keys.add('verification_playbook');
  }

  const quoted = [...input.content.matchAll(/"([^"]+)"/g)].map((match) => slugify(match[1] ?? ''));
  for (const item of quoted) {
    if (item) {
      keys.add(item);
    }
  }

  return Array.from(keys).slice(0, 12);
}

export function deriveEntityAliases(input: {
  title: string;
  content: string;
  tags?: string[];
  memorySubtype: string;
}): string[] {
  const aliases = new Set<string>();
  const normalized = `${input.title} ${input.content} ${(input.tags ?? []).join(' ')}`.toLowerCase();
  if (input.memorySubtype === 'persona.identity') {
    aliases.add('my name');
    aliases.add('owner name');
    if (normalized.includes('beam')) {
      aliases.add('บีม');
      aliases.add('beam');
    }
  }
  if (input.memorySubtype === 'persona.investor_style') {
    aliases.add('vi');
    aliases.add('value investor');
    aliases.add('แนวลงทุน');
  }
  if (input.memorySubtype === 'preference.report_format') {
    aliases.add('report format');
    aliases.add('preferred format');
  }
  return Array.from(aliases);
}

export function classifyQueryProfile(query: string, intent: ConsultIntent): QueryProfile {
  const normalized = query.trim().toLowerCase();
  const tokens = tokenize(query);
  const exactIndicators = [
    'my name',
    'owner name',
    'mission id',
    'exact path',
    'exact command',
    'exact ticker',
    'canonical name',
  ];
  const hasThaiOwnerIdentitySignal =
    /(?:\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e0a\u0e37\u0e48\u0e2d\u0e09\u0e31\u0e19|\u0e40\u0e08\u0e49\u0e32\u0e02\u0e2d\u0e07\u0e0a\u0e37\u0e48\u0e2d|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e0a\u0e37\u0e48\u0e2d\u0e09\u0e31\u0e19)/u.test(query);
  const hasThaiInvestorRecallSignal =
    /(?:\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19(?:\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19)?(?:\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e41\u0e1a\u0e1a\u0e44\u0e2b\u0e19)|\u0e2a\u0e44\u0e15\u0e25\u0e4c\u0e25\u0e07\u0e17\u0e38\u0e19(?:\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19)?(?:\u0e04\u0e37\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e41\u0e1a\u0e1a\u0e44\u0e2b\u0e19)|\u0e09\u0e31\u0e19\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a\u0e44\u0e2b\u0e19|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19)/u.test(query);
  const hasPathLikeSignal =
    /[A-Za-z]:\\/.test(query)
    || /(?:^|[\s`'"])(?:\.{0,2}[\\/][^\s]+|[A-Za-z0-9_.-]+[\\/][^\s]+)/.test(query)
    || /\b[\w.-]+\.(ts|tsx|js|jsx|json|md|py|sql|yml|yaml|toml)\b/i.test(query);
  const hasCommandLikeSignal =
    query.includes('`')
    || /\b(bun|npm|pnpm|yarn|git|python|node|powershell|pwsh|cmd)\b/i.test(query);
  const hasTickerLikeSignal = /\b[A-Z]{2,5}\b/.test(query);
  const hasExplicitExactPrompt = /\b(exact|exactly|canonical|precise)\b/i.test(query);

  if (
    exactIndicators.some((indicator) => normalized.includes(indicator))
    || hasExplicitExactPrompt
    || hasPathLikeSignal
    || (hasCommandLikeSignal && tokens.length <= 8)
    || (hasTickerLikeSignal && tokens.length <= 8)
    || hasThaiOwnerIdentitySignal
    || (hasThaiInvestorRecallSignal && intent === 'persona_guidance')
    || intent === 'persona_guidance' && /\bname\b|\bidentity\b|\bwho am i\b/.test(normalized)
  ) {
    return 'blocked_exact';
  }

  if (tokens.length <= 5 || normalized.length <= 36) {
    return 'exact_entity';
  }

  if (tokens.length >= 12 || normalized.length >= 80) {
    return 'semantic_long';
  }

  return 'balanced';
}

export function retrievalWeights(profile: QueryProfile): { lexical: number; policy: number; vector: number } {
  switch (profile) {
    case 'blocked_exact':
      return { lexical: 0.85, policy: 0.15, vector: 0 };
    case 'exact_entity':
      return { lexical: 0.65, policy: 0.25, vector: 0.1 };
    case 'semantic_long':
      return { lexical: 0.2, policy: 0.3, vector: 0.5 };
    default:
      return { lexical: 0.4, policy: 0.3, vector: 0.3 };
  }
}

export function bundleMaxK(profile: RetrievalBundleProfile): number {
  switch (profile) {
    case 'manager_plan':
      return 12;
    case 'manager_verify':
      return 8;
    case 'worker_exec':
      return 6;
    case 'chat_direct':
    default:
      return 5;
  }
}

export function targetLayerBudgets(intent: ConsultIntent): Record<MemoryLayer, number> {
  switch (intent) {
    case 'persona_guidance':
      return { principle: 0.4, pattern: 0.25, learning: 0.15, retro: 0.1, working: 0.1 };
    case 'procedure_lookup':
      return { principle: 0.15, pattern: 0.45, learning: 0.25, retro: 0.1, working: 0.05 };
    case 'recent_mission':
      return { principle: 0.05, pattern: 0.1, learning: 0.2, retro: 0.4, working: 0.25 };
    case 'failure_lesson':
      return { principle: 0.05, pattern: 0.2, learning: 0.3, retro: 0.35, working: 0.1 };
    default:
      return { principle: 0.2, pattern: 0.3, learning: 0.2, retro: 0.2, working: 0.1 };
  }
}

export function domainHalfLifeDays(memory: Pick<MemoryRecord, 'memory_type' | 'memory_subtype' | 'domain'>): number {
  const domain = (memory.domain ?? '').toLowerCase();
  if (domain.includes('trading') || domain.includes('market')) {
    return 30;
  }
  if (memory.memory_type === 'MissionMemory' || memory.memory_type === 'FailureMemory') {
    return 45;
  }
  if (memory.memory_type === 'RepoMemory' || memory.memory_type === 'DomainMemory') {
    return 90;
  }
  if (memory.memory_type === 'Procedures' || memory.memory_type === 'Preferences') {
    return 180;
  }
  return 365;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeStalenessScore(memory: Pick<MemoryRecord, 'updated_at' | 'last_validated_at' | 'success_rate_hint' | 'times_reused' | 'memory_type' | 'memory_subtype' | 'domain'>, now: number): number {
  const reference = memory.last_validated_at ?? memory.updated_at;
  const referenceDays = Math.max(0, (now - reference) / daysToMs(1));
  const effectiveSuccess = clamp(memory.success_rate_hint ?? 0.5, 0, 1);
  const reuseDivisor = Math.max(memory.times_reused, 1);
  return (referenceDays / domainHalfLifeDays(memory)) * (1 - effectiveSuccess) * (1 / reuseDivisor);
}

export function isStaleCandidate(memory: Pick<MemoryRecord, 'valid_until' | 'updated_at' | 'last_validated_at' | 'success_rate_hint' | 'times_reused' | 'memory_type' | 'memory_subtype' | 'domain'>, now: number): boolean {
  if (memory.valid_until != null && memory.valid_until < now) {
    return true;
  }
  return computeStalenessScore(memory, now) >= 1;
}

export function deriveConflictKind(left: Pick<MemoryRecord, 'content' | 'memory_subtype'>, right: Pick<MemoryRecord, 'content' | 'memory_subtype'>): string {
  if (left.memory_subtype === right.memory_subtype) {
    return 'value_conflict';
  }
  return 'subtype_conflict';
}

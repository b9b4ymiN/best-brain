import type {
  ConsultResponse,
  LearnRequest,
  MemoryRecord,
} from '../types.ts';

const THAI_TEXT = /[\u0E00-\u0E7F]/u;

const THAI_NAME_PATTERNS = [
  /(?:\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19\u0e27\u0e48\u0e32|\u0e08\u0e33\u0e44\u0e27\u0e49\u0e27\u0e48\u0e32\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e41\u0e01\u0e49\u0e44\u0e02\u0e43\u0e2b\u0e21\u0e48\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e08\u0e23\u0e34\u0e07\s*\u0e46?\s*\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d)\s+(.+?)(?=$|[,.!?]|\s+(?:\u0e2d\u0e22\u0e32\u0e01\u0e25\u0e07\u0e17\u0e38\u0e19|\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a|\u0e0a\u0e2d\u0e1a|\u0e40\u0e19\u0e49\u0e19|\u0e41\u0e25\u0e30|\u0e04\u0e23\u0e31\u0e1a|\u0e04\u0e48\u0e30|\u0e04\u0e30|\u0e19\u0e30))/u,
] as const;

const ENGLISH_NAME_PATTERNS = [
  /(?:my name is|call me|remember that my name is|actually my name is|correct my name to)\s+(.+?)(?=$|[,.!?]|\s+(?:and|but)\s|\s+(?:i am|i'm|i want|i prefer|i like|invest))/i,
] as const;

const THAI_STYLE_PATTERNS = [
  /(?:\u0e2d\u0e22\u0e32\u0e01\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a|\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a|\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19(?:\u0e04\u0e37\u0e2d)?|\u0e09\u0e31\u0e19\u0e40\u0e1b\u0e47\u0e19\u0e19\u0e31\u0e01\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a)\s+(.+?)(?=$|[,.!?]|\s+(?:\u0e41\u0e25\u0e30|\u0e04\u0e23\u0e31\u0e1a|\u0e04\u0e48\u0e30|\u0e04\u0e30|\u0e19\u0e30))/u,
] as const;

const ENGLISH_STYLE_PATTERNS = [
  /(?:my investing style is|i invest as|i prefer to invest as|i'm a|i am a)\s+(.+?)(?=$|[,.!?]|\s+(?:and|but)\s)/i,
] as const;

const THAI_NAME_QUERY = /(?:\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e0a\u0e37\u0e48\u0e2d\u0e09\u0e31\u0e19|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19\u0e27\u0e48\u0e32\u0e2d\u0e30\u0e44\u0e23|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e0a\u0e37\u0e48\u0e2d\u0e09\u0e31\u0e19)/u;
const ENGLISH_NAME_QUERY = /\b(?:what is my name|who am i|my name)\b/i;
const THAI_STYLE_QUERY = /(?:\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19|\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a\u0e44\u0e2b\u0e19|\u0e2a\u0e44\u0e15\u0e25\u0e4c\u0e25\u0e07\u0e17\u0e38\u0e19)/u;
const ENGLISH_STYLE_QUERY = /\b(?:my investing style|investor style|how do i invest|investment style)\b/i;
const THAI_ABOUT_ME_QUERY = /(?:\u0e04\u0e38\u0e13\u0e08\u0e33\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19|\u0e23\u0e39\u0e49\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19)/u;
const ENGLISH_ABOUT_ME_QUERY = /\b(?:what do you know about me|what have you remembered about me)\b/i;

export interface ChatMemoryFact {
  learnRequest: LearnRequest;
  kind: 'owner_name' | 'investor_style' | 'report_format_preference';
  value: string;
}

export interface ChatMemoryExtraction {
  facts: ChatMemoryFact[];
  clarificationQuestion: string | null;
}

export interface OwnerRecallRequest {
  asksName: boolean;
  asksInvestorStyle: boolean;
  asksAboutMe: boolean;
}

export interface OwnerRecallResult {
  name: string | null;
  investorStyle: string | null;
  consults: ConsultResponse[];
}

export interface ChatAutoLearnRequest {
  kind: 'preference_signal' | 'domain_signal' | 'working_memory';
  learnRequest: LearnRequest;
}

function containsThai(text: string): boolean {
  return THAI_TEXT.test(text);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanCapturedValue(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^["'“”‘’]+/, '')
    .replace(/["'“”‘’]+$/, '')
    .replace(/[.。!?？！]+$/, '')
    .trim();
}

function hasAmbiguousAlternatives(value: string): boolean {
  return /\s+(?:or|\u0e2b\u0e23\u0e37\u0e2d)\s+/iu.test(value);
}

function firstMatch(text: string, patterns: ReadonlyArray<RegExp>): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const captured = cleanCapturedValue(match?.[1] ?? '');
    if (captured) {
      return captured;
    }
  }
  return null;
}

function extractOwnerName(text: string): { value: string | null; ambiguous: boolean } {
  const value = firstMatch(text, containsThai(text) ? THAI_NAME_PATTERNS : ENGLISH_NAME_PATTERNS)
    ?? firstMatch(text, THAI_NAME_PATTERNS)
    ?? firstMatch(text, ENGLISH_NAME_PATTERNS);
  if (!value) {
    return { value: null, ambiguous: false };
  }
  return {
    value,
    ambiguous: hasAmbiguousAlternatives(value),
  };
}

function extractInvestorStyle(text: string): string | null {
  const explicit = firstMatch(text, containsThai(text) ? THAI_STYLE_PATTERNS : ENGLISH_STYLE_PATTERNS)
    ?? firstMatch(text, THAI_STYLE_PATTERNS)
    ?? firstMatch(text, ENGLISH_STYLE_PATTERNS);
  if (explicit) {
    return explicit;
  }

  const parts: string[] = [];
  if (/\bvi\b/i.test(text) || /\bvalue investor\b/i.test(text) || /\u0e27\u0e35\u0e44\u0e2d/u.test(text)) {
    parts.push('VI');
  }
  if (/quality growth/i.test(text)) {
    parts.push('Quality Growth');
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function extractPreferredReportFormat(text: string): string | null {
  const normalized = normalizeWhitespace(text.toLowerCase());
  const thaiShortReport = /(?:ชอบ|อยากได้|ขอ).*(?:รายงาน|สรุป|คำตอบ).*(?:สั้น|กระชับ|ย่อ)/u.test(normalized)
    || /(?:รายงาน|สรุป|คำตอบ).*(?:สั้น|กระชับ|ย่อ)/u.test(normalized);
  const englishShortReport = /\b(?:prefer|like|want)\b.*\b(?:short|brief|concise)\b.*\b(?:report|summary|answer)\b/i.test(normalized)
    || /\b(?:short|brief|concise)\b.*\b(?:report|summary|answer)\b/i.test(normalized);
  if (thaiShortReport || englishShortReport) {
    return 'Short status, proof, next action.';
  }

  const thaiStructuredReport = /(?:รายงาน|สรุป).*(?:เป็นหัวข้อ|เป็นข้อ|เป็นลำดับ|structured)/u.test(normalized);
  const englishStructuredReport = /\b(?:report|summary)\b.*\b(?:bullet|structured|sections?)\b/i.test(normalized);
  if (thaiStructuredReport || englishStructuredReport) {
    return 'Structured sections with objective, result, proof, and next action.';
  }

  return null;
}

function buildEvidenceRef(goal: string) {
  return [{
    type: 'note' as const,
    ref: `chat://memory-update/${Date.now()}`,
    description: `User stated: ${goal}`,
  }];
}

function buildNameAliases(name: string): string[] {
  const aliases = new Set<string>([
    'my name',
    'owner name',
    '\u0e0a\u0e37\u0e48\u0e2d\u0e09\u0e31\u0e19',
    '\u0e40\u0e08\u0e49\u0e32\u0e02\u0e2d\u0e07\u0e0a\u0e37\u0e48\u0e2d',
    '\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19',
  ]);
  const trimmed = cleanCapturedValue(name);
  if (trimmed) {
    aliases.add(trimmed);
    const pieces = trimmed.split(/\s+/).filter(Boolean);
    if (pieces.length > 1) {
      for (const piece of pieces) {
        aliases.add(piece);
      }
    }
  }
  return Array.from(aliases);
}

function buildStyleAliases(style: string): string[] {
  const aliases = new Set<string>([
    'vi',
    'owner investor style',
    'investor style',
    '\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19',
    '\u0e2a\u0e44\u0e15\u0e25\u0e4c\u0e25\u0e07\u0e17\u0e38\u0e19',
    '\u0e27\u0e35\u0e44\u0e2d',
  ]);
  const trimmed = cleanCapturedValue(style);
  if (trimmed) {
    aliases.add(trimmed);
  }
  if (/quality growth/i.test(trimmed)) {
    aliases.add('quality growth');
  }
  return Array.from(aliases);
}

function buildFormatAliases(format: string): string[] {
  const aliases = new Set<string>([
    'preferred report format',
    'report format',
    'preferred format',
    'รูปแบบรายงาน',
    'รูปแบบสรุป',
  ]);
  const trimmed = cleanCapturedValue(format);
  if (trimmed) {
    aliases.add(trimmed);
  }
  if (/short|concise|brief/i.test(trimmed)) {
    aliases.add('short report');
    aliases.add('concise report');
  }
  return Array.from(aliases);
}

function looksLikeGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized.length <= 24
    && (
      /^(hi|hello|hey|yo|thanks|thank you|ok|okay)$/.test(normalized)
      || /^(สวัสดี|หวัดดี|ขอบคุณ|โอเค|ครับ|ค่ะ|คับ)$/u.test(normalized)
    );
}

function shouldCaptureWorkingContext(text: string, chatMode: string | null | undefined): boolean {
  if (chatMode === 'chat_memory_update') {
    return false;
  }

  const normalized = normalizeWhitespace(text);
  if (!normalized || looksLikeGreeting(normalized) || normalized.length < 24) {
    return false;
  }

  if (/[?？]$/.test(normalized)) {
    return false;
  }

  return /\b(currently|focus|focused|working on|deadline|phase|this week|next action|context)\b/i.test(normalized)
    || /(?:ตอนนี้|กำลัง|โฟกัส|เป้าหมาย|สัปดาห์นี้|เดดไลน์|งานที่ทำอยู่|บริบท)/u.test(normalized);
}

function detectDomainSignal(text: string): string | null {
  const normalized = text.toLowerCase();
  if (/\b(stock|equit(y|ies)|vi|quality growth|value investor|trading)\b/i.test(normalized)
    || /(?:หุ้น|ลงทุน|วีไอ|ตลาดหุ้น|quality growth)/u.test(text)) {
    return 'investing';
  }
  if (/\b(repo|code|typescript|bun|test|ci|mcp|manager)\b/i.test(normalized)
    || /(?:โค้ด|รีโป|ทดสอบ|เอ็มซีพี|แมเนเจอร์)/u.test(text)) {
    return 'best-brain';
  }
  return null;
}

function hasQuestionMark(text: string): boolean {
  return /[?？]/u.test(text);
}

function buildWorkingMemoryAliases(text: string): string[] {
  const aliases = new Set<string>([
    'recent chat context',
    'conversation context',
    'working context',
  ]);
  const tokens = normalizeWhitespace(text)
    .split(/\s+/)
    .map((token) => cleanCapturedValue(token.toLowerCase()))
    .filter((token) => token.length >= 4)
    .slice(0, 6);
  for (const token of tokens) {
    aliases.add(token);
  }
  return Array.from(aliases);
}

export function extractChatMemoryFacts(goal: string): ChatMemoryExtraction {
  const facts: ChatMemoryFact[] = [];
  const ownerName = extractOwnerName(goal);
  if (ownerName.ambiguous) {
    return {
      facts: [],
      clarificationQuestion: containsThai(goal)
        ? 'ขอชื่อที่ต้องการให้จำแบบชัดเจนอีกครั้งได้ไหม'
        : 'Please restate the exact name you want me to remember.',
    };
  }

  if (ownerName.value) {
    facts.push({
      kind: 'owner_name',
      value: ownerName.value,
      learnRequest: {
        mode: 'persona',
        title: 'Owner name',
        content: `Owner name: ${ownerName.value}`,
        source: 'chat://mcp-memory-write',
        verified_by: 'user',
        confirmed_by_user: true,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: true,
        memory_scope: 'owner',
        memory_layer: 'principle',
        memory_subtype: 'persona.identity',
        entity_keys: ['owner_name', 'owner_identity'],
        entity_aliases: buildNameAliases(ownerName.value),
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  const investorStyle = extractInvestorStyle(goal);
  if (investorStyle) {
    facts.push({
      kind: 'investor_style',
      value: investorStyle,
      learnRequest: {
        mode: 'persona',
        title: 'Owner investor style',
        content: `Owner investor style: ${investorStyle}`,
        source: 'chat://mcp-memory-write',
        verified_by: 'user',
        confirmed_by_user: true,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: true,
        memory_scope: 'owner',
        memory_layer: 'principle',
        memory_subtype: 'persona.investor_style',
        entity_keys: ['owner_investor_style'],
        entity_aliases: buildStyleAliases(investorStyle),
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  const preferredFormat = extractPreferredReportFormat(goal);
  if (preferredFormat) {
    facts.push({
      kind: 'report_format_preference',
      value: preferredFormat,
      learnRequest: {
        mode: 'preference',
        title: 'Preferred report format',
        content: `Preferred report format: ${preferredFormat}`,
        source: 'chat://mcp-memory-write',
        verified_by: 'user',
        confirmed_by_user: true,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: true,
        memory_scope: 'owner',
        memory_layer: 'principle',
        memory_subtype: 'preference.report_format',
        entity_keys: ['preferred_report_format'],
        entity_aliases: buildFormatAliases(preferredFormat),
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  return {
    facts,
    clarificationQuestion: null,
  };
}

export function classifyOwnerRecall(goal: string): OwnerRecallRequest {
  const asksName = THAI_NAME_QUERY.test(goal) || ENGLISH_NAME_QUERY.test(goal);
  const asksInvestorStyle = THAI_STYLE_QUERY.test(goal) || ENGLISH_STYLE_QUERY.test(goal);
  const asksAboutMe = THAI_ABOUT_ME_QUERY.test(goal) || ENGLISH_ABOUT_ME_QUERY.test(goal);
  return {
    asksName: asksName || asksAboutMe,
    asksInvestorStyle: asksInvestorStyle || asksAboutMe,
    asksAboutMe,
  };
}

function memoryPriority(memory: MemoryRecord, subtype: string): number {
  let score = 0;
  if (memory.memory_subtype === subtype) {
    score += 100;
  }
  if (memory.source.startsWith('chat://')) {
    score += 30;
  }
  if (memory.written_by === 'chat' || memory.written_by === 'user') {
    score += 20;
  }
  if (memory.verified_by === 'user') {
    score += 15;
  }
  if (memory.memory_layer === 'principle') {
    score += 10;
  }
  score += Math.floor(memory.updated_at / 100000);
  return score;
}

function pickBestMemory(response: ConsultResponse, subtype: string): MemoryRecord | null {
  const matches = response.selected_memories
    .filter((memory) => memory.memory_subtype === subtype && memory.status === 'active')
    .sort((left, right) => memoryPriority(right, subtype) - memoryPriority(left, subtype));
  return matches[0] ?? null;
}

function extractValueFromMemory(memory: MemoryRecord | null, kind: 'owner_name' | 'investor_style'): string | null {
  if (!memory) {
    return null;
  }

  if (kind === 'owner_name') {
    const match = memory.content.match(/Owner name:\s*(.+)$/i)
      ?? memory.content.match(/Owner(?:'s)? name(?: is)?\s*:?\s*(.+)$/i);
    if (match?.[1]) {
      return cleanCapturedValue(match[1]);
    }
    const shortContent = cleanCapturedValue(memory.content);
    if (memory.source.startsWith('chat://') && shortContent.length <= 80) {
      return shortContent;
    }
    return null;
  }

  const match = memory.content.match(/Owner investor style:\s*(.+)$/i)
    ?? memory.content.match(/Owner(?:'s)? investing style(?: is)?\s*:?\s*(.+)$/i);
  if (match?.[1]) {
    return cleanCapturedValue(match[1]);
  }
  const shortContent = cleanCapturedValue(memory.content);
  if (memory.source.startsWith('chat://') && shortContent.length <= 120) {
    return shortContent;
  }
  return null;
}

export function buildOwnerRecallAnswer(goal: string, facts: { name: string | null; investorStyle: string | null }): string | null {
  const thai = containsThai(goal);
  const recall = classifyOwnerRecall(goal);
  if (!recall.asksName && !recall.asksInvestorStyle && !recall.asksAboutMe) {
    return null;
  }

  if (thai) {
    if (recall.asksName && recall.asksInvestorStyle) {
      if (facts.name && facts.investorStyle) {
        return `คุณชื่อ ${facts.name} และแนวลงทุนของคุณคือ ${facts.investorStyle}`;
      }
      if (facts.name && !facts.investorStyle) {
        return `คุณชื่อ ${facts.name} แต่ฉันยังไม่มีข้อมูลแนวลงทุนของคุณ`;
      }
      if (!facts.name && facts.investorStyle) {
        return `ฉันยังไม่ทราบชื่อของคุณ แต่แนวลงทุนที่ฉันจำไว้คือ ${facts.investorStyle}`;
      }
      return 'ตอนนี้ฉันยังไม่ทราบชื่อของคุณและยังไม่มีข้อมูลแนวลงทุนของคุณ';
    }

    if (recall.asksName) {
      return facts.name
        ? `คุณชื่อ ${facts.name}`
        : 'ตอนนี้ฉันยังไม่ทราบชื่อของคุณ';
    }

    if (recall.asksInvestorStyle) {
      return facts.investorStyle
        ? `แนวลงทุนของคุณคือ ${facts.investorStyle}`
        : 'ตอนนี้ฉันยังไม่มีข้อมูลแนวลงทุนของคุณ';
    }
  }

  if (recall.asksName && recall.asksInvestorStyle) {
    if (facts.name && facts.investorStyle) {
      return `Your name is ${facts.name} and your investing style is ${facts.investorStyle}.`;
    }
    if (facts.name && !facts.investorStyle) {
      return `Your name is ${facts.name}, but I do not have your investing style yet.`;
    }
    if (!facts.name && facts.investorStyle) {
      return `I do not know your name yet, but your investing style is ${facts.investorStyle}.`;
    }
    return 'I do not know your name yet and I do not have your investing style yet.';
  }

  if (recall.asksName) {
    return facts.name
      ? `Your name is ${facts.name}.`
      : 'I do not know your name yet.';
  }

  if (recall.asksInvestorStyle) {
    return facts.investorStyle
      ? `Your investing style is ${facts.investorStyle}.`
      : 'I do not have your investing style yet.';
  }

  return null;
}

export function buildMemoryUpdateAnswer(goal: string, facts: { name: string | null; investorStyle: string | null; preferredFormat?: string | null }): string {
  const hasName = Boolean(facts.name);
  const hasStyle = Boolean(facts.investorStyle);
  const hasFormat = Boolean(facts.preferredFormat);

  if (containsThai(goal)) {
    if (facts.name && facts.investorStyle) {
      return `รับทราบแล้ว ฉันจะจำว่าคุณชื่อ ${facts.name} และแนวลงทุนของคุณคือ ${facts.investorStyle}`;
    }
    if (facts.name) {
      return `รับทราบแล้ว ฉันจะจำว่าคุณชื่อ ${facts.name}`;
    }
    if (facts.investorStyle) {
      return `รับทราบแล้ว ฉันจะจำว่าแนวลงทุนของคุณคือ ${facts.investorStyle}`;
    }
    return 'ฉันยังไม่แน่ใจว่าควรจำข้อมูลส่วนไหน ช่วยระบุให้ชัดอีกนิดได้ไหม';
  }

  if (hasName && hasStyle && hasFormat) {
    return `Saved. Your name is ${facts.name}, your investing style is ${facts.investorStyle}, and your preferred report format is ${facts.preferredFormat}.`;
  }
  if (hasName && hasStyle) {
    return `Saved. Your name is ${facts.name} and your investing style is ${facts.investorStyle}.`;
  }
  if (hasName && hasFormat) {
    return `Saved. Your name is ${facts.name}. I will use this report format: ${facts.preferredFormat}.`;
  }
  if (hasStyle && hasFormat) {
    return `Saved. Your investing style is ${facts.investorStyle}. I will use this report format: ${facts.preferredFormat}.`;
  }
  if (hasName) {
    return `Saved. Your name is ${facts.name}.`;
  }
  if (hasStyle) {
    return `Saved. Your investing style is ${facts.investorStyle}.`;
  }
  if (hasFormat) {
    return `Saved. Your preferred report format is ${facts.preferredFormat}.`;
  }
  return 'I am not sure which durable fact to save yet. Please restate it more clearly.';
}

export function shouldPreferLocalMemoryUpdate(goal: string, chatMode: string | null | undefined): boolean {
  return chatMode === 'chat_memory_update';
}

export function shouldAttemptDirectOwnerRecall(goal: string): boolean {
  const recall = classifyOwnerRecall(goal);
  return recall.asksName || recall.asksInvestorStyle || recall.asksAboutMe;
}

export function summarizeOwnerRecall(consults: ConsultResponse[]): OwnerRecallResult {
  const nameConsult = consults.find((response) => response.query_profile === 'blocked_exact');
  const investorConsult = consults.find((response) => response.memory_ids.some(Boolean) && response !== nameConsult)
    ?? consults[1]
    ?? null;
  const nameMemory = nameConsult ? pickBestMemory(nameConsult, 'persona.identity') : null;
  const styleMemory = investorConsult ? pickBestMemory(investorConsult, 'persona.investor_style') : null;
  return {
    name: extractValueFromMemory(nameMemory, 'owner_name'),
    investorStyle: extractValueFromMemory(styleMemory, 'investor_style'),
    consults,
  };
}

export function extractChatAutoLearnRequests(goal: string, chatMode: string | null | undefined): ChatAutoLearnRequest[] {
  if (chatMode === 'chat_memory_update') {
    return [];
  }

  const requests: ChatAutoLearnRequest[] = [];
  const preferredFormat = extractPreferredReportFormat(goal);
  if (preferredFormat) {
    requests.push({
      kind: 'preference_signal',
      learnRequest: {
        mode: 'preference',
        title: 'Preferred report format',
        content: `Preferred report format: ${preferredFormat}`,
        source: 'chat://mcp-memory-write',
        verified_by: 'user',
        confirmed_by_user: true,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: true,
        memory_scope: 'owner',
        memory_layer: 'principle',
        memory_subtype: 'preference.report_format',
        entity_keys: ['preferred_report_format'],
        entity_aliases: buildFormatAliases(preferredFormat),
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  const domainSignal = detectDomainSignal(goal);
  if (domainSignal && !hasQuestionMark(goal)) {
    requests.push({
      kind: 'domain_signal',
      learnRequest: {
        mode: 'working_memory',
        title: `Current domain focus (${domainSignal})`,
        content: `Current conversation domain focus: ${domainSignal}. User message: ${normalizeWhitespace(goal)}`,
        source: 'chat://auto-learn',
        verified_by: 'system_inference',
        confirmed_by_user: false,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: false,
        memory_scope: 'session',
        memory_layer: 'working',
        memory_subtype: 'working.domain_signal',
        entity_keys: ['chat_domain_signal'],
        entity_aliases: [domainSignal],
        tags: ['chat', 'auto-learn', 'domain-signal', domainSignal],
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  if (shouldCaptureWorkingContext(goal, chatMode)) {
    requests.push({
      kind: 'working_memory',
      learnRequest: {
        mode: 'working_memory',
        title: 'Recent chat working context',
        content: `Recent chat context: ${normalizeWhitespace(goal)}`,
        source: 'chat://auto-learn',
        verified_by: 'system_inference',
        confirmed_by_user: false,
        written_by: 'chat',
        owner_scope: 'private',
        reusable: false,
        memory_scope: 'session',
        memory_layer: 'working',
        memory_subtype: 'working.chat_context',
        entity_keys: ['chat_working_context'],
        entity_aliases: buildWorkingMemoryAliases(goal),
        tags: ['chat', 'auto-learn', 'working-context'],
        evidence_ref: buildEvidenceRef(goal),
      },
    });
  }

  return requests;
}

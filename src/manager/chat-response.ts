import type { ConsultResponse, MissionContextBundle } from '../types.ts';

const THAI_TEXT = /[\u0E00-\u0E7F]/;
const WEEKDAY_ONLY_HINTS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
  'วันอาทิตย์',
];

function containsThai(text: string): boolean {
  return THAI_TEXT.test(text);
}

function includesAnyText(haystack: string, hints: string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

function stripConsultPreamble(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed.startsWith('Consult intent:')) {
    return trimmed;
  }

  const [, ...rest] = trimmed.split(/\r?\n/);
  const normalized = rest.join('\n').trim();
  return normalized || trimmed;
}

function looksLikeMemoryList(answer: string): boolean {
  const lines = stripConsultPreamble(answer)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => line.startsWith('- ['));
}

function buildClarifyingChatResponse(goal: string): string {
  if (containsThai(goal)) {
    return 'ช่วยพิมพ์คำถามให้ครบอีกนิด เช่น “หมายถึงอะไร” หรือ “ให้ช่วยอะไรเกี่ยวกับเรื่องนี้”';
  }

  return 'Please make the question a bit more specific, for example "what do you mean?" or "what would you like me to help with about this?".';
}

export function buildChatOwnerResponse(
  goal: string,
  consult: ConsultResponse,
  context: MissionContextBundle,
): string {
  const normalizedGoal = goal.trim().toLowerCase();
  const consultAnswer = stripConsultPreamble(consult.answer);

  if (includesAnyText(normalizedGoal, WEEKDAY_ONLY_HINTS)) {
    return buildClarifyingChatResponse(goal);
  }

  if (consultAnswer && !looksLikeMemoryList(consultAnswer)) {
    return consultAnswer;
  }

  if (consultAnswer && looksLikeMemoryList(consultAnswer)) {
    return buildClarifyingChatResponse(goal);
  }

  const planningHint = context.planning_hints[0];
  if (containsThai(goal)) {
    return planningHint
      ? `ตอนนี้ local AI responder ยังไม่ให้คำตอบที่ใช้ได้ ควรเริ่มจาก: ${planningHint}`
      : 'ตอนนี้ local AI responder ยังไม่ให้คำตอบที่ใช้ได้ ลองถามให้ชัดขึ้นอีกนิด';
  }

  return planningHint
    ? `The local AI responder did not return a usable answer yet. Start with: ${planningHint}`
    : 'The local AI responder did not return a usable answer yet. Please ask a more specific question.';
}

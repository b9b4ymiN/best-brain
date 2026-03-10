import type { ConsultResponse, MissionContextBundle } from '../types.ts';

const THAI_TEXT = /[\u0E00-\u0E7F]/;

function containsThai(text: string): boolean {
  return THAI_TEXT.test(text);
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
  const consultAnswer = stripConsultPreamble(consult.answer);

  if (consultAnswer && !looksLikeMemoryList(consultAnswer)) {
    return consultAnswer;
  }

  if (consultAnswer && looksLikeMemoryList(consultAnswer)) {
    return buildClarifyingChatResponse(goal);
  }

  const planningHint = context.planning_hints[0];
  if (containsThai(goal)) {
    return planningHint
      ? `ตอนนี้ยังสรุปคำตอบที่ใช้ได้ไม่พอ ควรเริ่มจาก: ${planningHint}`
      : 'ตอนนี้ยังสรุปคำตอบที่ใช้ได้ไม่พอ ลองถามให้ชัดขึ้นอีกนิด';
  }

  return planningHint
    ? `I do not have a usable answer yet. Start with: ${planningHint}`
    : 'I do not have a usable answer yet. Please ask a more specific question.';
}

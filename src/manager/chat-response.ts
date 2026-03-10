import type { ConsultResponse, MissionContextBundle } from '../types.ts';

const THAI_TEXT = /[\u0E00-\u0E7F]/;
const DAY_QUESTION_HINTS = [
  'what day is today',
  'what day is it',
  'what date is today',
  'what date is it',
  'today date',
  'today day',
  '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23',
  '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e40\u0e17\u0e48\u0e32\u0e44\u0e23',
  '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e2d\u0e30\u0e44\u0e23',
  '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e44\u0e2b\u0e19',
  '\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49',
];
const TIME_QUESTION_HINTS = [
  'what time is it',
  'what time now',
  'current time',
  'time now',
  '\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e01\u0e35\u0e48\u0e42\u0e21\u0e07',
  '\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e27\u0e25\u0e32\u0e2d\u0e30\u0e44\u0e23',
  '\u0e40\u0e27\u0e25\u0e32\u0e19\u0e35\u0e49\u0e01\u0e35\u0e48\u0e42\u0e21\u0e07',
];
const WEEKDAY_ONLY_HINTS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  '\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c',
  '\u0e27\u0e31\u0e19\u0e2d\u0e31\u0e07\u0e04\u0e32\u0e23',
  '\u0e27\u0e31\u0e19\u0e1e\u0e38\u0e18',
  '\u0e27\u0e31\u0e19\u0e1e\u0e24\u0e2b\u0e31\u0e2a\u0e1a\u0e14\u0e35',
  '\u0e27\u0e31\u0e19\u0e28\u0e38\u0e01\u0e23\u0e4c',
  '\u0e27\u0e31\u0e19\u0e40\u0e2a\u0e32\u0e23\u0e4c',
  '\u0e27\u0e31\u0e19\u0e2d\u0e32\u0e17\u0e34\u0e15\u0e22\u0e4c',
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
    return '\u0e0a\u0e48\u0e27\u0e22\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e04\u0e23\u0e1a\u0e2d\u0e35\u0e01\u0e19\u0e34\u0e14 \u0e40\u0e0a\u0e48\u0e19 \u201c\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23\u201d \u0e2b\u0e23\u0e37\u0e2d \u201c\u0e43\u0e2b\u0e49\u0e0a\u0e48\u0e27\u0e22\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u201d';
  }

  return 'Please make the question a bit more specific, for example “what day is today?” or “what would you like me to help with about this?”.';
}

function formatDateAnswer(goal: string, now: Date): string {
  const thai = containsThai(goal);
  const timeZone = 'Asia/Bangkok';
  const weekday = new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-US', {
    weekday: 'long',
    timeZone,
  }).format(now);
  const fullDate = new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(now);

  return thai
    ? `\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e04\u0e37\u0e2d ${weekday} ${fullDate}`
    : `Today is ${weekday}, ${fullDate}.`;
}

function formatTimeAnswer(goal: string, now: Date): string {
  const thai = containsThai(goal);
  const timeZone = 'Asia/Bangkok';
  const time = new Intl.DateTimeFormat(thai ? 'th-TH' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(now);

  return thai
    ? `\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e27\u0e25\u0e32 ${time} \u0e19.`
    : `The current time is ${time}.`;
}

export function buildChatOwnerResponse(
  goal: string,
  consult: ConsultResponse,
  context: MissionContextBundle,
  now: Date = new Date(),
): string {
  const normalizedGoal = goal.trim().toLowerCase();

  if (includesAnyText(normalizedGoal, DAY_QUESTION_HINTS)) {
    return formatDateAnswer(goal, now);
  }

  if (includesAnyText(normalizedGoal, TIME_QUESTION_HINTS)) {
    return formatTimeAnswer(goal, now);
  }

  const consultAnswer = stripConsultPreamble(consult.answer);
  if (includesAnyText(normalizedGoal, WEEKDAY_ONLY_HINTS)) {
    return buildClarifyingChatResponse(goal);
  }

  if (consultAnswer && !looksLikeMemoryList(consultAnswer)) {
    return consultAnswer;
  }

  const planningHint = context.planning_hints[0];
  if (consultAnswer && looksLikeMemoryList(consultAnswer)) {
    return buildClarifyingChatResponse(goal);
  }

  if (containsThai(goal)) {
    return planningHint
      ? `\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e17\u0e35\u0e48 grounded \u0e1e\u0e2d\u0e08\u0e32\u0e01\u0e2a\u0e21\u0e2d\u0e07\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07 \u0e04\u0e27\u0e23\u0e40\u0e23\u0e34\u0e48\u0e21\u0e08\u0e32\u0e01: ${planningHint}`
      : '\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e17\u0e35\u0e48 grounded \u0e1e\u0e2d\u0e08\u0e32\u0e01\u0e2a\u0e21\u0e2d\u0e07\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07 \u0e25\u0e2d\u0e07\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e40\u0e08\u0e32\u0e30\u0e08\u0e07\u0e02\u0e36\u0e49\u0e19\u0e2d\u0e35\u0e01\u0e19\u0e34\u0e14';
  }

  return planningHint
    ? `I do not have a grounded direct answer yet. Start with: ${planningHint}`
    : 'I do not have a grounded direct answer yet. Please ask a more specific question.';
}

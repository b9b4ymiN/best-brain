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
  if (consultAnswer) {
    return consultAnswer;
  }

  const planningHint = context.planning_hints[0];
  if (containsThai(goal)) {
    return planningHint
      ? `\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e17\u0e35\u0e48 grounded \u0e1e\u0e2d\u0e08\u0e32\u0e01\u0e2a\u0e21\u0e2d\u0e07\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07 \u0e04\u0e27\u0e23\u0e40\u0e23\u0e34\u0e48\u0e21\u0e08\u0e32\u0e01: ${planningHint}`
      : '\u0e15\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e17\u0e35\u0e48 grounded \u0e1e\u0e2d\u0e08\u0e32\u0e01\u0e2a\u0e21\u0e2d\u0e07\u0e42\u0e14\u0e22\u0e15\u0e23\u0e07 \u0e25\u0e2d\u0e07\u0e16\u0e32\u0e21\u0e43\u0e2b\u0e49\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e40\u0e08\u0e32\u0e30\u0e08\u0e07\u0e02\u0e36\u0e49\u0e19\u0e2d\u0e35\u0e01\u0e19\u0e34\u0e14';
  }

  return planningHint
    ? `I do not have a grounded direct answer yet. Start with: ${planningHint}`
    : 'I do not have a grounded direct answer yet. Please ask a more specific question.';
}

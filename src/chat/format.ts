function stripFence(value: string): string {
  return value
    .replace(/^```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

const FALLBACK_ANSWER = 'No displayable answer was produced. Try sending the message again.';

const SUMMARY_FIELD_LABELS = {
  objective: 'Objective',
  result_summary: 'Result',
  evidence_summary: 'Evidence',
  checks_summary: 'Checks',
  blocked_or_rejected_reason: 'Blocked/rejected',
  remaining_risks: 'Risks',
  next_action: 'Next action',
} as const;

type SummaryFieldKey = keyof typeof SUMMARY_FIELD_LABELS;

const SUMMARY_FIELD_ORDER: SummaryFieldKey[] = [
  'objective',
  'result_summary',
  'evidence_summary',
  'checks_summary',
  'blocked_or_rejected_reason',
  'remaining_risks',
  'next_action',
];

function extractFromJsonLines(value: string): string | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let latestText: string | null = null;

  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as {
        type?: string;
        result?: string;
        message?: { content?: Array<{ type?: string; text?: string }> };
        msg?: { type?: string; message?: string };
      };

      if (payload.type === 'result' && typeof payload.result === 'string' && payload.result.trim()) {
        latestText = payload.result.trim();
      }

      if (Array.isArray(payload.message?.content)) {
        const text = payload.message.content
          .filter((entry) => entry.type === 'text' && typeof entry.text === 'string')
          .map((entry) => entry.text ?? '')
          .join('')
          .trim();
        if (text) {
          latestText = text;
        }
      }

      if (payload.msg?.type === 'agent_message' && typeof payload.msg.message === 'string' && payload.msg.message.trim()) {
        latestText = payload.msg.message.trim();
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return latestText;
}

function extractSummaryFromJsonObject(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const payload = JSON.parse(trimmed) as { summary?: unknown };
    return typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim()
      : null;
  } catch {
    return null;
  }
}

function looksLikeInternalEventLog(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{"type":"system"')
    || trimmed.includes('"subtype":"init"')
    || trimmed.includes('"type":"assistant"')
    || trimmed.includes('"type":"result"')
    || trimmed.includes('"msg":{"type":"agent_message"');
}

function normalizeStatusPrefix(value: string): string | null {
  if (/^verification failed$/i.test(value)) {
    return 'verification_failed';
  }
  if (/^verification rejected$/i.test(value)) {
    return 'rejected';
  }
  if (/^mission blocked$/i.test(value)) {
    return 'blocked';
  }
  return null;
}

function parseMissionSummary(value: string): {
  status: string | null;
  worker: string | null;
  fields: Map<SummaryFieldKey, string>;
} | null {
  let remaining = value.trim();
  let status: string | null = null;
  let worker: string | null = null;

  const statusMatch = remaining.match(/^(Verification (?:failed|rejected)|Mission blocked)\.\s*/i);
  if (statusMatch) {
    status = normalizeStatusPrefix(statusMatch[1]) ?? null;
    remaining = remaining.slice(statusMatch[0].length).trim();
  }

  const workerMatch = remaining.match(/^\[([a-z0-9_-]+)\]\s*/i);
  if (workerMatch) {
    worker = workerMatch[1].toLowerCase();
    remaining = remaining.slice(workerMatch[0].length).trim();
  }

  const fields = new Map<SummaryFieldKey, string>();
  const segments = remaining
    .split(/\s+\|\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const fieldMatch = segment.match(/^([a-z_]+)\s*:\s*(.+)$/i);
    if (!fieldMatch) {
      continue;
    }

    const key = fieldMatch[1].toLowerCase() as SummaryFieldKey;
    if (!(key in SUMMARY_FIELD_LABELS)) {
      continue;
    }

    const rawValue = fieldMatch[2].trim();
    if (rawValue) {
      fields.set(key, rawValue);
    }
  }

  if (fields.size < 3 || (!fields.has('objective') && !fields.has('result_summary'))) {
    return null;
  }

  return {
    status,
    worker,
    fields,
  };
}

function formatMissionSummary(value: string): string {
  const parsed = parseMissionSummary(value);
  if (!parsed) {
    return value;
  }

  const lines: string[] = ['Mission outcome'];
  if (parsed.status) {
    lines.push(`- Status: ${parsed.status}`);
  }
  if (parsed.worker) {
    lines.push(`- Worker: ${parsed.worker}`);
  }

  for (const key of SUMMARY_FIELD_ORDER) {
    const fieldValue = parsed.fields.get(key);
    if (!fieldValue) {
      continue;
    }
    if (key === 'blocked_or_rejected_reason' && /^(none|n\/a|null)$/i.test(fieldValue)) {
      continue;
    }
    lines.push(`- ${SUMMARY_FIELD_LABELS[key]}: ${fieldValue}`);
  }

  return lines.join('\n');
}

export function normalizeChatDisplayAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return FALLBACK_ANSWER;
  }

  const extracted = extractFromJsonLines(trimmed) ?? extractSummaryFromJsonObject(trimmed);
  if (extracted) {
    return formatMissionSummary(stripFence(extracted));
  }

  if (looksLikeInternalEventLog(trimmed)) {
    return FALLBACK_ANSWER;
  }

  return formatMissionSummary(stripFence(trimmed));
}

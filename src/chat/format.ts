function stripFence(value: string): string {
  return value
    .replace(/^```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

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

function looksLikeInternalEventLog(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{"type":"system"')
    || trimmed.includes('"subtype":"init"')
    || trimmed.includes('"type":"assistant"')
    || trimmed.includes('"type":"result"')
    || trimmed.includes('"msg":{"type":"agent_message"');
}

export function normalizeChatDisplayAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return 'ขออภัย ตอนนี้ยังไม่ได้คำตอบที่แสดงผลได้ ลองส่งใหม่อีกครั้ง';
  }

  const extracted = extractFromJsonLines(trimmed);
  if (extracted) {
    return stripFence(extracted);
  }

  if (looksLikeInternalEventLog(trimmed)) {
    return 'ขออภัย ตอนนี้ยังไม่ได้คำตอบที่แสดงผลได้ ลองส่งใหม่อีกครั้ง';
  }

  return stripFence(trimmed);
}

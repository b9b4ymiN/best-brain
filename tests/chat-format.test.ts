import { describe, expect, test } from 'bun:test';
import { normalizeChatDisplayAnswer } from '../src/chat/format.ts';

describe('chat answer formatter', () => {
  test('formats mission summaries into readable lines', () => {
    const input = [
      '[codex] objective: Filter SET50 with ROE > 20',
      'result_summary: Scanned 55 symbols and found 6 passing symbols.',
      'evidence_summary: artifacts/scanner/set50-roe-20.json',
      'checks_summary: json_parse:pass | threshold_check:pass',
      'blocked_or_rejected_reason: none',
      'remaining_risks: yfinance may miss some symbols',
      'next_action: rerun daily',
    ].join(' | ');

    const output = normalizeChatDisplayAnswer(input);
    expect(output).toContain('Mission outcome');
    expect(output).toContain('- Worker: codex');
    expect(output).toContain('- Objective: Filter SET50 with ROE > 20');
    expect(output).toContain('- Result: Scanned 55 symbols and found 6 passing symbols.');
    expect(output).toContain('- Evidence: artifacts/scanner/set50-roe-20.json');
    expect(output).toContain('- Next action: rerun daily');
    expect(output).not.toContain('Blocked/rejected: none');
  });

  test('keeps verification failure status in formatted output', () => {
    const input = 'Verification failed. [claude] objective: Build scanner | result_summary: Worker exited with code 1 | evidence_summary: note://worker-failure | checks_summary: worker-status-success:fail';
    const output = normalizeChatDisplayAnswer(input);
    expect(output).toContain('- Status: verification_failed');
    expect(output).toContain('- Worker: claude');
    expect(output).toContain('- Result: Worker exited with code 1');
  });

  test('returns fallback for internal event logs', () => {
    const input = '{"type":"system","subtype":"init"}\n{"type":"assistant","message":{"content":[{"type":"thinking","text":"hidden"}]}}';
    const output = normalizeChatDisplayAnswer(input);
    expect(output).toBe('No displayable answer was produced. Try sending the message again.');
  });
});

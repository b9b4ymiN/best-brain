import { describe, expect, test } from 'bun:test';
import { runMcpSmoke } from '../src/mcp/smoke.ts';

describe('mcp transport', () => {
  test('lists tools, returns consult payloads, keeps learn rejections non-fatal, and completes verification', async () => {
    const result = await runMcpSmoke({
      cwd: process.cwd(),
      debug: true,
    });

    expect(result.tools).toEqual([
      'brain_consult',
      'brain_learn',
      'brain_context',
      'brain_save_outcome',
      'brain_save_failure',
      'brain_verify',
    ]);
    expect(result.consult.policy_path).toBe('deterministic.preference_lookup.v1');
    expect(result.consult.memory_ids.length).toBeGreaterThan(0);
    expect(result.consult.citations.length).toBe(result.consult.memory_ids.length);
    expect(result.learn_reject.accepted).toBe(false);
    expect(result.learn_reject.reason).toContain('confirmed_by_user=true');
    expect(result.verification.start_status).toBe('awaiting_verification');
    expect(result.verification.complete_status).toBe('verified_complete');
    expect(result.stderr_lines.some((line) => line.includes('tool_start'))).toBe(true);
  });
});

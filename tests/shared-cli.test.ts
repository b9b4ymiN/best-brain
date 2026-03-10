import { describe, expect, test } from 'bun:test';
import { detectCodexProviderIssue, extractCodexStreamError, extractCodexStreamMessage, isSpawnCommandMissing, resolveSpawnCommand } from '../src/manager/adapters/shared.ts';

describe('shared CLI adapter helpers', () => {
  test('detects command-not-found spawn errors', () => {
    expect(isSpawnCommandMissing({ code: 'ENOENT' })).toBe(true);
    expect(isSpawnCommandMissing({ code: 'EACCES' })).toBe(false);
    expect(isSpawnCommandMissing(null)).toBe(false);
  });

  test('resolves Windows CLI shims to a spawnable command', () => {
    const resolved = resolveSpawnCommand('claude');

    if (process.platform === 'win32') {
      expect(resolved.command.toLowerCase() === 'powershell.exe' || resolved.command.toLowerCase().endsWith('.cmd') || resolved.command.toLowerCase().endsWith('.exe') || resolved.command.toLowerCase().endsWith('.bat') || resolved.command.toLowerCase().endsWith('\\claude')).toBe(true);
      expect(resolved.displayCommand.toLowerCase()).toContain('claude');
    } else {
      expect(resolved.command).toBe('claude');
      expect(resolved.argsPrefix).toHaveLength(0);
    }
  });

  test('extracts the last Codex agent message from JSONL output', () => {
    const output = [
      '{"provider":"openai"}',
      '{"id":"0","msg":{"type":"agent_message","message":"first"}}',
      '{"id":"0","msg":{"type":"agent_message","message":"{\\"summary\\":\\"done\\",\\"status\\":\\"success\\",\\"artifacts\\":[],\\"proposed_checks\\":[]}"}}',
    ].join('\n');

    expect(extractCodexStreamMessage(output)).toBe('{"summary":"done","status":"success","artifacts":[],"proposed_checks":[]}');
  });

  test('extracts Codex error messages and detects usage-limit provider failures', () => {
    const output = [
      '{"provider":"openai"}',
      '{"id":"0","msg":{"type":"error","message":"You\\u0027ve hit your usage limit. Upgrade to Pro or try again later."}}',
    ].join('\n');

    expect(extractCodexStreamError(output)).toBe("You've hit your usage limit. Upgrade to Pro or try again later.");
    expect(detectCodexProviderIssue(output)?.includes('usage limit')).toBe(true);
  });
});

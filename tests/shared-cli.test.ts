import { describe, expect, test } from 'bun:test';
import { isSpawnCommandMissing, resolveSpawnCommand } from '../src/manager/adapters/shared.ts';

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
});

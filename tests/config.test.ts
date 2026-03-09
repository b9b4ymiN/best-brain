import { describe, expect, test } from 'bun:test';
import { resolveDataDir } from '../src/config.ts';

describe('config paths', () => {
  test('resolves Windows app data directory', () => {
    expect(resolveDataDir('win32', {
      USERPROFILE: 'C:\\Users\\brain',
      APPDATA: 'C:\\Users\\brain\\AppData\\Roaming',
    })).toBe('C:\\Users\\brain\\AppData\\Roaming\\best-brain');
  });

  test('resolves macOS application support directory', () => {
    expect(resolveDataDir('darwin', {
      HOME: '/Users/brain',
    })).toBe('/Users/brain/Library/Application Support/best-brain');
  });

  test('resolves Linux XDG directory', () => {
    expect(resolveDataDir('linux', {
      HOME: '/home/brain',
      XDG_DATA_HOME: '/home/brain/.local/share',
    })).toBe('/home/brain/.local/share/best-brain');
  });
});

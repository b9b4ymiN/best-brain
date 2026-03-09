import path from 'path';
import type { RuntimeConfig } from './types.ts';

export const DEFAULT_PORT = 47888;

export function resolveHomeDirectory(env = process.env): string {
  return env.HOME || env.USERPROFILE || process.cwd();
}

export function resolveDataDir(platform = process.platform, env = process.env): string {
  if (env.BEST_BRAIN_DATA_DIR) {
    return env.BEST_BRAIN_DATA_DIR;
  }

  const home = resolveHomeDirectory(env);
  const join = platform === 'win32' ? path.win32.join : path.posix.join;

  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'best-brain');
  }

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'best-brain');
  }

  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'best-brain');
}

export function resolveDbPath(platform = process.platform, env = process.env): string {
  if (env.BEST_BRAIN_DB_PATH) {
    return env.BEST_BRAIN_DB_PATH;
  }

  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  return join(resolveDataDir(platform, env), 'best-brain.db');
}

export function createRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    appName: 'best-brain',
    owner: overrides.owner || process.env.BEST_BRAIN_OWNER || 'owner',
    dataDir: overrides.dataDir || resolveDataDir(),
    dbPath: overrides.dbPath || resolveDbPath(),
    port: overrides.port || Number(process.env.BEST_BRAIN_PORT || DEFAULT_PORT),
  };
}

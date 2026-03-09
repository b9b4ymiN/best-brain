import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveDataDir, resolveDbPath, DEFAULT_PORT } from '../config.ts';

export interface BootstrapSmokeResult {
  install: {
    attempted: boolean;
    exit_code: number | null;
    duration_ms: number;
  };
  startup: {
    port: number;
    startup_time_ms: number;
    health_attempts: number;
    health_response: {
      status: string;
      db_path: string;
      seeded: boolean;
      onboarded: boolean;
    } | null;
    first_run_db_init_success: boolean;
  };
  runtime: {
    current_platform: NodeJS.Platform;
    cwd: string;
    smoke_data_dir: string;
    smoke_db_path: string;
    default_data_dirs: Record<'win32' | 'darwin' | 'linux', string>;
    default_db_paths: Record<'win32' | 'darwin' | 'linux', string>;
  };
}

function toEnvRecord(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return { ...env, ...overrides };
}

function runCommand(command: string, args: string[], cwd: string, env: Record<string, string>): Promise<{
  exitCode: number | null;
  durationMs: number;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${exitCode}`));
        return;
      }

      resolve({
        exitCode,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<{
  attempts: number;
  payload: BootstrapSmokeResult['startup']['health_response'];
}> {
  const startedAt = Date.now();
  let attempts = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1;
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return {
          attempts,
          payload: await response.json() as BootstrapSmokeResult['startup']['health_response'],
        };
      }
    } catch {
      // Server is still starting.
    }

    await Bun.sleep(250);
  }

  return {
    attempts,
    payload: null,
  };
}

export async function runBootstrapSmoke(options: {
  cwd?: string;
  skipInstall?: boolean;
  timeoutMs?: number;
} = {}): Promise<BootstrapSmokeResult> {
  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 15000;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-bootstrap-'));
  const dbPath = path.join(dataDir, 'best-brain.db');
  const env = toEnvRecord({
    BEST_BRAIN_DATA_DIR: dataDir,
    BEST_BRAIN_DB_PATH: dbPath,
    BEST_BRAIN_OWNER: 'bootstrap-smoke-owner',
    BEST_BRAIN_PORT: String(DEFAULT_PORT),
  });
  const bunExecutable = process.execPath;

  const installResult = options.skipInstall
    ? { attempted: false, exit_code: 0, duration_ms: 0 }
    : await runCommand(bunExecutable, ['install'], cwd, env).then((result) => ({
      attempted: true,
      exit_code: result.exitCode,
      duration_ms: result.durationMs,
    }));

  let server: ChildProcess | null = null;
  try {
    const startedAt = Date.now();
    server = spawn(bunExecutable, ['run', 'server'], {
      cwd,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    server.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const health = await waitForHealth(`http://127.0.0.1:${DEFAULT_PORT}`, timeoutMs);
    if (!health.payload) {
      throw new Error(stderr.trim() || 'bootstrap smoke could not reach /health before timeout');
    }

    return {
      install: installResult,
      startup: {
        port: DEFAULT_PORT,
        startup_time_ms: Date.now() - startedAt,
        health_attempts: health.attempts,
        health_response: health.payload,
        first_run_db_init_success: fs.existsSync(dbPath),
      },
      runtime: {
        current_platform: process.platform,
        cwd,
        smoke_data_dir: dataDir,
        smoke_db_path: dbPath,
        default_data_dirs: {
          win32: resolveDataDir('win32', {
            USERPROFILE: 'C:\\Users\\brain',
            APPDATA: 'C:\\Users\\brain\\AppData\\Roaming',
          }),
          darwin: resolveDataDir('darwin', {
            HOME: '/Users/brain',
          }),
          linux: resolveDataDir('linux', {
            HOME: '/home/brain',
            XDG_DATA_HOME: '/home/brain/.local/share',
          }),
        },
        default_db_paths: {
          win32: resolveDbPath('win32', {
            USERPROFILE: 'C:\\Users\\brain',
            APPDATA: 'C:\\Users\\brain\\AppData\\Roaming',
          }),
          darwin: resolveDbPath('darwin', {
            HOME: '/Users/brain',
          }),
          linux: resolveDbPath('linux', {
            HOME: '/home/brain',
            XDG_DATA_HOME: '/home/brain/.local/share',
          }),
        },
      },
    };
  } finally {
    if (server && !server.killed) {
      server.kill('SIGINT');
    }
    await Bun.sleep(500);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can keep SQLite WAL files open briefly.
    }
  }
}

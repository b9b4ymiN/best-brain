import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { isSpawnCommandMissing, resolveSpawnCommand } from '../manager/adapters/shared.ts';
import { HEALTH_WORKER_KEYS, type HealthWorkerKey } from './health.ts';

export interface WorkerDiagnosticEntry {
  worker: HealthWorkerKey;
  available: boolean;
  execution_mode: 'cli' | 'manager_owned';
  command: string | null;
  args: string[];
  detail: string;
  version: string | null;
  checked_at: number;
  latency_ms: number;
}

export interface WorkerDiagnosticsSnapshot {
  generated_at: number;
  platform: string;
  entries: WorkerDiagnosticEntry[];
}

interface CliProbeResult {
  available: boolean;
  detail: string;
  version: string | null;
  latency_ms: number;
}

type CliWorkerKey = 'claude' | 'codex' | 'shell';

type CliProbe = (worker: CliWorkerKey, command: string, args: string[]) => Promise<CliProbeResult>;

export interface WorkerDiagnosticsServiceOptions {
  now?: () => number;
  cliProbe?: CliProbe;
}

function forceKill(child: ReturnType<typeof spawn>): void {
  if (child.killed || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGKILL');
}

async function defaultCliProbe(_worker: CliWorkerKey, command: string, args: string[]): Promise<CliProbeResult> {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    const resolved = resolveSpawnCommand(command);
    const child = spawn(resolved.command, [...resolved.argsPrefix, ...args], {
      env: process.env as Record<string, string>,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = 5000;

    const finish = (payload: Omit<CliProbeResult, 'latency_ms'>): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        ...payload,
        latency_ms: Date.now() - startedAt,
      });
    };

    const timer = setTimeout(() => {
      forceKill(child);
      finish({
        available: false,
        detail: `${command} probe timed out after ${timeoutMs}ms.`,
        version: null,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (isSpawnCommandMissing(error)) {
        finish({
          available: false,
          detail: `${command} CLI was not found in PATH.`,
          version: null,
        });
        return;
      }
      finish({
        available: false,
        detail: `${command} probe failed: ${error instanceof Error ? error.message : String(error)}`,
        version: null,
      });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const output = [stdout, stderr]
        .join('\n')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null;
      if (exitCode === 0) {
        finish({
          available: true,
          detail: `${command} CLI is executable.`,
          version: output,
        });
        return;
      }
      finish({
        available: false,
        detail: `${command} CLI exited with code ${String(exitCode)}.`,
        version: output,
      });
    });
  });
}

export class WorkerDiagnosticsService {
  private readonly now: () => number;
  private readonly cliProbe: CliProbe;

  constructor(options: WorkerDiagnosticsServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.cliProbe = options.cliProbe ?? defaultCliProbe;
  }

  async collect(): Promise<WorkerDiagnosticsSnapshot> {
    const generatedAt = this.now();
    const entries: WorkerDiagnosticEntry[] = [];

    const cliWorkers: Array<{ worker: CliWorkerKey; command: string; args: string[] }> = [
      { worker: 'claude', command: 'claude', args: ['--version'] },
      { worker: 'codex', command: 'codex', args: ['--version'] },
      { worker: 'shell', command: 'bun', args: ['--version'] },
    ];

    for (const item of cliWorkers) {
      const result = await this.cliProbe(item.worker, item.command, item.args);
      entries.push({
        worker: item.worker,
        available: result.available,
        execution_mode: 'cli',
        command: item.command,
        args: item.args,
        detail: result.detail,
        version: result.version,
        checked_at: generatedAt,
        latency_ms: result.latency_ms,
      });
    }

    const managerOwned: Array<HealthWorkerKey> = HEALTH_WORKER_KEYS.filter(
      (worker): worker is HealthWorkerKey => worker === 'browser' || worker === 'mail' || worker === 'verifier',
    );

    for (const worker of managerOwned) {
      entries.push({
        worker,
        available: true,
        execution_mode: 'manager_owned',
        command: null,
        args: [],
        detail: `${worker} worker is manager-owned and available in local runtime.`,
        version: null,
        checked_at: generatedAt,
        latency_ms: 0,
      });
    }

    return {
      generated_at: generatedAt,
      platform: os.platform(),
      entries,
    };
  }
}

import { spawn } from 'node:child_process';

export interface ProcessRunRequest {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  started_at: number;
  completed_at: number;
}

export class LocalProcessManager {
  async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: request.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timeoutMs = request.timeout_ms ?? 180000;

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);

      const timer = setTimeout(() => {
        timedOut = true;
        stderr += `\nCommand timed out after ${timeoutMs}ms.`;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exit_code: exitCode,
          timed_out: timedOut,
          started_at: startedAt,
          completed_at: Date.now(),
        });
      });
    });
  }
}

import { spawn, type ChildProcess } from 'node:child_process';

export function toEnvRecord(overrides: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return env;
}

export function extractJsonText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, '');
    const withoutFenceEnd = withoutFenceStart.replace(/\s*```$/, '');
    return withoutFenceEnd.trim();
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }

  return trimmed;
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    const timeoutMs = options.timeoutMs ?? 180000;
    const timer = setTimeout(() => {
      stderr += `\nCommand timed out after ${timeoutMs}ms.`;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

export function stopChildProcess(child: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    child.once('close', () => resolve());
    child.kill('SIGINT');
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 1000);
  });
}

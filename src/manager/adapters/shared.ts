import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CliObservableEvent {
  source: 'claude' | 'codex' | 'mcp';
  kind: 'status' | 'tool_call' | 'tool_result' | 'command_start' | 'command_end' | 'result' | 'error';
  title: string;
  detail: string;
  toolName?: string | null;
  serverName?: string | null;
  exitCode?: number | null;
}

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

export function extractClaudeStreamAnswer(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let assistantText: string | null = null;

  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as {
        type?: string;
        result?: string;
        subtype?: string;
        message?: { content?: Array<{ type?: string; text?: string }> };
      };
      if (payload.type === 'result' && typeof payload.result === 'string' && payload.result.trim().length > 0) {
        return payload.result.trim();
      }
      if (payload.type === 'assistant' && Array.isArray(payload.message?.content)) {
        const text = payload.message.content
          .filter((entry) => entry.type === 'text' && typeof entry.text === 'string')
          .map((entry) => entry.text ?? '')
          .join('')
          .trim();
        if (text) {
          assistantText = text;
        }
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return assistantText;
}

export function extractCodexStreamMessage(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastMessage: string | null = null;

  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as { msg?: { type?: string; message?: string } };
      if (payload.msg?.type === 'agent_message' && typeof payload.msg.message === 'string') {
        lastMessage = payload.msg.message.trim();
      }
    } catch {
      // Ignore non-JSON lines from Codex.
    }
  }

  return lastMessage && lastMessage.length > 0 ? lastMessage : null;
}

export function extractCodexStreamError(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastError: string | null = null;

  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as { msg?: { type?: string; message?: string } };
      if (payload.msg?.type === 'error' && typeof payload.msg.message === 'string') {
        lastError = payload.msg.message.trim();
      }
    } catch {
      // Ignore non-JSON lines from Codex.
    }
  }

  return lastError && lastError.length > 0 ? lastError : null;
}

export function detectCodexProviderIssue(output: string): string | null {
  const normalized = output.toLowerCase();
  if (
    normalized.includes("you've hit your usage limit")
    || normalized.includes('you have hit your usage limit')
    || normalized.includes('u0027ve hit your usage limit')
    || normalized.includes('rate limit')
    || normalized.includes('try again in')
  ) {
    return 'Codex provider is temporarily unavailable because the current account hit a usage limit.';
  }

  return null;
}

export function resolveNeutralAICwd(): string {
  const dir = path.join(os.tmpdir(), 'best-brain-ai-neutral');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface ResolvedSpawnCommand {
  command: string;
  argsPrefix: string[];
  displayCommand: string;
}

function windowsCommandCandidates(command: string): string[] {
  if (path.extname(command)) {
    return [command];
  }

  return [
    `${command}.cmd`,
    `${command}.exe`,
    `${command}.bat`,
    `${command}.com`,
    `${command}.ps1`,
    command,
  ];
}

function findCommandOnPath(command: string): string | null {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const candidate of windowsCommandCandidates(command)) {
      const fullPath = path.join(directory, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

export function resolveSpawnCommand(command: string): ResolvedSpawnCommand {
  if (process.platform !== 'win32') {
    return {
      command,
      argsPrefix: [],
      displayCommand: command,
    };
  }

  const found = findCommandOnPath(command);
  if (!found) {
    return {
      command,
      argsPrefix: [],
      displayCommand: command,
    };
  }

  if (found.toLowerCase().endsWith('.ps1')) {
    return {
      command: 'powershell.exe',
      argsPrefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', found],
      displayCommand: path.basename(found),
    };
  }

  return {
    command: found,
    argsPrefix: [],
    displayCommand: path.basename(found),
  };
}

export function isSpawnCommandMissing(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === 'ENOENT';
}

function forceKill(child: ChildProcess): void {
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

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    stdin?: string | Buffer;
    onStdoutLine?: (line: string) => void | Promise<void>;
    onStderrLine?: (line: string) => void | Promise<void>;
  },
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  completedAt: number;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const resolved = resolveSpawnCommand(command);
    const child = spawn(resolved.command, [...resolved.argsPrefix, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const flushBuffer = async (
      bufferValue: string,
      onLine: ((line: string) => void | Promise<void>) | undefined,
      keepRemainder: (value: string) => void,
      flushAll = false,
    ): Promise<void> => {
      let working = bufferValue;
      let newlineIndex = working.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = working.slice(0, newlineIndex).replace(/\r$/, '');
        working = working.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          await onLine?.(line);
        }
        newlineIndex = working.indexOf('\n');
      }
      if (flushAll && working.trim().length > 0) {
        await onLine?.(working.replace(/\r$/, ''));
        working = '';
      }
      keepRemainder(working);
    };

    child.stdout.on('data', async (chunk) => {
      stdout += String(chunk);
      stdoutBuffer += String(chunk);
      await flushBuffer(stdoutBuffer, options.onStdoutLine, (value) => {
        stdoutBuffer = value;
      });
    });
    child.stderr.on('data', async (chunk) => {
      stderr += String(chunk);
      stderrBuffer += String(chunk);
      await flushBuffer(stderrBuffer, options.onStderrLine, (value) => {
        stderrBuffer = value;
      });
    });
    if (typeof options.stdin === 'string' || options.stdin instanceof Buffer) {
      child.stdin.end(typeof options.stdin === 'string' ? Buffer.from(options.stdin, 'utf8') : options.stdin);
    } else {
      child.stdin.end();
    }
    child.on('error', reject);
    const timeoutMs = options.timeoutMs ?? 180000;
    const timer = setTimeout(() => {
      timedOut = true;
      stderr += `\nCommand timed out after ${timeoutMs}ms.`;
      forceKill(child);
    }, timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      void (async () => {
        await flushBuffer(stdoutBuffer, options.onStdoutLine, (value) => {
          stdoutBuffer = value;
        }, true);
        await flushBuffer(stderrBuffer, options.onStderrLine, (value) => {
          stderrBuffer = value;
        }, true);
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
          startedAt,
          completedAt: Date.now(),
        });
      })();
    });
  });
}

export function runClaudeStreamResult(
  prompt: string,
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    disableTools?: boolean;
    maxTurns?: number;
    bypassPermissions?: boolean;
    extraArgs?: string[];
    onEvent?: (event: CliObservableEvent) => void | Promise<void>;
  },
): Promise<{
  result: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: number;
  completedAt: number;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const resolved = resolveSpawnCommand('claude');
    const args = [
      '-p',
      '--verbose',
      '--no-session-persistence',
      '--output-format', 'stream-json',
      '--max-turns', String(options.maxTurns ?? 1),
    ];
    if (options.bypassPermissions === true) {
      args.push(
        '--allow-dangerously-skip-permissions',
        '--dangerously-skip-permissions',
        '--permission-mode', 'bypassPermissions',
      );
    }
    if (options.disableTools === true) {
      args.push('--tools', '');
    }
    if (Array.isArray(options.extraArgs) && options.extraArgs.length > 0) {
      args.push(...options.extraArgs);
    }
    const child = spawn(resolved.command, [...resolved.argsPrefix, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let resultText: string | null = null;
    let buffer = '';
    let settled = false;

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        result: resultText,
        stdout,
        stderr,
        exitCode,
        timedOut,
        startedAt,
        completedAt: Date.now(),
      });
    };

    const tryConsumeLines = (): void => {
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const payload = JSON.parse(line) as {
              type?: string;
              result?: string;
              subtype?: string;
              model?: string;
              mcp_servers?: Array<{ name?: string; status?: string }>;
              error?: string;
              message?: {
                content?: Array<{
                  type?: string;
                  text?: string;
                  name?: string;
                  id?: string;
                  result?: string;
                  content?: string;
                }>;
              };
            };
            if (payload.type === 'system' && payload.subtype === 'init') {
              const connectedServers = Array.isArray(payload.mcp_servers)
                ? payload.mcp_servers
                    .filter((server) => server.status === 'connected' && typeof server.name === 'string')
                    .map((server) => server.name as string)
                : [];
              void options.onEvent?.({
                source: 'claude',
                kind: 'status',
                title: 'Claude session initialized',
                detail: connectedServers.length > 0
                  ? `Connected MCP: ${connectedServers.join(', ')}`
                  : `Model ready${payload.model ? `: ${payload.model}` : ''}.`,
              });
            }
            if (payload.type === 'assistant' && Array.isArray(payload.message?.content)) {
              for (const entry of payload.message.content) {
                if (entry.type === 'tool_use' && typeof entry.name === 'string') {
                  const match = entry.name.match(/^mcp__([^_]+(?:-[^_]+)*)__([^_]+.*)$/);
                  const serverName = match ? match[1] : null;
                  const toolName = match ? match[2] : entry.name;
                  void options.onEvent?.({
                    source: match ? 'mcp' : 'claude',
                    kind: 'tool_call',
                    title: `Calling ${toolName}`,
                    detail: serverName ? `Using ${serverName} MCP` : 'Claude is calling a tool.',
                    toolName,
                    serverName,
                  });
                } else if (entry.type === 'tool_result') {
                  const detail = typeof entry.result === 'string'
                    ? entry.result.trim().slice(0, 180)
                    : typeof entry.content === 'string'
                      ? entry.content.trim().slice(0, 180)
                      : 'Tool call completed.';
                  void options.onEvent?.({
                    source: 'mcp',
                    kind: 'tool_result',
                    title: 'Tool result received',
                    detail: detail || 'Tool call completed.',
                  });
                } else if (entry.type === 'text' && typeof entry.text === 'string') {
                  const text = entry.text.trim();
                  if (text) {
                    void options.onEvent?.({
                      source: 'claude',
                      kind: 'status',
                      title: 'Claude update',
                      detail: text.slice(0, 220),
                    });
                  }
                }
              }
            }
            if (payload.type === 'result' && typeof payload.result === 'string' && payload.result.trim().length > 0) {
              resultText = payload.result.trim();
              void options.onEvent?.({
                source: 'claude',
                kind: 'result',
                title: 'Claude completed',
                detail: resultText.slice(0, 220),
              });
              forceKill(child);
              finish(child.exitCode);
            }
            if (payload.type === 'assistant' && payload.subtype === 'message' && Array.isArray(payload.message?.content)) {
              const text = payload.message.content
                .map((entry) => typeof entry.text === 'string' ? entry.text : '')
                .join('')
                .trim();
              if (text) {
                resultText = text;
              }
            }
            if (payload.type === 'error') {
              void options.onEvent?.({
                source: 'claude',
                kind: 'error',
                title: 'Claude error',
                detail: typeof payload.error === 'string' ? payload.error : 'Claude reported an error.',
              });
            }
          } catch {
            // Ignore non-JSON lines from the CLI stream.
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      buffer += text;
      tryConsumeLines();
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.end(Buffer.from(prompt, 'utf8'));
    child.on('error', (error) => {
      if (!settled) {
        reject(error);
      }
    });
    const timeoutMs = options.timeoutMs ?? 180000;
    const timer = setTimeout(() => {
      timedOut = true;
      stderr += `\nCommand timed out after ${timeoutMs}ms.`;
      forceKill(child);
      if (!resultText) {
        resultText = extractClaudeStreamAnswer(stdout);
      }
      finish(child.exitCode);
    }, timeoutMs);
    child.on('close', (exitCode) => {
      if (buffer.trim().length > 0) {
        tryConsumeLines();
      }
      if (!resultText) {
        resultText = extractClaudeStreamAnswer(stdout);
      }
      finish(exitCode);
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
    if (process.platform === 'win32') {
      forceKill(child);
    } else {
      child.kill('SIGINT');
    }
    setTimeout(() => {
      if (!child.killed) {
        forceKill(child);
      }
      resolve();
    }, 1000);
  });
}

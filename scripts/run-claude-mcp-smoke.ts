import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'node:child_process';

function toEnvRecord(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return { ...env, ...overrides };
}

function runClaudeCommand(args: string[], env: Record<string, string>, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
  });
}

function extractJsonText(value: string): string {
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

const cwd = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-claude-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const debugFile = path.resolve(cwd, 'artifacts/claude-mcp.debug.log');
const mcpConfig = JSON.stringify({
  mcpServers: {
    'best-brain': {
      type: 'stdio',
      command: 'bun',
      args: ['src/mcp/index.ts'],
      env: {
        BEST_BRAIN_DATA_DIR: dataDir,
        BEST_BRAIN_DB_PATH: dbPath,
        BEST_BRAIN_OWNER: 'claude-smoke-owner',
        BEST_BRAIN_MCP_DEBUG: '1',
      },
    },
  },
});
const prompt = [
  'Use the best-brain MCP tool `brain_consult` with the exact query "What report format does the owner prefer?" before you answer.',
  'Return strict JSON with keys `policy_path`, `trace_id`, and `answer_summary`.',
  'Do not invent the trace_id. If tool use fails, return {"policy_path":"TOOL_UNAVAILABLE","trace_id":"","answer_summary":"tool failed"}.',
].join(' ');

try {
  fs.mkdirSync(path.dirname(debugFile), { recursive: true });
  const result = await runClaudeCommand([
    '-p',
    '--output-format', 'json',
    '--strict-mcp-config',
    '--mcp-config', mcpConfig,
    '--allow-dangerously-skip-permissions',
    '--dangerously-skip-permissions',
    '--allowedTools', 'mcp__best-brain__brain_consult',
    '--permission-mode', 'bypassPermissions',
    '--tools', '',
    '--debug-file', debugFile,
    prompt,
  ], toEnvRecord({}), cwd);

  if (result.exitCode !== 0) {
    throw new Error(`Claude smoke exited with code ${result.exitCode}: ${result.stderr.trim()}`);
  }

  const envelope = JSON.parse(result.stdout) as { result: string; is_error: boolean };
  const payload = JSON.parse(extractJsonText(envelope.result)) as {
    policy_path: string;
    trace_id: string;
    answer_summary: string;
  };

  if (payload.policy_path === 'TOOL_UNAVAILABLE') {
    throw new Error(`Claude smoke could not reach MCP tool. See ${debugFile}`);
  }

  if (!payload.policy_path.startsWith('deterministic.') || !payload.trace_id.startsWith('trace_')) {
    throw new Error(`Claude smoke returned unexpected payload: ${JSON.stringify(payload)}`);
  }

  console.log(JSON.stringify({
    payload,
    debug_file: debugFile,
  }, null, 2));
} finally {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Windows can keep SQLite WAL files open briefly.
  }
}

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpSmokeResult {
  tools: string[];
  consult: {
    policy_path: string;
    confidence_band: string;
    trace_id: string;
    memory_ids: string[];
    citations: Array<{
      memory_id: string;
      title: string;
      source: string;
    }>;
  };
  context: {
    preferred_format: string;
    verification_artifacts: Array<{ source_kind: string }>;
  };
  learn_reject: {
    accepted: boolean;
    action: string;
    reason: string;
  };
  verification: {
    start_status: string;
    complete_status: string;
  };
  stderr_lines: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function parseToolText<T>(result: unknown): T {
  const content = isRecord(result) && Array.isArray(result.content)
    ? result.content as Array<{ type?: string; text?: string }>
    : null;
  const text = content?.find((item) => item.type === 'text')?.text;
  if (!text) {
    throw new Error('MCP tool result did not include text content');
  }

  return JSON.parse(text) as T;
}

export async function runMcpSmoke(options: {
  cwd?: string;
  debug?: boolean;
} = {}): Promise<McpSmokeResult> {
  const cwd = options.cwd ?? process.cwd();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-mcp-'));
  const dbPath = path.join(dataDir, 'best-brain.db');
  const stderrLines: string[] = [];

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/mcp/index.ts'],
    cwd,
    env: toEnvRecord({
      BEST_BRAIN_DATA_DIR: dataDir,
      BEST_BRAIN_DB_PATH: dbPath,
      BEST_BRAIN_OWNER: 'mcp-smoke-owner',
      BEST_BRAIN_MCP_DEBUG: options.debug ? '1' : '0',
    }),
    stderr: 'pipe',
  });

  transport.stderr?.on('data', (chunk) => {
    stderrLines.push(String(chunk).trim());
  });

  const client = new Client({ name: 'best-brain-mcp-smoke', version: '0.1.0' });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const consult = parseToolText<{
      policy_path: string;
      confidence_band: string;
      trace_id: string;
      memory_ids: string[];
      citations: Array<{
        memory_id: string;
        title: string;
        source: string;
      }>;
    }>(await client.callTool({
      name: 'brain_consult',
      arguments: { query: 'What report format does the owner prefer?' },
    }));

    const learnReject = parseToolText<{
      accepted: boolean;
      action: string;
      reason: string;
    }>(await client.callTool({
      name: 'brain_learn',
      arguments: {
        mode: 'persona',
        title: 'Unauthorized persona change',
        content: 'This should stay rejected.',
      },
    }));

    await client.callTool({
      name: 'brain_save_outcome',
      arguments: {
        mission_id: 'mcp-smoke-mission',
        objective: 'Smoke the MCP transport',
        result_summary: 'Consult and verification tools responded.',
        evidence: [{ type: 'note', ref: 'mcp://smoke' }],
        verification_checks: [{ name: 'consult', passed: true }],
        status: 'in_progress',
        domain: 'best-brain',
      },
    });

    const verificationStart = parseToolText<{ status: string }>(await client.callTool({
      name: 'brain_verify',
      arguments: {
        action: 'start',
        mission_id: 'mcp-smoke-mission',
        requested_by: 'mcp-smoke',
        checks: [{ name: 'consult', passed: true }],
      },
    }));

    const verificationComplete = parseToolText<{ status: string }>(await client.callTool({
      name: 'brain_verify',
      arguments: {
        action: 'complete',
        mission_id: 'mcp-smoke-mission',
        status: 'verified_complete',
        summary: 'MCP smoke passed',
        evidence: [{ type: 'note', ref: 'mcp://smoke' }],
        verification_checks: [{ name: 'consult', passed: true }],
      },
    }));
    const context = parseToolText<{
      preferred_format: string;
      verification_artifacts: Array<{ source_kind: string }>;
    }>(await client.callTool({
      name: 'brain_context',
      arguments: {
        mission_id: 'mcp-smoke-mission',
        query: 'latest mission context',
        domain: 'best-brain',
      },
    }));

    return {
      tools: tools.tools.map((tool) => tool.name),
      consult,
      context,
      learn_reject: learnReject,
      verification: {
        start_status: verificationStart.status,
        complete_status: verificationComplete.status,
      },
      stderr_lines: stderrLines.filter(Boolean),
    };
  } finally {
    await client.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can keep SQLite WAL files open briefly.
    }
  }
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BestBrain } from '../services/brain.ts';
import {
  validateConsultRequest,
  validateContextInput,
  validateFailureInput,
  validateLearnRequestInput,
  validateMissionOutcomeToolInput,
  validateVerificationCompleteInput,
  validateVerificationStartInput,
} from '../validation.ts';

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'brain_consult',
    description: 'Consult the personal brain for grounded guidance and citations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        mission_id: { type: 'string' },
        domain: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'brain_learn',
    description: 'Write structured memory into the personal brain.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        owner: { type: 'string' },
        domain: { type: 'string' },
        reusable: { type: 'boolean' },
        mission_id: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
        supersedes: { type: 'string' },
        verified_by: { type: 'string' },
        evidence_ref: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              ref: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['type', 'ref'],
          },
        },
        confirmed_by_user: { type: 'boolean' },
      },
      required: ['mode', 'title', 'content'],
    },
  },
  {
    name: 'brain_context',
    description: 'Fetch mission context, history, planning hints, and verification state.',
    inputSchema: {
      type: 'object',
      properties: {
        mission_id: { type: 'string' },
        domain: { type: 'string' },
        query: { type: 'string' },
      },
    },
  },
  {
    name: 'brain_save_outcome',
    description: 'Save a mission outcome without claiming completion until verification passes.',
    inputSchema: {
      type: 'object',
      properties: {
        mission_id: { type: 'string' },
        objective: { type: 'string' },
        result_summary: { type: 'string' },
        evidence: { type: 'array' },
        verification_checks: { type: 'array' },
        status: { type: 'string' },
        domain: { type: 'string' },
      },
      required: ['mission_id', 'objective', 'result_summary', 'evidence', 'verification_checks'],
    },
  },
  {
    name: 'brain_save_failure',
    description: 'Save a failure lesson in confirmed or candidate state.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        cause: { type: 'string' },
        lesson: { type: 'string' },
        prevention: { type: 'string' },
        mission_id: { type: 'string' },
        domain: { type: 'string' },
        confirmed: { type: 'boolean' },
      },
      required: ['title', 'cause', 'lesson', 'prevention'],
    },
  },
  {
    name: 'brain_verify',
    description: 'Start or complete mission verification.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        mission_id: { type: 'string' },
        verification_run_id: { type: 'string' },
        requested_by: { type: 'string' },
        status: { type: 'string' },
        summary: { type: 'string' },
        evidence: { type: 'array' },
        verification_checks: { type: 'array' },
      },
      required: ['action'],
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyToolResult(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function isDebugEnabled(env = process.env): boolean {
  const value = String(env.BEST_BRAIN_MCP_DEBUG ?? '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function debugLog(enabled: boolean, message: string, data?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }

  const suffix = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[best-brain:mcp] ${message}${suffix}\n`);
}

async function executeTool(brain: BestBrain, name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case 'brain_consult':
      return brain.consult(validateConsultRequest(args));
    case 'brain_learn':
      return brain.learn(validateLearnRequestInput(args));
    case 'brain_context':
      return brain.getContext(validateContextInput(args));
    case 'brain_save_outcome':
      return brain.saveMissionOutcome(validateMissionOutcomeToolInput(args));
    case 'brain_save_failure':
      return brain.saveFailure(validateFailureInput(args));
    case 'brain_verify': {
      const body = isRecord(args) ? args : {};
      const action = body.action;
      if (action === 'start') {
        return brain.startVerification(validateVerificationStartInput(body));
      }
      if (action === 'complete') {
        return brain.completeVerification(validateVerificationCompleteInput(body));
      }
      throw new Error('brain_verify requires action=start|complete');
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function createBestBrainMcpServer(options: {
  brain?: BestBrain;
  debug?: boolean;
} = {}): Promise<{ brain: BestBrain; server: Server; debugEnabled: boolean }> {
  const brain = options.brain ?? await BestBrain.open();
  const debugEnabled = options.debug ?? isDebugEnabled();
  const server = new Server(
    { name: 'best-brain', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    debugLog(debugEnabled, 'list_tools');
    return { tools: [...MCP_TOOL_DEFINITIONS] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};

    debugLog(debugEnabled, 'tool_start', { name });
    try {
      const payload = await executeTool(brain, name, args);
      debugLog(debugEnabled, 'tool_success', { name });
      return {
        content: [{ type: 'text', text: stringifyToolResult(payload) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog(debugEnabled, 'tool_error', { name, message });
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  });

  return { brain, server, debugEnabled };
}

export async function runBestBrainMcpServer(): Promise<void> {
  const { server, debugEnabled } = await createBestBrainMcpServer();
  const transport = new StdioServerTransport();
  debugLog(debugEnabled, 'stdio_connect_start');
  await server.connect(transport);
  debugLog(debugEnabled, 'stdio_connect_ready');
}

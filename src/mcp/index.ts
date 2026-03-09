import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BestBrain } from '../services/brain.ts';

const toolDefinitions = [
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
        domain: { type: 'string' },
        mission_id: { type: 'string' },
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
];

const brain = await BestBrain.open();
const server = new Server(
  { name: 'best-brain', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'brain_consult':
        return { content: [{ type: 'text', text: JSON.stringify(await brain.consult(request.params.arguments as any), null, 2) }] };
      case 'brain_learn':
        return { content: [{ type: 'text', text: JSON.stringify(await brain.learn(request.params.arguments as any), null, 2) }] };
      case 'brain_context':
        return { content: [{ type: 'text', text: JSON.stringify(await brain.getContext(request.params.arguments as any), null, 2) }] };
      case 'brain_save_outcome':
        return { content: [{ type: 'text', text: JSON.stringify(await brain.saveMissionOutcome(request.params.arguments as any), null, 2) }] };
      case 'brain_save_failure':
        return { content: [{ type: 'text', text: JSON.stringify(await brain.saveFailure(request.params.arguments as any), null, 2) }] };
      case 'brain_verify': {
        const args = request.params.arguments as any;
        if (args.action === 'start') {
          return { content: [{ type: 'text', text: JSON.stringify(await brain.startVerification(args), null, 2) }] };
        }

        if (args.action === 'complete') {
          return { content: [{ type: 'text', text: JSON.stringify(await brain.completeVerification(args), null, 2) }] };
        }

        throw new Error('brain_verify requires action=start|complete');
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

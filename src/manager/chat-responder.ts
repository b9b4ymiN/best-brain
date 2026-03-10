import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import { isSpawnCommandMissing, runClaudeStreamResult, runCommand, toEnvRecord } from './adapters/shared.ts';

export interface ChatResponder {
  answer(input: {
    goal: string;
    cwd: string;
    consult: ConsultResponse;
    context: MissionContextBundle;
  }): Promise<string | null>;
}

export interface LocalCliChatResponderOptions {
  claudeTimeoutMs?: number;
  codexTimeoutMs?: number;
  executionCwd?: string;
  mcpServerEnv?: Record<string, string | undefined>;
}

function shouldAttachOwnerContext(goal: string): boolean {
  return /owner|persona|preference|style|format|workflow|invest|memory|remember|my name|who am i|what do you know about me|\u0e25\u0e07\u0e17\u0e38\u0e19|\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19|\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19|\u0e41\u0e1a\u0e1a\u0e09\u0e31\u0e19|\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19|\u0e2a\u0e23\u0e38\u0e1b|\u0e08\u0e33\u0e44\u0e27\u0e49|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e09\u0e31\u0e19\u0e40\u0e1b\u0e47\u0e19\u0e43\u0e04\u0e23/i.test(goal);
}

function requiresBrainMcp(goal: string): boolean {
  return /remember|my name|who am i|what do you know about me|what have you remembered|owner|persona|preference|\u0e08\u0e33\u0e44\u0e27\u0e49|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19|\u0e15\u0e31\u0e27\u0e09\u0e31\u0e19/i.test(goal);
}

function buildInlineMcpConfig(envOverrides: Record<string, string | undefined>): string {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value;
    }
  }

  return JSON.stringify({
    mcpServers: {
      'best-brain': {
        type: 'stdio',
        command: 'bun',
        args: ['src/mcp/index.ts'],
        env,
      },
    },
  });
}

function buildPrompt(input: {
  goal: string;
  consult: ConsultResponse;
  context: MissionContextBundle;
}): string {
  const includeOwnerContext = shouldAttachOwnerContext(input.goal);
  const citations = includeOwnerContext
    ? input.consult.citations
        .filter((citation) => citation.memory_type === 'Persona'
          || citation.memory_type === 'Preferences'
          || citation.memory_type === 'Procedures')
        .slice(0, 5)
        .map((citation) => `- [${citation.memory_type}] ${citation.title}: ${citation.summary}`)
        .join('\n')
    : '';
  const planningHints = includeOwnerContext
    ? input.context.planning_hints.slice(0, 2).join(' | ')
    : '';
  const contextBlock = [
    includeOwnerContext && input.context.preferred_format ? `Preferred format: ${input.context.preferred_format}` : '',
    planningHints ? `Context hints: ${planningHints}` : '',
    citations ? `Relevant owner context:\n${citations}` : '',
  ].filter(Boolean);

  return [
    'You are the internal best-brain chat responder.',
    'Answer the user directly in the same language as the user.',
    'You have access to the best-brain MCP tools for memory and mission context.',
    'If the user asks about their name, identity, preferences, prior remembered facts, or what you know about them, you MUST call brain_consult before answering. Do not guess.',
    'If the user asks you to remember a durable fact, preference, or procedure, you MUST call brain_learn before answering. Do not merely say you will remember it.',
    'Use brain_context when you need recent mission history or verification context.',
    'For persona or preference writes, set confirmed_by_user=true, verified_by=user, source=chat://mcp-memory-write, and include at least one note evidence_ref that quotes or summarizes the user statement.',
    'For short-lived or uncertain facts, prefer working_memory instead of persona.',
    'After a successful durable memory write, answer with the saved result and use the stored fact in your reply.',
    'Do not mention MCP, tools, workers, routing, repositories, or implementation details unless the user explicitly asks.',
    'If the message is ambiguous, ask one short clarifying question.',
    'Output plain text only.',
    '',
    `User message: ${input.goal}`,
    ...contextBlock,
  ].join('\n');
}

function normalizeAnswer(value: string): string | null {
  const answer = value
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return answer.length > 0 ? answer : null;
}

function isContaminatedAnswer(goal: string, answer: string): boolean {
  return /project|codebase|git status|worker|routing|mission|best-brain/i.test(answer)
    && !/project|code|repo|git|best-brain/i.test(goal);
}

async function runClaude(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  mcpServerEnv: Record<string, string | undefined>,
): Promise<string | null> {
  try {
    const result = await runClaudeStreamResult(prompt, {
      cwd,
      env: toEnvRecord({}),
      timeoutMs,
      disableTools: true,
      maxTurns: 4,
      bypassPermissions: true,
      extraArgs: [
        '--strict-mcp-config',
        '--mcp-config', buildInlineMcpConfig(mcpServerEnv),
        '--allowedTools', 'mcp__best-brain__brain_consult',
        '--allowedTools', 'mcp__best-brain__brain_learn',
        '--allowedTools', 'mcp__best-brain__brain_context',
      ],
    });
    return normalizeAnswer(result.result ?? '');
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

function extractCodexMessage(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastMessage: string | null = null;

  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as { msg?: { type?: string; message?: string } };
      if (payload.msg?.type === 'agent_message' && typeof payload.msg.message === 'string') {
        lastMessage = payload.msg.message;
      }
    } catch {
      // Ignore non-JSON lines from Codex.
    }
  }

  return lastMessage;
}

async function runCodex(prompt: string, cwd: string, timeoutMs: number): Promise<string | null> {
  try {
    const result = await runCommand('codex', [
      'exec',
      '--json',
      '--full-auto',
      '--skip-git-repo-check',
      '-c', 'model_reasoning_effort=high',
      '-C', cwd,
      '-',
    ], {
      cwd,
      env: toEnvRecord({}),
      timeoutMs,
      stdin: prompt,
    });
    if (result.timedOut || result.exitCode !== 0) {
      return null;
    }

    return normalizeAnswer(extractCodexMessage(result.stdout) ?? result.stdout);
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

export class LocalCliChatResponder implements ChatResponder {
  private readonly claudeTimeoutMs: number;
  private readonly codexTimeoutMs: number;
  private readonly executionCwd: string;
  private readonly mcpServerEnv: Record<string, string | undefined>;

  constructor(options: LocalCliChatResponderOptions = {}) {
    this.claudeTimeoutMs = options.claudeTimeoutMs ?? 30000;
    this.codexTimeoutMs = options.codexTimeoutMs ?? 30000;
    this.executionCwd = options.executionCwd ?? process.cwd();
    this.mcpServerEnv = options.mcpServerEnv ?? {
      BEST_BRAIN_DATA_DIR: process.env.BEST_BRAIN_DATA_DIR,
      BEST_BRAIN_DB_PATH: process.env.BEST_BRAIN_DB_PATH,
      BEST_BRAIN_OWNER: process.env.BEST_BRAIN_OWNER,
    };
  }

  async answer(input: {
    goal: string;
    cwd: string;
    consult: ConsultResponse;
    context: MissionContextBundle;
  }): Promise<string | null> {
    const prompt = buildPrompt(input);
    const claudeAnswer = await runClaude(prompt, this.executionCwd, this.claudeTimeoutMs, this.mcpServerEnv);
    if (claudeAnswer && !isContaminatedAnswer(input.goal, claudeAnswer)) {
      return claudeAnswer;
    }

    if (requiresBrainMcp(input.goal)) {
      return claudeAnswer;
    }

    const codexAnswer = await runCodex(prompt, this.executionCwd, this.codexTimeoutMs);
    if (codexAnswer && !isContaminatedAnswer(input.goal, codexAnswer)) {
      return codexAnswer;
    }

    return claudeAnswer ?? codexAnswer;
  }
}

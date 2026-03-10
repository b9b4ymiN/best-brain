import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import { resolveNeutralAICwd, runClaudeStreamResult, runCommand, toEnvRecord } from './adapters/shared.ts';

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
}

function shouldAttachOwnerContext(goal: string): boolean {
  return /owner|persona|preference|style|format|workflow|invest|\u0e25\u0e07\u0e17\u0e38\u0e19|\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19|\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19|\u0e41\u0e1a\u0e1a\u0e09\u0e31\u0e19|\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19|\u0e2a\u0e23\u0e38\u0e1b/i.test(goal);
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
    'Answer the user message directly in the same language as the user.',
    'Do not mention any project, repository, codebase, git status, tool, worker, routing, mode, or implementation detail unless the user explicitly asks about it.',
    'Use owner context only when it is actually relevant.',
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

async function runClaude(prompt: string, timeoutMs: number): Promise<string | null> {
  const result = await runClaudeStreamResult(prompt, {
    cwd: resolveNeutralAICwd(),
    env: toEnvRecord({}),
    timeoutMs,
    disableTools: true,
  });
  return normalizeAnswer(result.result ?? '');
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

async function runCodex(prompt: string, timeoutMs: number): Promise<string | null> {
  const result = await runCommand('codex', [
    'exec',
    '--json',
    '--full-auto',
    '--skip-git-repo-check',
    '-c', 'model_reasoning_effort=high',
    '-C', resolveNeutralAICwd(),
    '-',
  ], {
    cwd: resolveNeutralAICwd(),
    env: toEnvRecord({}),
    timeoutMs,
    stdin: prompt,
  });
  if (result.timedOut || result.exitCode !== 0) {
    return null;
  }

  return normalizeAnswer(extractCodexMessage(result.stdout) ?? result.stdout);
}

export class LocalCliChatResponder implements ChatResponder {
  private readonly claudeTimeoutMs: number;
  private readonly codexTimeoutMs: number;

  constructor(options: LocalCliChatResponderOptions = {}) {
    this.claudeTimeoutMs = options.claudeTimeoutMs ?? 12000;
    this.codexTimeoutMs = options.codexTimeoutMs ?? 12000;
  }

  async answer(input: {
    goal: string;
    cwd: string;
    consult: ConsultResponse;
    context: MissionContextBundle;
  }): Promise<string | null> {
    const prompt = buildPrompt(input);
    const claudeAnswer = await runClaude(prompt, this.claudeTimeoutMs);
    if (claudeAnswer && !isContaminatedAnswer(input.goal, claudeAnswer)) {
      return claudeAnswer;
    }

    const codexAnswer = await runCodex(prompt, this.codexTimeoutMs);
    if (codexAnswer && !isContaminatedAnswer(input.goal, codexAnswer)) {
      return codexAnswer;
    }

    return claudeAnswer ?? codexAnswer;
  }
}

import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import type { ManagerDecision, ManagerDecisionKind } from './types.ts';
import { extractCodexStreamMessage, extractJsonText, isSpawnCommandMissing, resolveNeutralAICwd, runClaudeStreamResult, runCommand, toEnvRecord } from './adapters/shared.ts';

export interface ManagerTriageResult {
  kind: ManagerDecisionKind;
  reason: string;
  direct_answer: string | null;
}

export interface ManagerReasoner {
  triage(input: {
    goal: string;
    cwd: string;
    heuristic: ManagerDecision;
    consult: ConsultResponse;
    context: MissionContextBundle;
  }): Promise<ManagerTriageResult | null>;
}

export interface LocalCliManagerReasonerOptions {
  claudeTimeoutMs?: number;
  codexTimeoutMs?: number;
}

function buildPrompt(input: {
  goal: string;
  heuristic: ManagerDecision;
  consult: ConsultResponse;
  context: MissionContextBundle;
}): string {
  const citations = input.consult.citations
    .filter((citation) => citation.memory_type === 'Persona'
      || citation.memory_type === 'Preferences'
      || citation.memory_type === 'Procedures')
    .slice(0, 3)
    .map((citation) => `- [${citation.memory_type}] ${citation.title}: ${citation.summary}`)
    .join('\n');
  const planningHints = input.context.planning_hints.slice(0, 2).join(' | ');
  const contextBlock = [
    citations ? `Owner context:\n${citations}` : '',
    planningHints ? `Planning hints: ${planningHints}` : '',
    input.context.preferred_format ? `Preferred format: ${input.context.preferred_format}` : '',
  ].filter(Boolean);

  return [
    'Classify the user message for an assistant router.',
    'Return JSON only with keys kind, reason, direct_answer.',
    'kind must be exactly one of: chat, task, mission.',
    'Use chat when the user should get a direct answer in the same language.',
    'Use task for bounded real work.',
    'Use mission for multi-step work, building a system, or anything that needs verification.',
    'Set direct_answer to null unless kind is chat.',
    'Do not mention tools, workers, routing, repositories, or internal implementation details inside direct_answer.',
    ...contextBlock,
    `User message: ${input.goal}`,
  ].join('\n');
}

function parseTriage(output: string): ManagerTriageResult | null {
  try {
    const payload = JSON.parse(extractJsonText(output)) as Partial<ManagerTriageResult>;
    if (payload.kind !== 'chat' && payload.kind !== 'task' && payload.kind !== 'mission') {
      return null;
    }
    if (typeof payload.reason !== 'string' || payload.reason.trim().length === 0) {
      return null;
    }
    return {
      kind: payload.kind,
      reason: payload.reason.trim(),
      direct_answer: typeof payload.direct_answer === 'string' && payload.direct_answer.trim().length > 0
        ? payload.direct_answer.trim()
        : null,
    };
  } catch {
    return null;
  }
}

async function runClaude(prompt: string, timeoutMs: number): Promise<ManagerTriageResult | null> {
  try {
    const result = await runClaudeStreamResult(prompt, {
      cwd: resolveNeutralAICwd(),
      env: toEnvRecord({}),
      timeoutMs,
      disableTools: true,
    });
    return result.result ? parseTriage(result.result) : null;
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

async function runCodex(prompt: string, timeoutMs: number): Promise<ManagerTriageResult | null> {
  try {
    const result = await runCommand('codex', [
      'exec',
      '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      '--sandbox', 'danger-full-access',
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

    return parseTriage(extractCodexStreamMessage(result.stdout) ?? result.stdout);
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

export class LocalCliManagerReasoner implements ManagerReasoner {
  private readonly claudeTimeoutMs: number;
  private readonly codexTimeoutMs: number;

  constructor(options: LocalCliManagerReasonerOptions = {}) {
    this.claudeTimeoutMs = options.claudeTimeoutMs ?? 7000;
    this.codexTimeoutMs = options.codexTimeoutMs ?? 7000;
  }

  async triage(input: {
    goal: string;
    cwd: string;
    heuristic: ManagerDecision;
    consult: ConsultResponse;
    context: MissionContextBundle;
  }): Promise<ManagerTriageResult | null> {
    const prompt = buildPrompt(input);
    return await runClaude(prompt, this.claudeTimeoutMs)
      ?? await runCodex(prompt, this.codexTimeoutMs);
  }
}

import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import type { ManagerChatMode, ManagerDecision, ManagerDecisionKind, ManagerProgressEvent } from './types.ts';
import { extractCodexStreamMessage, extractJsonText, isSpawnCommandMissing, resolveNeutralAICwd, runClaudeStreamResult, runCommand, toEnvRecord } from './adapters/shared.ts';

export interface ManagerTriageResult {
  kind: ManagerDecisionKind;
  chat_mode: ManagerChatMode | null;
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
  }, observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> }): Promise<ManagerTriageResult | null>;
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
    'Return JSON only with keys kind, chat_mode, reason, direct_answer.',
    'kind must be exactly one of: chat, task, mission.',
    'chat_mode must be direct_chat or chat_memory_update when kind=chat, otherwise null.',
    'Use chat when the user should get a direct answer in the same language.',
    'Use chat_memory_update when the user is stating, correcting, or asking to remember owner identity, preferences, style, investor profile, or other durable self-facts.',
    'Use task for bounded real work.',
    'Use mission for multi-step work, building a system, or anything that needs verification.',
    'When chat_mode=chat_memory_update, set direct_answer to null so the brain-aware chat path can read/write memory first.',
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
    const chatMode = payload.kind === 'chat'
      ? (payload.chat_mode === 'chat_memory_update' ? 'chat_memory_update' : 'direct_chat')
      : null;
    if (typeof payload.reason !== 'string' || payload.reason.trim().length === 0) {
      return null;
    }
    return {
      kind: payload.kind,
      chat_mode: chatMode,
      reason: payload.reason.trim(),
      direct_answer: typeof payload.direct_answer === 'string' && payload.direct_answer.trim().length > 0
        ? payload.direct_answer.trim()
        : null,
    };
  } catch {
    return null;
  }
}

async function runClaude(
  prompt: string,
  timeoutMs: number,
  observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> },
): Promise<ManagerTriageResult | null> {
  try {
    await observer?.onTrace?.({
      stage: 'triage_claude_start',
      actor: 'claude',
      kind: 'command_start',
      status: 'started',
      title: 'Claude triage started',
      detail: 'Claude is classifying the message.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: null,
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      worker: 'claude',
    });
    const result = await runClaudeStreamResult(prompt, {
      cwd: resolveNeutralAICwd(),
      env: toEnvRecord({}),
      timeoutMs,
      disableTools: true,
    });
    const parsed = result.result ? parseTriage(result.result) : null;
    await observer?.onTrace?.({
      stage: 'triage_claude_end',
      actor: 'claude',
      kind: 'command_end',
      status: parsed ? 'completed' : 'failed',
      title: parsed ? 'Claude triage completed' : 'Claude triage failed',
      detail: parsed ? `Claude classified this as ${parsed.kind}.` : 'Claude did not return a valid triage result.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: parsed?.kind ?? null,
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      worker: 'claude',
      exit_code: result.exitCode,
    });
    return parsed;
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

async function runCodex(
  prompt: string,
  timeoutMs: number,
  observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> },
): Promise<ManagerTriageResult | null> {
  try {
    await observer?.onTrace?.({
      stage: 'triage_codex_start',
      actor: 'codex',
      kind: 'command_start',
      status: 'started',
      title: 'Codex triage started',
      detail: 'Codex is classifying the message.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: null,
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      worker: 'codex',
    });
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
      await observer?.onTrace?.({
        stage: 'triage_codex_end',
        actor: 'codex',
        kind: 'command_end',
        status: 'failed',
        title: 'Codex triage failed',
        detail: `Codex exited with code ${String(result.exitCode)}.`,
        timestamp: Date.now(),
        mission_id: null,
        task_id: null,
        decision_kind: null,
        requested_worker: null,
        executed_worker: null,
        blocked_reason_code: null,
        worker: 'codex',
        exit_code: result.exitCode,
      });
      return null;
    }

    const parsed = parseTriage(extractCodexStreamMessage(result.stdout) ?? result.stdout);
    await observer?.onTrace?.({
      stage: 'triage_codex_end',
      actor: 'codex',
      kind: 'command_end',
      status: parsed ? 'completed' : 'failed',
      title: parsed ? 'Codex triage completed' : 'Codex triage failed',
      detail: parsed ? `Codex classified this as ${parsed.kind}.` : 'Codex did not return a valid triage result.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: parsed?.kind ?? null,
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      worker: 'codex',
      exit_code: result.exitCode,
    });
    return parsed;
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
  }, observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> }): Promise<ManagerTriageResult | null> {
    const prompt = buildPrompt(input);
    return await runClaude(prompt, this.claudeTimeoutMs, observer)
      ?? await runCodex(prompt, this.codexTimeoutMs, observer);
  }
}

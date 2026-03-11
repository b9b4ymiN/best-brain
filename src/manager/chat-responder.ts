import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import type { ManagerChatMode, ManagerProgressEvent } from './types.ts';
import {
  type CliObservableEvent,
  extractCodexStreamMessage,
  isSpawnCommandMissing,
  runClaudeStreamResult,
  runCommand,
  toEnvRecord,
} from './adapters/shared.ts';

export interface ChatResponder {
  answer(input: {
    goal: string;
    cwd: string;
    consult: ConsultResponse;
    context: MissionContextBundle;
    chatMode?: ManagerChatMode | null;
  }, observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> }): Promise<string | null>;
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

function detectOwnerNameHint(goal: string): string | null {
  const english = goal.match(/(?:my name is|call me|remember that my name is)\s+(.+?)(?:$|,|\.| and | but | because )/i);
  if (english?.[1]) {
    return english[1].trim();
  }

  const thai = goal.match(/(?:ฉันชื่อ|เรียกฉันว่า|จำไว้ว่าฉันชื่อ)\s+(.+?)(?=$| อยาก| และ| ชอบ| เน้น| เป็น| ครับ| ค่ะ| นะ)/);
  if (thai?.[1]) {
    return thai[1].trim();
  }

  return null;
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

type ChatPromptStrategy = 'general' | 'memory_update' | 'memory_recall';

function buildPrompt(input: {
  goal: string;
  consult: ConsultResponse;
  context: MissionContextBundle;
  chatMode?: ManagerChatMode | null;
}): string {
  const includeOwnerContext = shouldAttachOwnerContext(input.goal);
  const strategy: ChatPromptStrategy = input.chatMode === 'chat_memory_update'
    ? 'memory_update'
    : requiresBrainMcp(input.goal)
      ? 'memory_recall'
      : 'general';
  const ownerNameHint = strategy === 'memory_update' ? detectOwnerNameHint(input.goal) : null;
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

  const shared = [
    'You are the internal best-brain chat responder.',
    'Answer the user directly in the same language as the user.',
    'You have access to the best-brain MCP tools for memory and mission context.',
    'Do not mention MCP, tools, workers, routing, repositories, or implementation details unless the user explicitly asks.',
    'Output plain text only.',
  ];

  const memoryUpdateInstructions = [
    'This message is a chat_memory_update. Treat it as an explicit owner-memory update, not as a task or mission.',
    'You MUST extract durable owner facts from the user message before answering.',
    'For each durable fact, call brain_learn separately before answering.',
    'Use only these brain_learn modes: persona, preference, procedure, or working_memory.',
    'For owner identity and investor-style facts, use mode=persona.',
    'For report format or workflow preferences, use mode=preference.',
    'After all writes, call brain_consult once to verify the saved facts and answer using the updated memory.',
    'For persona or preference writes, set confirmed_by_user=true, verified_by=user, written_by=chat, source=chat://mcp-memory-write, and include at least one note evidence_ref that quotes or summarizes the user statement.',
    'For first-person owner identity updates, prefer memory_subtype=persona.identity.',
    'For first-person investing style updates such as VI, value investing, or Quality Growth preferences, prefer memory_subtype=persona.investor_style.',
    'Preserve any owner name exactly as written in the user text. Do not translate or romanize it unless the user explicitly gave both forms.',
    'If one message contains both owner identity and investor style, save both in separate brain_learn calls.',
    ownerNameHint ? `Exact owner-name candidate detected in the user text: ${ownerNameHint}` : '',
    'If the user explicitly corrects an older value, write the corrected value and let the contradiction flow supersede the older record.',
    'Only ask a short clarification question if the user statement is internally contradictory or you genuinely cannot tell what fact should be saved.',
    'Example durable facts in one message can include owner name, investor style, and report preferences.',
  ].filter(Boolean);

  const memoryRecallInstructions = [
    'This message needs memory-aware chat.',
    'If the user asks about their name, identity, preferences, prior remembered facts, or what you know about them, you MUST call brain_consult before answering. Do not guess.',
    'When the user asks for multiple remembered facts in one message, call brain_consult with separate targeted exact queries for each requested fact before answering.',
    'Use targeted exact queries like "owner name", "owner identity", or "owner investor style" instead of one broad combined query when exact owner facts matter.',
    'If the consult shows no exact match, say that briefly and ask one short clarification question.',
  ];

  const generalInstructions = [
    'If the user asks you to remember a durable fact, preference, or procedure, you MUST call brain_learn before answering. Do not merely say you will remember it.',
    'If the user states multiple durable owner facts in one message, write each durable fact separately before answering.',
    'Use brain_context when you need recent mission history or verification context.',
    'For short-lived or uncertain facts, prefer working_memory instead of persona.',
    'If the message is ambiguous, ask one short clarifying question.',
  ];

  return [
    ...shared,
    ...(strategy === 'memory_update'
      ? memoryUpdateInstructions
      : strategy === 'memory_recall'
        ? memoryRecallInstructions
        : generalInstructions),
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

function toTraceEvent(event: CliObservableEvent): Omit<ManagerProgressEvent, 'timestamp' | 'mission_id' | 'task_id' | 'decision_kind' | 'requested_worker' | 'executed_worker' | 'blocked_reason_code'> {
  const actor = event.source === 'mcp' ? 'mcp' : event.source;
  const normalizedTool = event.toolName ?? null;
  const isBrainRead = normalizedTool === 'brain_consult' || normalizedTool === 'brain_context';
  const isBrainWrite = normalizedTool === 'brain_learn';
  const kind: ManagerProgressEvent['kind'] =
    isBrainWrite
      ? 'memory_write'
      : isBrainRead
        ? 'memory_read'
        : event.kind;
  const status: ManagerProgressEvent['status'] =
    event.kind === 'error'
      ? 'failed'
      : event.kind === 'result' || event.kind === 'tool_result' || event.kind === 'command_end'
        ? 'completed'
        : 'started';
  return {
    stage: `chat_${event.source}_${event.kind}`,
    actor,
    kind,
    status,
    title: isBrainWrite
      ? (event.kind === 'tool_result' ? 'Brain memory updated' : 'Writing to brain memory')
      : isBrainRead
        ? (event.kind === 'tool_result' ? 'Brain memory read completed' : 'Reading from brain memory')
        : event.title,
    detail: event.detail,
    tool_name: normalizedTool,
    server_name: event.serverName ?? null,
    worker: event.source === 'claude' || event.source === 'codex' ? event.source : null,
    exit_code: event.exitCode ?? null,
  };
}

async function runClaude(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  mcpServerEnv: Record<string, string | undefined>,
  observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> },
): Promise<string | null> {
  try {
    const result = await runClaudeStreamResult(prompt, {
      cwd,
      env: toEnvRecord({}),
      timeoutMs,
      maxTurns: 4,
      bypassPermissions: true,
      extraArgs: [
        '--strict-mcp-config',
        '--mcp-config', buildInlineMcpConfig(mcpServerEnv),
        '--allowedTools', 'mcp__best-brain__brain_consult',
        '--allowedTools', 'mcp__best-brain__brain_learn',
        '--allowedTools', 'mcp__best-brain__brain_context',
      ],
      onEvent: async (event) => {
        await observer?.onTrace?.({
          ...toTraceEvent(event),
          timestamp: Date.now(),
          mission_id: null,
          task_id: null,
          decision_kind: 'chat',
          requested_worker: null,
          executed_worker: null,
          blocked_reason_code: null,
        });
      },
    });
    return normalizeAnswer(result.result ?? '');
  } catch (error) {
    if (isSpawnCommandMissing(error)) {
      return null;
    }
    throw error;
  }
}

async function runCodex(
  prompt: string,
  cwd: string,
  timeoutMs: number,
  observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> },
): Promise<string | null> {
  try {
    await observer?.onTrace?.({
      stage: 'chat_codex_command_start',
      actor: 'codex',
      kind: 'command_start',
      status: 'started',
      title: 'Starting Codex',
      detail: 'Codex is preparing the chat response.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: 'chat',
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
      '-C', cwd,
      '-',
    ], {
      cwd,
      env: toEnvRecord({}),
      timeoutMs,
      stdin: prompt,
      onStdoutLine: async (line) => {
        try {
          const payload = JSON.parse(line) as { msg?: { type?: string; message?: string } };
          if (payload.msg?.type === 'task_started') {
            await observer?.onTrace?.({
              stage: 'chat_codex_task_started',
              actor: 'codex',
              kind: 'status',
              status: 'started',
              title: 'Codex task started',
              detail: 'Codex accepted the chat request.',
              timestamp: Date.now(),
              mission_id: null,
              task_id: null,
              decision_kind: 'chat',
              requested_worker: null,
              executed_worker: null,
              blocked_reason_code: null,
              worker: 'codex',
            });
          } else if (payload.msg?.type === 'agent_message' && typeof payload.msg.message === 'string' && payload.msg.message.trim()) {
            await observer?.onTrace?.({
              stage: 'chat_codex_message',
              actor: 'codex',
              kind: 'status',
              status: 'started',
              title: 'Codex update',
              detail: payload.msg.message.trim().slice(0, 220),
              timestamp: Date.now(),
              mission_id: null,
              task_id: null,
              decision_kind: 'chat',
              requested_worker: null,
              executed_worker: null,
              blocked_reason_code: null,
              worker: 'codex',
            });
          } else if (payload.msg?.type === 'error' && typeof payload.msg.message === 'string') {
            await observer?.onTrace?.({
              stage: 'chat_codex_error',
              actor: 'codex',
              kind: 'error',
              status: 'failed',
              title: 'Codex error',
              detail: payload.msg.message.trim().slice(0, 220),
              timestamp: Date.now(),
              mission_id: null,
              task_id: null,
              decision_kind: 'chat',
              requested_worker: null,
              executed_worker: null,
              blocked_reason_code: null,
              worker: 'codex',
            });
          }
        } catch {
          // Ignore non-JSON lines.
        }
      },
    });
    if (result.timedOut || result.exitCode !== 0) {
      await observer?.onTrace?.({
        stage: 'chat_codex_command_end',
        actor: 'codex',
        kind: 'command_end',
        status: 'failed',
        title: 'Codex finished with an error',
        detail: `Codex exited with code ${String(result.exitCode)}.`,
        timestamp: Date.now(),
        mission_id: null,
        task_id: null,
        decision_kind: 'chat',
        requested_worker: null,
        executed_worker: null,
        blocked_reason_code: null,
        worker: 'codex',
        exit_code: result.exitCode,
      });
      return null;
    }

    const answer = normalizeAnswer(extractCodexStreamMessage(result.stdout) ?? result.stdout);
    await observer?.onTrace?.({
      stage: 'chat_codex_command_end',
      actor: 'codex',
      kind: 'command_end',
      status: 'completed',
      title: 'Codex completed',
      detail: answer?.slice(0, 220) || 'Codex completed the chat response.',
      timestamp: Date.now(),
      mission_id: null,
      task_id: null,
      decision_kind: 'chat',
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      worker: 'codex',
      exit_code: result.exitCode,
    });
    return answer;
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
    chatMode?: ManagerChatMode | null;
  }, observer?: { onTrace?: (event: ManagerProgressEvent) => void | Promise<void> }): Promise<string | null> {
    const prompt = buildPrompt(input);
    const claudeAnswer = await runClaude(prompt, this.executionCwd, this.claudeTimeoutMs, this.mcpServerEnv, observer);
    if (claudeAnswer && !isContaminatedAnswer(input.goal, claudeAnswer)) {
      return claudeAnswer;
    }

    if (requiresBrainMcp(input.goal)) {
      return claudeAnswer;
    }

    const codexAnswer = await runCodex(prompt, this.executionCwd, this.codexTimeoutMs, observer);
    if (codexAnswer && !isContaminatedAnswer(input.goal, codexAnswer)) {
      return codexAnswer;
    }

    return claudeAnswer ?? codexAnswer;
  }
}

import type { FailureInput, StrictMissionOutcomeInput } from '../types.ts';
import { validateMissionOutcomeStrictInput } from '../validation.ts';
import { buildMissionReportDocument } from '../proving/report.ts';
import { LocalRuntimeSpine } from '../runtime/spine.ts';
import { WorkerFabric } from '../workers/fabric.ts';
import { createId } from '../utils/id.ts';
import { slugify } from '../utils/text.ts';
import { buildChatOwnerResponse } from './chat-response.ts';
import type { ChatResponder } from './chat-responder.ts';
import { validateMissionBrief } from './brief-validator.ts';
import { detectGoalAmbiguity } from './goal-ambiguity.ts';
import { updateTaskStatus } from './graph.ts';
import { routeIntent, selectWorker } from './intent-router.ts';
import { isThaiEquitiesActualManagerGoal } from '../proving/packs.ts';
import type { ManagerReasoner, ManagerTriageResult } from './reasoner.ts';
import {
  assertCompletionPolicy,
  buildFailureWrite,
  createBrainWriteRecord,
  finalizeRun,
} from './kernel.ts';
import { compileMissionBrief } from './mission-compiler.ts';
import { buildExecutionRequest, type PlannerExecutionHistoryEntry } from './planner.ts';
import type { BrainAdapter, VerifierAdapter, WorkerAdapter } from './adapters/types.ts';
import { BrainHttpAdapter } from './adapters/brain-http.ts';
import { BrowserWorkerAdapter } from './adapters/browser.ts';
import { ClaudeCliAdapter } from './adapters/claude-cli.ts';
import { CodexCliAdapter } from './adapters/codex-cli.ts';
import { MailWorkerAdapter } from './adapters/mail.ts';
import { ShellCliAdapter } from './adapters/shell-cli.ts';
import { ManagerVerifierAdapter } from './adapters/verifier.ts';
import {
  buildMemoryUpdateAnswer,
  buildOwnerRecallAnswer,
  classifyOwnerRecall,
  extractChatAutoLearnRequests,
  extractChatMemoryFacts,
  shouldAttemptDirectOwnerRecall,
  shouldPreferLocalMemoryUpdate,
  summarizeOwnerRecall,
} from './chat-memory.ts';
import type {
  BrainWriteRecord,
  ExecutionRequest,
  ManagerInput,
  ManagerOutputMode,
  ManagerProgressEvent,
  ManagerRunObserver,
  ManagerRunResult,
  ManagerDecision,
  ManagerWorker,
  ManagerWorkerPreference,
  WorkerExecutionResult,
} from './types.ts';

export interface ManagerRuntimeOptions {
  brain?: BrainAdapter;
  workers?: Partial<Record<ManagerWorker, WorkerAdapter>>;
  verifier?: VerifierAdapter;
  brainHttpOptions?: ConstructorParameters<typeof BrainHttpAdapter>[0];
  now?: () => Date;
  reasoner?: ManagerReasoner | null;
  chatResponder?: ChatResponder | null;
}

function normalizeOutputMode(value: ManagerOutputMode | undefined): ManagerOutputMode {
  return value === 'json' ? 'json' : 'human';
}

function normalizeWorkerPreference(value: ManagerWorkerPreference | undefined): ManagerWorkerPreference {
  return value === 'claude'
    || value === 'codex'
    || value === 'shell'
    || value === 'browser'
    || value === 'mail'
    ? value
    : 'auto';
}

function normalizeInput(
  value: Pick<ManagerInput, 'goal'> & Partial<Omit<ManagerInput, 'goal'>>,
): ManagerInput {
  const goal = value.goal.trim();
  if (!goal) {
    throw new Error('manager goal is required');
  }

  return {
    goal,
    worker_preference: normalizeWorkerPreference(value.worker_preference),
    mission_id: value.mission_id?.trim() || null,
    cwd: value.cwd?.trim() || process.cwd(),
    dry_run: value.dry_run === true,
    no_execute: value.no_execute === true,
    force_mission: value.force_mission === true,
    output_mode: normalizeOutputMode(value.output_mode),
  };
}

function normalizeWorkerFailure(selectedWorker: ManagerWorker | null, error: unknown): WorkerExecutionResult {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    summary: `Worker execution failed before producing a verifiable result: ${detail}`,
    status: 'failed',
    artifacts: [{
      type: 'note',
      ref: `worker://${selectedWorker ?? 'unknown'}/runtime-error`,
      description: detail,
    }],
    proposed_checks: [{
      name: 'worker-execution',
      passed: false,
      detail,
    }],
    raw_output: detail,
    invocation: null,
    process_output: null,
  };
}

function buildBlockedDecision(decision: ManagerDecision, blockedReason: string): ManagerDecision {
  return {
    ...decision,
    should_execute: false,
    verification_required: false,
    blocked_reason: blockedReason,
    blocked_reason_code: decision.blocked_reason_code,
    reason: blockedReason,
  };
}

function buildBlockedDecisionWithCode(
  decision: ManagerDecision,
  blockedReason: string,
  blockedReasonCode: ManagerDecision['blocked_reason_code'],
): ManagerDecision {
  return {
    ...buildBlockedDecision(decision, blockedReason),
    blocked_reason_code: blockedReasonCode,
  };
}

function artifactRefs(workerResult: WorkerExecutionResult): string[] {
  return workerResult.artifacts.map((artifact) => artifact.ref);
}

function mapWorkerStatusToRuntimeStatus(status: WorkerExecutionResult['status']): 'succeeded' | 'failed' {
  return status === 'success' ? 'succeeded' : 'failed';
}

function mergeWorkerResults(workerResults: WorkerExecutionResult[]): WorkerExecutionResult {
  if (workerResults.length === 0) {
    return {
      summary: 'No worker result was produced.',
      status: 'failed',
      failure_kind: 'task_failed',
      artifacts: [],
      proposed_checks: [{
        name: 'worker-result-present',
        passed: false,
        detail: 'No worker result was produced before verification.',
      }],
      raw_output: '',
      invocation: null,
      process_output: null,
    };
  }

  const status: WorkerExecutionResult['status'] = workerResults.some((result) => result.status === 'failed')
    ? 'failed'
    : workerResults.some((result) => result.status === 'needs_retry')
      ? 'needs_retry'
      : 'success';
  const summary = workerResults
    .map((result, index) => {
      const worker = result.executed_worker ?? result.requested_worker ?? `worker_${index + 1}`;
      return `[${worker}] ${result.summary}`;
    })
    .join(' | ');
  const artifacts = Array.from(new Map(
    workerResults
      .flatMap((result) => result.artifacts)
      .map((artifact) => [`${artifact.type}:${artifact.ref}`, artifact]),
  ).values());
  const proposedChecks = Array.from(new Map(
    workerResults
      .flatMap((result) => result.proposed_checks)
      .map((check) => [`${check.name}:${check.detail ?? ''}:${check.passed}`, check]),
  ).values());
  const rawOutput = workerResults.map((result) => result.raw_output).filter(Boolean).join('\n\n');
  const attemptedWorkers = Array.from(new Set(workerResults.flatMap((result) => result.attempted_workers ?? [])));
  const last = workerResults[workerResults.length - 1]!;

  return {
    summary,
    status,
    failure_kind: status === 'failed' ? (last.failure_kind ?? 'task_failed') : null,
    artifacts,
    proposed_checks: proposedChecks,
    raw_output: rawOutput,
    invocation: last.invocation ?? null,
    process_output: last.process_output ?? null,
    requested_worker: workerResults[0]?.requested_worker,
    executed_worker: last.executed_worker ?? last.requested_worker,
    attempted_workers: attemptedWorkers,
    fallback_from: last.fallback_from ?? null,
    fallback_reason: last.fallback_reason ?? null,
  };
}

function mergeConsultResponses(primary: Awaited<ReturnType<BrainAdapter['consult']>>, secondary: Awaited<ReturnType<BrainAdapter['consult']>>) {
  const citationMap = new Map(primary.citations.map((citation) => [citation.memory_id, citation]));
  for (const citation of secondary.citations) {
    if (!citationMap.has(citation.memory_id)) {
      citationMap.set(citation.memory_id, citation);
    }
  }

  const selectedMemoryMap = new Map(primary.selected_memories.map((memory) => [memory.id, memory]));
  for (const memory of secondary.selected_memories) {
    if (!selectedMemoryMap.has(memory.id)) {
      selectedMemoryMap.set(memory.id, memory);
    }
  }

  return {
    ...primary,
    answer: [primary.answer, secondary.answer].filter(Boolean).join('\n'),
    memory_ids: Array.from(new Set([...primary.memory_ids, ...secondary.memory_ids])),
    citations: Array.from(citationMap.values()),
    followup_actions: Array.from(new Set([...primary.followup_actions, ...secondary.followup_actions])),
    selected_memories: Array.from(selectedMemoryMap.values()),
    retrieval_bundle: primary.retrieval_bundle ?? secondary.retrieval_bundle,
  };
}

function missionKindTag(missionKind: string): string {
  return `mission-kind:${slugify(missionKind.replace(/_/g, ' '))}`;
}

function hasTag(tags: string[], tag: string): boolean {
  return tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());
}

function shouldUseBrainAwareChat(goal: string): boolean {
  return /remember|my name|who am i|what do you know about me|what have you remembered|owner|persona|preference|\u0e08\u0e33\u0e44\u0e27\u0e49|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19|\u0e15\u0e31\u0e27\u0e09\u0e31\u0e19/i.test(goal);
}

function looksLikeUnusableChatAnswer(answer: string | null): boolean {
  if (!answer) {
    return true;
  }
  return /help a bit more specific|please make the question|ช่วยพิมพ์คำถามให้ครบอีกนิด|ยังไม่ทราบชื่อของคุณ|i do not know your name|i do not have your investing style|ยังไม่มีข้อมูลแนวลงทุน/u.test(answer);
}

export class ManagerRuntime {
  readonly brain: BrainAdapter;
  readonly workers: Partial<Record<ManagerWorker, WorkerAdapter>>;
  readonly verifier: VerifierAdapter;
  readonly fabric: WorkerFabric;
  readonly now: () => Date;
  readonly reasoner: ManagerReasoner | null;
  readonly chatResponder: ChatResponder | null;

  constructor(options: ManagerRuntimeOptions = {}) {
    this.brain = options.brain ?? new BrainHttpAdapter(options.brainHttpOptions);
    this.workers = {
      claude: new ClaudeCliAdapter(),
      codex: new CodexCliAdapter(),
      shell: new ShellCliAdapter(),
      browser: new BrowserWorkerAdapter(),
      mail: new MailWorkerAdapter(),
      ...(options.workers ?? {}),
    };
    this.verifier = options.verifier ?? new ManagerVerifierAdapter();
    this.fabric = new WorkerFabric(this.workers, this.verifier);
    this.now = options.now ?? (() => new Date());
    this.reasoner = options.reasoner ?? null;
    this.chatResponder = options.chatResponder ?? null;
  }

  private async emitChatBrainEvent(
    observer: ManagerRunObserver,
    missionId: string,
    title: string,
    detail: string,
    kind: ManagerProgressEvent['kind'],
    status: ManagerProgressEvent['status'],
    toolName: string | null = null,
  ): Promise<void> {
    await observer.onProgress?.({
      stage: `chat_brain_${kind}_${status}`,
      actor: toolName ? 'mcp' : 'brain',
      kind,
      status,
      title,
      detail,
      timestamp: this.now().getTime(),
      mission_id: missionId,
      task_id: null,
      decision_kind: 'chat',
      requested_worker: null,
      executed_worker: null,
      blocked_reason_code: null,
      tool_name: toolName,
      server_name: toolName ? 'best-brain' : null,
    });
  }

  private async recallOwnerFacts(
    goal: string,
    missionId: string,
    observer: ManagerRunObserver,
    force: Partial<ReturnType<typeof classifyOwnerRecall>> = {},
  ): Promise<ReturnType<typeof summarizeOwnerRecall>> {
    const recall = {
      ...classifyOwnerRecall(goal),
      ...force,
    };
    const consults = [];

    if (recall.asksName) {
      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Reading from brain memory',
        'Resolving the owner name from brain memory.',
        'memory_read',
        'started',
        'brain_consult',
      );
      const response = await this.brain.consult({
        query: 'owner name',
        domain: 'best-brain',
        consumer: 'chat',
        bundle_profile: 'chat_direct',
        limit: 5,
      });
      consults.push(response);
      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Brain memory read completed',
        `Resolved ${response.citations.length} candidate memories for the owner name.`,
        'memory_read',
        'completed',
        'brain_consult',
      );
    }

    if (recall.asksInvestorStyle) {
      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Reading from brain memory',
        'Resolving the owner investing style from brain memory.',
        'memory_read',
        'started',
        'brain_consult',
      );
      const response = await this.brain.consult({
        query: 'owner investor style',
        domain: 'best-brain',
        consumer: 'chat',
        bundle_profile: 'chat_direct',
        limit: 5,
      });
      consults.push(response);
      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Brain memory read completed',
        `Resolved ${response.citations.length} candidate memories for the owner investing style.`,
        'memory_read',
        'completed',
        'brain_consult',
      );
    }

    return summarizeOwnerRecall(consults);
  }

  private async handleChatMemoryUpdate(
    goal: string,
    missionId: string,
    observer: ManagerRunObserver,
  ): Promise<string | null> {
    const extraction = extractChatMemoryFacts(goal);
    if (extraction.clarificationQuestion) {
      return extraction.clarificationQuestion;
    }
    if (extraction.facts.length === 0) {
      return null;
    }

    for (const fact of extraction.facts) {
      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Writing to brain memory',
        `Saving ${
          fact.kind === 'owner_name'
            ? 'owner identity'
            : fact.kind === 'investor_style'
              ? 'owner investing style'
              : 'report format preference'
        } to brain memory.`,
        'memory_write',
        'started',
        'brain_learn',
      );
      const result = await this.brain.learn(fact.learnRequest);
      await this.emitChatBrainEvent(
        observer,
        missionId,
        result.accepted ? 'Brain memory updated' : 'Brain memory update rejected',
        result.reason,
        'memory_write',
        result.accepted ? 'completed' : 'failed',
        'brain_learn',
      );
    }

    const recalled = await this.recallOwnerFacts(goal, missionId, observer, {
      asksName: extraction.facts.some((fact) => fact.kind === 'owner_name'),
      asksInvestorStyle: extraction.facts.some((fact) => fact.kind === 'investor_style'),
    });

    const fallbackName = extraction.facts.find((fact) => fact.kind === 'owner_name')?.value ?? null;
    const fallbackInvestorStyle = extraction.facts.find((fact) => fact.kind === 'investor_style')?.value ?? null;
    const fallbackPreferredFormat = extraction.facts.find((fact) => fact.kind === 'report_format_preference')?.value ?? null;

    return buildMemoryUpdateAnswer(goal, {
      name: recalled.name ?? fallbackName,
      investorStyle: recalled.investorStyle ?? fallbackInvestorStyle,
      preferredFormat: fallbackPreferredFormat,
    });
  }

  private async handleChatAutoLearn(
    goal: string,
    chatMode: string | null | undefined,
    missionId: string,
    observer: ManagerRunObserver,
  ): Promise<void> {
    const requests = extractChatAutoLearnRequests(goal, chatMode);
    if (requests.length === 0) {
      return;
    }

    const dedupe = new Set<string>();
    for (const request of requests) {
      const key = `${request.learnRequest.memory_subtype ?? 'none'}|${request.learnRequest.content}`;
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);

      await this.emitChatBrainEvent(
        observer,
        missionId,
        'Writing to brain memory',
        `Auto-learning ${request.kind.replaceAll('_', ' ')} from chat context.`,
        'memory_write',
        'started',
        'brain_learn',
      );
      try {
        const result = await this.brain.learn(request.learnRequest);
        await this.emitChatBrainEvent(
          observer,
          missionId,
          result.accepted ? 'Brain memory updated' : 'Brain memory update rejected',
          result.reason,
          'memory_write',
          result.accepted ? 'completed' : 'failed',
          'brain_learn',
        );
      } catch (error) {
        await this.emitChatBrainEvent(
          observer,
          missionId,
          'Brain memory update failed',
          error instanceof Error ? error.message : String(error),
          'memory_write',
          'failed',
          'brain_learn',
        );
      }
    }
  }

  private shouldInvokeReasoner(
    input: ManagerInput,
    _decision: ManagerDecision,
    _ambiguity: ReturnType<typeof detectGoalAmbiguity>,
  ): boolean {
    if (!this.reasoner) {
      return false;
    }

    return !input.dry_run && !input.no_execute;
  }

  async run(
    rawInput: Pick<ManagerInput, 'goal'> & Partial<Omit<ManagerInput, 'goal'>>,
    observer: ManagerRunObserver = {},
  ): Promise<ManagerRunResult> {
    const input = normalizeInput(rawInput);
    const runtimeSpine = new LocalRuntimeSpine();
    const existingMissionId = input.mission_id;
    const missionId = existingMissionId ?? createId('mission');
    const emitProgress = async (
      event: Omit<ManagerProgressEvent, 'timestamp' | 'mission_id' | 'task_id' | 'decision_kind' | 'requested_worker' | 'executed_worker' | 'blocked_reason_code' | 'kind'>
      & Partial<Pick<ManagerProgressEvent, 'mission_id' | 'task_id' | 'decision_kind' | 'requested_worker' | 'executed_worker' | 'blocked_reason_code'>>,
    ): Promise<void> => {
      if (!observer.onProgress) {
        return;
      }

      const inferredKind: ManagerProgressEvent['kind'] =
        event.stage.startsWith('verification')
          ? 'verification'
          : event.status === 'failed'
            ? 'error'
            : event.status === 'completed'
              ? 'result'
              : 'status';

      await observer.onProgress({
        timestamp: this.now().getTime(),
        kind: inferredKind,
        mission_id: event.mission_id ?? missionId,
        task_id: event.task_id ?? null,
        decision_kind: event.decision_kind ?? null,
        requested_worker: event.requested_worker ?? null,
        executed_worker: event.executed_worker ?? null,
        blocked_reason_code: event.blocked_reason_code ?? null,
        ...event,
      });
    };

    await emitProgress({
      stage: 'manager_receive',
      status: 'started',
      actor: 'manager',
      title: 'Manager received the request',
      detail: 'Preparing brain access and classifying the message.',
    });
    await this.brain.ensureAvailable();
    await emitProgress({
      stage: 'brain_ready',
      status: 'completed',
      actor: 'brain',
      title: 'Brain connection is ready',
      detail: this.brain.wasStartedByAdapter()
        ? 'The local brain server was started automatically.'
        : 'The local brain server was already available.',
    });
    const startedBrainServer = this.brain.wasStartedByAdapter();
    let decision = routeIntent(input);
    const heuristicDecision = decision;
    let aiTriage: ManagerTriageResult | null = null;
    await emitProgress({
      stage: 'brain_consult',
      status: 'started',
      actor: 'brain',
      title: 'Consulting memory',
      detail: 'Collecting owner context, patterns, and relevant facts.',
      decision_kind: decision.kind,
    });
    let consult = await this.brain.consult({
      query: input.goal,
      mission_id: existingMissionId,
      domain: 'best-brain',
      limit: 5,
      consumer: 'manager',
      bundle_profile: 'manager_plan',
    });
    await emitProgress({
      stage: 'brain_consult',
      status: 'completed',
      actor: 'brain',
      title: 'Memory context loaded',
      detail: `Retrieved ${consult.citations.length} supporting memory citations.`,
      decision_kind: decision.kind,
    });
    if (isThaiEquitiesActualManagerGoal(input.goal)) {
      await emitProgress({
        stage: 'brain_consult_persona',
        status: 'started',
        actor: 'brain',
        title: 'Deepening owner context',
        detail: 'Expanding persona and screening context for the stock mission.',
        decision_kind: decision.kind,
      });
      const personaConsult = await this.brain.consult({
        query: `If you were the owner, what investment persona and screening criteria should guide this Thai equities stock scanner mission? Goal: ${input.goal}`,
        mission_id: null,
        domain: 'best-brain',
        limit: 8,
        consumer: 'manager',
        bundle_profile: 'manager_plan',
      });
      consult = mergeConsultResponses(consult, personaConsult);
      await emitProgress({
        stage: 'brain_consult_persona',
        status: 'completed',
        actor: 'brain',
        title: 'Owner investment context expanded',
        detail: `The manager merged ${personaConsult.citations.length} additional persona-oriented citations.`,
        decision_kind: decision.kind,
      });
    }
    await emitProgress({
      stage: 'brain_context',
      status: 'started',
      actor: 'brain',
      title: 'Loading mission context',
      detail: 'Checking recent mission history, verification state, and working context.',
      decision_kind: decision.kind,
    });
    const context = await this.brain.context({
      mission_id: existingMissionId,
      domain: 'best-brain',
      query: input.goal,
    });
    await emitProgress({
      stage: 'brain_context',
      status: 'completed',
      actor: 'brain',
      title: 'Mission context loaded',
      detail: `Loaded ${context.history.length} mission history entries.`,
      decision_kind: decision.kind,
    });
    const initialAmbiguity = detectGoalAmbiguity(input, decision);
    const reasoner = this.reasoner;
    if (reasoner && this.shouldInvokeReasoner(input, decision, initialAmbiguity)) {
      await emitProgress({
        stage: 'triage',
        status: 'started',
        actor: 'manager',
        title: 'Deciding how to handle the request',
        detail: 'Evaluating whether this should stay chat, become a task, or turn into a mission.',
        decision_kind: decision.kind,
      });
      aiTriage = await reasoner.triage({
        goal: input.goal,
        cwd: input.cwd,
        heuristic: decision,
        consult,
        context,
      }, {
        onTrace: observer.onProgress,
      });
      if (aiTriage) {
        const preserveChatMemoryHeuristic =
          heuristicDecision.kind === 'chat'
          && heuristicDecision.chat_mode === 'chat_memory_update'
          && aiTriage.kind !== 'chat';
        decision = preserveChatMemoryHeuristic
          ? heuristicDecision
          : {
              kind: aiTriage.kind,
              chat_mode: aiTriage.kind === 'chat' ? aiTriage.chat_mode : null,
              should_execute: aiTriage.kind !== 'chat' && !input.dry_run && !input.no_execute,
              selected_worker: aiTriage.kind === 'chat' ? null : selectWorker(input.goal, input.worker_preference),
              reason: aiTriage.reason,
              verification_required: aiTriage.kind !== 'chat',
              blocked_reason: null,
              blocked_reason_code: null,
            };
      }
      await emitProgress({
        stage: 'triage',
        status: 'completed',
        actor: 'manager',
        title: 'Routing decision ready',
        detail: aiTriage
          ? `The AI manager chose ${aiTriage.kind}.`
          : `Heuristic routing kept the request as ${decision.kind}.`,
        decision_kind: aiTriage?.kind ?? decision.kind,
        requested_worker: decision.selected_worker,
      });
    }
    if (input.force_mission && decision.kind === 'chat') {
      decision = {
        kind: 'mission',
        chat_mode: null,
        should_execute: !input.dry_run && !input.no_execute,
        selected_worker: selectWorker(input.goal, input.worker_preference),
        reason: 'Mission launch was requested from control-room and must not stay in chat mode.',
        verification_required: true,
        blocked_reason: null,
        blocked_reason_code: null,
      };
      await emitProgress({
        stage: 'force_mission',
        status: 'info',
        actor: 'manager',
        title: 'Mission mode was forced',
        detail: 'Control-room launch overrides chat routing so execution can proceed through mission rails.',
        decision_kind: decision.kind,
        requested_worker: decision.selected_worker,
      });
    }
    const ambiguity = detectGoalAmbiguity(input, decision);
    if (ambiguity.is_ambiguous && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(decision, ambiguity.reason, 'ambiguous_goal');
      await emitProgress({
        stage: 'ambiguity',
        status: 'blocked',
        actor: 'manager',
        title: 'Mission blocked for clarification',
        detail: ambiguity.reason,
        decision_kind: decision.kind,
        blocked_reason_code: 'ambiguous_goal',
      });
    }

    if (decision.kind !== 'chat') {
      await emitProgress({
        stage: 'brain_consult_failure',
        status: 'started',
        actor: 'brain',
        title: 'Loading failure lessons',
        detail: 'Checking reusable failure patterns before compiling the mission.',
        decision_kind: decision.kind,
      });
      const failureConsult = await this.brain.consult({
        query: `failure lessons for mission kind ${decision.kind}: ${input.goal}`,
        mission_id: existingMissionId,
        domain: 'best-brain',
        limit: 5,
        consumer: 'manager',
        bundle_profile: 'manager_plan',
      });
      consult = mergeConsultResponses(consult, failureConsult);
      await emitProgress({
        stage: 'brain_consult_failure',
        status: 'completed',
        actor: 'brain',
        title: 'Failure context loaded',
        detail: `Merged ${failureConsult.citations.length} failure-oriented citations into the mission context.`,
        decision_kind: decision.kind,
      });
    }

    const brief = compileMissionBrief({
      input,
      consult,
      context,
      decision,
    }, missionId);
    await emitProgress({
      stage: 'mission_brief',
      status: 'completed',
      actor: 'manager',
      title: 'Mission brief compiled',
      detail: `Built mission brief for ${brief.mission_kind} with ${brief.execution_plan.length} planned step${brief.execution_plan.length === 1 ? '' : 's'}.`,
      decision_kind: decision.kind,
      requested_worker: brief.selected_worker,
    });
    const briefValidation = validateMissionBrief(brief);
    let missionGraph = updateTaskStatus(
      brief.mission_graph,
      'context_review',
      'completed',
      brief.brain_citations.map((citation) => citation.memory_id),
    );
    brief.mission_graph = missionGraph;
    let runtimeBundle = brief.kind === 'chat'
      ? null
      : runtimeSpine.openSession({
          missionId,
          missionDefinitionId: brief.mission_definition_id,
          acceptanceProfileId: brief.acceptance_profile_id,
          reportContractId: brief.report_contract_id,
          acceptanceRunId: `${brief.acceptance_profile_id}:${missionId}`,
          workspaceRoot: input.cwd,
          owner: 'manager-alpha',
        });

    if (runtimeBundle) {
      runtimeSpine.recordEvent({
        task_id: 'context_review',
        event_type: 'mission_brief_compiled',
        actor: 'manager',
        detail: `Compiled mission brief using playbook ${brief.playbook.id}.`,
        data: {
          mission_kind: brief.mission_kind,
          playbook_id: brief.playbook.id,
          trace_id: brief.brain_trace_id,
        },
      });
      if (brief.mission_graph.nodes.some((node) => node.id === 'data_selection')) {
        const adapterArtifacts = brief.input_adapter_decisions
          .filter((decision) => decision.decision === 'selected')
          .map((decision) => ({
            type: 'other' as const,
            ref: `input-adapter://${decision.selected_adapter_id}`,
            description: decision.reason,
          }));
        if (adapterArtifacts.length > 0) {
          runtimeSpine.recordVerificationArtifacts('data_selection', 'manager', adapterArtifacts);
        }
        missionGraph = updateTaskStatus(
          missionGraph,
          'data_selection',
          brief.input_adapter_decisions.some((adapterDecision) => adapterDecision.decision === 'blocked') ? 'failed' : 'completed',
          adapterArtifacts.map((artifact) => artifact.ref),
        );
        brief.mission_graph = missionGraph;
        runtimeSpine.recordEvent({
          task_id: 'data_selection',
          event_type: 'input_adapters_resolved',
          actor: 'manager',
          detail: 'Resolved input adapters for the proving mission framework.',
          data: {
            input_adapter_decisions: brief.input_adapter_decisions,
          },
        });
      }
      runtimeSpine.recordVerificationArtifacts(
        'context_review',
        'brain',
        brief.brain_citations.flatMap((citation) => citation.evidence_ref),
      );
      runtimeBundle = runtimeSpine.snapshot();
    }

    if (!briefValidation.is_complete && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(
        decision,
        `Mission brief is incomplete: ${briefValidation.missing_fields.join(', ')}.`,
        'policy_rejection',
      );
      await emitProgress({
        stage: 'mission_brief',
        status: 'blocked',
        actor: 'manager',
        title: 'Mission brief failed policy checks',
        detail: `Missing required fields: ${briefValidation.missing_fields.join(', ')}.`,
        decision_kind: decision.kind,
        blocked_reason_code: 'policy_rejection',
      });
    }
    if (brief.missing_exact_keys.length > 0 && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(
        decision,
        `Required exact facts are missing: ${brief.missing_exact_keys.join(', ')}.`,
        'missing_exact_fact',
      );
      await emitProgress({
        stage: 'exact_facts',
        status: 'blocked',
        actor: 'manager',
        title: 'Required exact facts are missing',
        detail: brief.missing_exact_keys.join(', '),
        decision_kind: decision.kind,
        blocked_reason_code: 'missing_exact_fact',
      });
    }
    if (brief.conflicting_exact_keys.length > 0 && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(
        decision,
        `Required exact facts conflict: ${brief.conflicting_exact_keys.join(', ')}.`,
        'conflicting_exact_fact',
      );
      await emitProgress({
        stage: 'exact_facts',
        status: 'blocked',
        actor: 'manager',
        title: 'Required exact facts conflict',
        detail: brief.conflicting_exact_keys.join(', '),
        decision_kind: decision.kind,
        blocked_reason_code: 'conflicting_exact_fact',
      });
    }

    const blockedInputDecision = brief.input_adapter_decisions.find((adapterDecision) => adapterDecision.decision === 'blocked' && adapterDecision.blocked_reason != null);
    if (blockedInputDecision && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(
        decision,
        blockedInputDecision.reason,
        blockedInputDecision.blocked_reason,
      );
      await emitProgress({
        stage: 'input_selection',
        status: 'blocked',
        actor: 'manager',
        title: 'Input adapter resolution blocked the mission',
        detail: blockedInputDecision.reason,
        decision_kind: decision.kind,
        blocked_reason_code: blockedInputDecision.blocked_reason,
      });
    }

    if (!decision.should_execute) {
      const forceBrainAwareChat = decision.kind === 'chat'
        && (decision.chat_mode === 'chat_memory_update' || shouldUseBrainAwareChat(input.goal));
      let directMemoryUpdateResponse: string | null = null;
      let directOwnerRecallResponse: string | null = null;
      if (decision.kind === 'chat') {
        await emitProgress({
          stage: 'chat_response',
          status: 'started',
          actor: 'manager',
          title: 'Preparing a direct answer',
          detail: forceBrainAwareChat
            ? (decision.chat_mode === 'chat_memory_update'
              ? 'Using brain-aware chat to update or correct owner memory before answering.'
              : 'Using brain-aware chat so the response can read or write memory when needed.')
            : 'Answering directly without escalating to a mission.',
          decision_kind: decision.kind,
        });

        if (shouldPreferLocalMemoryUpdate(input.goal, decision.chat_mode)) {
          directMemoryUpdateResponse = await this.handleChatMemoryUpdate(input.goal, missionId, observer);
        }
      }
      const directChatResponse = decision.kind === 'chat'
        && directMemoryUpdateResponse == null
        && (forceBrainAwareChat || aiTriage?.direct_answer == null)
        && this.chatResponder
        ? await this.chatResponder.answer({
            goal: input.goal,
            cwd: input.cwd,
            consult,
            context,
            chatMode: decision.chat_mode,
          }, {
            onTrace: observer.onProgress,
          })
        : null;
      if (
        decision.kind === 'chat'
        && directMemoryUpdateResponse == null
        && shouldAttemptDirectOwnerRecall(input.goal)
      ) {
        const recalled = await this.recallOwnerFacts(input.goal, missionId, observer);
        const recallAnswer = buildOwnerRecallAnswer(input.goal, {
          name: recalled.name,
          investorStyle: recalled.investorStyle,
        });
        if (recallAnswer && (looksLikeUnusableChatAnswer(directChatResponse) || directChatResponse == null)) {
          directOwnerRecallResponse = recallAnswer;
        }
      }
      const ownerResponse = decision.kind === 'chat'
        ? (directMemoryUpdateResponse
          ?? directOwnerRecallResponse
          ?? directChatResponse
          ?? aiTriage?.direct_answer
          ?? buildChatOwnerResponse(input.goal, consult, context))
        : decision.blocked_reason
          ? decision.blocked_reason
          : `Planned ${brief.kind} path. Next: ${brief.execution_plan[0] ?? 'Review the mission brief.'}`;
      if (decision.kind === 'chat' && directMemoryUpdateResponse == null) {
        await this.handleChatAutoLearn(input.goal, decision.chat_mode, missionId, observer);
      }
      await emitProgress({
        stage: decision.kind === 'chat' ? 'chat_response' : 'planning_only',
        status: decision.kind === 'chat' ? 'completed' : decision.blocked_reason ? 'blocked' : 'completed',
        actor: 'manager',
        title: decision.kind === 'chat' ? 'Direct answer ready' : decision.blocked_reason ? 'Mission stopped before execution' : 'Planning run completed',
        detail: decision.kind === 'chat'
          ? 'The manager is returning the response directly.'
          : decision.blocked_reason ?? 'Planning completed without execution.',
        decision_kind: decision.kind,
        blocked_reason_code: decision.blocked_reason_code,
      });
      if (runtimeBundle) {
        runtimeSpine.finalize(
          decision.blocked_reason ? 'aborted' : 'completed',
          decision.blocked_reason ?? 'Planning-only manager run completed without execution.',
          {
            blocked_reason: decision.blocked_reason,
            dry_run: input.dry_run,
            no_execute: input.no_execute,
          },
        );
        runtimeBundle = runtimeSpine.snapshot();
      }

      return finalizeRun(
        input,
        decision,
        ambiguity,
        brief,
        briefValidation,
        missionGraph,
        runtimeBundle,
        null,
        null,
        [],
        ownerResponse,
        startedBrainServer,
      );
    }

    const brainWrites: BrainWriteRecord[] = [];
    const plannerHistory: PlannerExecutionHistoryEntry[] = [];
    const dispatchedWorkerResults: WorkerExecutionResult[] = [];
    const dispatchedRequests: ExecutionRequest[] = [];

    while (true) {
      const executionRequest = buildExecutionRequest(brief, input.cwd, plannerHistory);
      if (!executionRequest) {
        break;
      }

      dispatchedRequests.push(executionRequest);
      missionGraph = updateTaskStatus(missionGraph, executionRequest.task_id, 'running');
      brief.mission_graph = missionGraph;
      if (runtimeBundle) {
        runtimeSpine.recordEvent({
          task_id: executionRequest.task_id,
          event_type: 'worker_dispatched',
          actor: 'manager',
          detail: `Dispatched ${executionRequest.selected_worker} for ${executionRequest.task_id}.`,
          data: {
            task_title: executionRequest.task_title,
            playbook_id: executionRequest.playbook_id,
            expected_artifacts: executionRequest.expected_artifacts,
            requested_worker: executionRequest.selected_worker,
            worker_chain: this.fabric.primaryWorkerChain(executionRequest),
          },
        });
        runtimeBundle = runtimeSpine.snapshot();
      }
      await emitProgress({
        stage: 'worker_dispatch',
        status: 'started',
        actor: 'manager',
        title: `Dispatching ${executionRequest.selected_worker}`,
        detail: executionRequest.task_title,
        decision_kind: decision.kind,
        requested_worker: executionRequest.selected_worker,
        task_id: executionRequest.task_id,
      });

      const primaryDispatch = await this.fabric.dispatchPrimary(executionRequest, {
        onTrace: observer.onProgress,
      });
      const workerResult = primaryDispatch.manager_result;
      dispatchedWorkerResults.push(workerResult);
      plannerHistory.push({
        task_id: executionRequest.task_id,
        worker: primaryDispatch.executed_worker,
        status: workerResult.status,
        summary: workerResult.summary,
        artifact_refs: artifactRefs(workerResult),
      });
      const primaryWorkerTask = runtimeBundle
        ? runtimeSpine.startWorkerTask({
            task_id: executionRequest.task_id,
            worker: primaryDispatch.executed_worker,
            requested_worker: primaryDispatch.requested_worker,
            fallback_from: primaryDispatch.executed_worker !== primaryDispatch.requested_worker
              ? primaryDispatch.requested_worker
              : null,
            execution_mode: this.fabric.definitions[primaryDispatch.executed_worker].execution_mode,
            objective: executionRequest.task_title,
            playbook_id: executionRequest.playbook_id,
            verifier_owned: false,
          })
        : null;
      missionGraph = updateTaskStatus(
        missionGraph,
        executionRequest.task_id,
        workerResult.status === 'success' ? 'completed' : 'failed',
        artifactRefs(workerResult),
      );
      brief.mission_graph = missionGraph;
      if (runtimeBundle) {
        if (primaryDispatch.executed_worker !== primaryDispatch.requested_worker) {
          runtimeSpine.recordEvent({
            task_id: executionRequest.task_id,
            event_type: 'worker_fallback_applied',
            actor: 'manager',
            detail: `Fell back from ${primaryDispatch.requested_worker} to ${primaryDispatch.executed_worker}.`,
            data: {
              requested_worker: primaryDispatch.requested_worker,
              executed_worker: primaryDispatch.executed_worker,
              attempted_workers: workerResult.attempted_workers ?? primaryDispatch.chain,
              fallback_reason: workerResult.fallback_reason,
            },
          });
        }
        const runtimeArtifacts = runtimeSpine.recordVerificationArtifacts(
          executionRequest.task_id,
          primaryDispatch.executed_worker,
          workerResult.artifacts,
        );
        if (workerResult.invocation) {
          runtimeSpine.recordCompletedProcess({
            actor: primaryDispatch.executed_worker,
            command: workerResult.invocation.command,
            args: workerResult.invocation.args,
            cwd: workerResult.invocation.cwd ?? executionRequest.cwd,
            status: mapWorkerStatusToRuntimeStatus(workerResult.status),
            exit_code: workerResult.invocation.exit_code ?? (workerResult.status === 'success' ? 0 : 1),
            stdout: workerResult.process_output?.stdout ?? workerResult.raw_output,
            stderr: workerResult.process_output?.stderr ?? (workerResult.status === 'success' ? null : workerResult.summary),
            task_id: executionRequest.task_id,
            started_at: workerResult.invocation.started_at,
            completed_at: workerResult.invocation.completed_at,
          });
        }
        if (primaryWorkerTask) {
          runtimeSpine.completeWorkerTask({
            worker_task_id: primaryWorkerTask.id,
            status: primaryDispatch.task_result.status,
            summary: primaryDispatch.task_result.summary,
            artifact_refs: primaryDispatch.task_result.artifacts.map((artifact) => artifact.ref),
            check_names: primaryDispatch.task_result.checks.map((check) => check.name),
            retry_recommendation: primaryDispatch.task_result.retry_recommendation,
            invocation_command: primaryDispatch.task_result.invocation?.command ?? null,
            invocation_args: primaryDispatch.task_result.invocation?.args ?? [],
          });
        }
        runtimeSpine.createCheckpoint({
          label: `after_${executionRequest.task_id}`,
          artifact_ids: runtimeArtifacts.map((artifact) => artifact.id),
          restore_supported: true,
        });
        runtimeSpine.setSessionStatus('active');
        runtimeSpine.recordEvent({
          task_id: executionRequest.task_id,
          event_type: 'worker_completed',
          actor: primaryDispatch.executed_worker,
          detail: `${executionRequest.task_id} completed with status ${workerResult.status}.`,
          data: {
            proposed_checks: workerResult.proposed_checks.length,
            requested_worker: primaryDispatch.requested_worker,
            executed_worker: primaryDispatch.executed_worker,
          },
        });
        runtimeBundle = runtimeSpine.snapshot();
      }
      await emitProgress({
        stage: primaryDispatch.executed_worker !== primaryDispatch.requested_worker ? 'worker_fallback' : 'worker_dispatch',
        status: 'completed',
        actor: primaryDispatch.executed_worker,
        title: primaryDispatch.executed_worker !== primaryDispatch.requested_worker
          ? `Fell back to ${primaryDispatch.executed_worker}`
          : `${primaryDispatch.executed_worker} completed ${executionRequest.task_id}`,
        detail: workerResult.summary,
        decision_kind: decision.kind,
        requested_worker: primaryDispatch.requested_worker,
        executed_worker: primaryDispatch.executed_worker,
        task_id: executionRequest.task_id,
      });

      if (workerResult.status !== 'success') {
        break;
      }
    }

    if (dispatchedRequests.length === 0) {
      await emitProgress({
        stage: 'execution_plan',
        status: 'failed',
        actor: 'manager',
        title: 'No executable task was available',
        detail: 'The mission graph did not expose a runnable worker task.',
        decision_kind: decision.kind,
      });
      if (runtimeBundle) {
        runtimeSpine.finalize('aborted', 'No executable task was ready in the mission graph.', {});
        runtimeBundle = runtimeSpine.snapshot();
      }
      return finalizeRun(
        input,
        decision,
        ambiguity,
        brief,
        briefValidation,
        missionGraph,
        runtimeBundle,
        null,
        null,
        [],
        'No executable task was ready in the mission graph.',
        startedBrainServer,
      );
    }

    const verificationRequestSource = dispatchedRequests[dispatchedRequests.length - 1]!;
    const workerResult = mergeWorkerResults(dispatchedWorkerResults);

    const verifierWorkerTask = runtimeBundle
      ? runtimeSpine.startWorkerTask({
          task_id: 'verification_gate',
          worker: 'verifier',
          execution_mode: this.fabric.definitions.verifier.execution_mode,
          objective: 'Verify the mission result against the playbook checklist.',
          playbook_id: verificationRequestSource.playbook_id,
          verifier_owned: true,
        })
      : null;
    await emitProgress({
      stage: 'verification',
      status: 'started',
      actor: 'verifier',
      title: 'Running verification',
      detail: 'Checking evidence, verification gates, and final proof requirements.',
      decision_kind: decision.kind,
      executed_worker: workerResult.executed_worker ?? null,
      task_id: 'verification_gate',
    });
    const verifierDispatch = await this.fabric.dispatchVerifier(verificationRequestSource, workerResult);
    const verificationRequest = verifierDispatch.verification_request;
    assertCompletionPolicy(verificationRequest);
    if (runtimeBundle) {
      runtimeSpine.recordEvent({
        task_id: 'verification_gate',
        event_type: 'verification_requested',
        actor: 'manager',
        detail: `Verification prepared with status ${verificationRequest.status}.`,
        data: {
          checks: verificationRequest.verification_checks.length,
          evidence: verificationRequest.evidence.length,
        },
      });
      runtimeBundle = runtimeSpine.snapshot();
    }
    await emitProgress({
      stage: 'verification',
      status: verificationRequest.status === 'verified_complete' ? 'completed' : verificationRequest.status === 'rejected' ? 'blocked' : 'failed',
      actor: 'verifier',
      title: `Verification ${verificationRequest.status}`,
      detail: verificationRequest.summary,
      decision_kind: decision.kind,
      executed_worker: workerResult.executed_worker ?? null,
      task_id: 'verification_gate',
    });

    const strictOutcome = validateMissionOutcomeStrictInput({
      mission_id: missionId,
      objective: brief.goal,
      mission_kind: brief.mission_kind,
      result_summary: workerResult.summary,
      evidence: verificationRequest.evidence,
      verification_checks: verificationRequest.verification_checks,
      status: 'in_progress',
      domain: 'best-brain',
      reused_memory_ids: Array.from(new Set([
        ...brief.brain_citations.map((citation) => citation.memory_id),
        ...(consult.retrieval_bundle?.exact_hits ?? []).map((citation) => citation.memory_id),
        ...(consult.retrieval_bundle?.approach_bundle ?? []).map((citation) => citation.memory_id),
      ])),
    }) as StrictMissionOutcomeInput;

    const outcomeResult = await this.brain.saveOutcome(strictOutcome);
    brainWrites.push(createBrainWriteRecord(
      'save_outcome',
      'success',
      `Mission outcome saved with mission status ${outcomeResult.mission.status}.`,
      outcomeResult,
    ));

    const startedVerification = await this.brain.startVerification({
      mission_id: missionId,
      requested_by: 'manager-alpha',
      checks: verificationRequest.verification_checks,
    });
    brainWrites.push(createBrainWriteRecord(
      'start_verification',
      'success',
      `Verification started with status ${startedVerification.status}.`,
      startedVerification,
    ));

    const verificationResult = await this.brain.completeVerification({
      mission_id: missionId,
      status: verificationRequest.status,
      summary: verificationRequest.summary,
      evidence: verificationRequest.evidence,
      verification_checks: verificationRequest.verification_checks,
    });
    brainWrites.push(createBrainWriteRecord(
      'complete_verification',
      'success',
      `Verification finished with status ${verificationResult.status}.`,
      verificationResult,
    ));
    await emitProgress({
      stage: 'brain_write',
      status: 'completed',
      actor: 'brain',
      title: 'Mission outcome and verification were saved',
      detail: `Verification finished with status ${verificationResult.status}.`,
      decision_kind: decision.kind,
      executed_worker: workerResult.executed_worker ?? null,
    });
    missionGraph = updateTaskStatus(
      missionGraph,
      'verification_gate',
      verificationResult.status === 'verified_complete' ? 'completed' : 'failed',
      verificationRequest.evidence.map((artifact) => artifact.ref),
    );
    brief.mission_graph = missionGraph;
    if (verificationResult.status === 'verified_complete') {
      missionGraph = updateTaskStatus(
        missionGraph,
        'final_report',
        'completed',
        verificationRequest.evidence.map((artifact) => artifact.ref),
      );
      brief.mission_graph = missionGraph;
    }
    if (runtimeBundle) {
      const verificationArtifacts = runtimeSpine.recordVerificationArtifacts(
        'verification_gate',
        'verifier',
        verificationRequest.evidence,
      );
      if (verifierWorkerTask) {
        runtimeSpine.completeWorkerTask({
          worker_task_id: verifierWorkerTask.id,
          status: verifierDispatch.task_result.status,
          summary: verifierDispatch.task_result.summary,
          artifact_refs: verifierDispatch.task_result.artifacts.map((artifact) => artifact.ref),
          check_names: verifierDispatch.task_result.checks.map((check) => check.name),
          retry_recommendation: verifierDispatch.task_result.retry_recommendation,
          invocation_command: verifierDispatch.task_result.invocation?.command ?? null,
          invocation_args: verifierDispatch.task_result.invocation?.args ?? [],
        });
      }
      runtimeSpine.createCheckpoint({
        label: 'after_verification',
        artifact_ids: verificationArtifacts.map((artifact) => artifact.id),
        restore_supported: verificationResult.status !== 'verified_complete',
      });
      let restoredCheckpointId: string | null = null;
      if (verificationResult.status === 'verification_failed') {
        const restorableCheckpoint = runtimeSpine.latestRestorableCheckpoint();
        if (restorableCheckpoint) {
          runtimeBundle = runtimeSpine.restoreCheckpoint(restorableCheckpoint.id);
          restoredCheckpointId = restorableCheckpoint.id;
        }
      }
      const finalReport = buildMissionReportDocument({
        brief,
        workerResult,
        verificationResult,
        blockedReason: decision.blocked_reason,
        evidence: verificationRequest.evidence,
        verificationChecks: verificationRequest.verification_checks,
      });
      runtimeSpine.recordFinalReportArtifact({
        task_id: 'final_report',
        uri: finalReport.artifact_ref,
        description: finalReport.sections.result_summary,
      });
      missionGraph = updateTaskStatus(
        missionGraph,
        'final_report',
        'completed',
        [finalReport.artifact_ref],
      );
      brief.mission_graph = missionGraph;
      runtimeSpine.finalize(
        verificationResult.status === 'verified_complete' ? 'completed' : 'failed',
        `Runtime session finalized after verification status ${verificationResult.status}.`,
        {
          verification_status: verificationResult.status,
          evidence_count: verificationResult.evidence_count,
          checks_total: verificationResult.checks_total,
          restored_checkpoint_id: restoredCheckpointId,
          report_contract_id: brief.report_contract_id,
          final_report_artifact_ref: finalReport.artifact_ref,
        },
      );
      runtimeBundle = runtimeSpine.snapshot();
    }

    if (verificationResult.status === 'verified_complete') {
      await emitProgress({
        stage: 'learning_capture',
        status: 'started',
        actor: 'brain',
        title: 'Capturing post-mission learnings',
        detail: 'Evaluating failure-safe procedure and cross-mission learning candidates.',
        decision_kind: decision.kind,
      });

      const kindTag = missionKindTag(brief.mission_kind);
      const historyConsult = await this.brain.consult({
        query: `verified mission outcomes for mission kind ${brief.mission_kind}`,
        domain: 'best-brain',
        limit: 12,
        consumer: 'manager',
        bundle_profile: 'manager_plan',
      });
      const verifiedKindOutcomes = historyConsult.selected_memories.filter((memory) => (
        memory.memory_type === 'MissionMemory'
        && memory.verified_by === 'verifier'
        && hasTag(memory.tags, kindTag)
      ));

      const existingProcedureConsult = await this.brain.consult({
        query: `active procedure for mission kind ${brief.mission_kind}`,
        domain: 'best-brain',
        limit: 8,
        consumer: 'manager',
        bundle_profile: 'manager_plan',
      });
      const hasActiveProcedure = existingProcedureConsult.selected_memories.some((memory) => (
        memory.memory_type === 'Procedures'
        && memory.status === 'active'
        && hasTag(memory.tags, kindTag)
      ));

      const captureNotes: string[] = [];
      if (verifiedKindOutcomes.length >= 3 && !hasActiveProcedure) {
        const distilled = verifiedKindOutcomes
          .slice(0, 3)
          .map((memory, index) => `${index + 1}. ${memory.summary}`)
          .join('\n');
        const procedureCandidate = await this.brain.learn({
          mode: 'procedure',
          title: `Procedure candidate: ${brief.mission_kind}`,
          content: [
            `Auto-generated after ${verifiedKindOutcomes.length} verified missions of kind ${brief.mission_kind}.`,
            'Observed successful outcomes:',
            distilled || '- No outcome summary captured.',
            'This is a candidate and requires explicit owner confirmation before activation.',
          ].join('\n'),
          source: 'manager://procedure-auto',
          domain: 'best-brain',
          reusable: true,
          mission_id: null,
          tags: ['procedure', 'auto-generated', 'pending-confirmation', kindTag],
          verified_by: 'system_inference',
          confirmed_by_user: false,
          written_by: 'manager',
          memory_subtype: 'procedure.planning',
          status_override: 'candidate',
          evidence_ref: [{
            type: 'note',
            ref: `procedure-candidate://${missionId}`,
            description: 'Auto-generated from repeated verified missions; pending owner confirmation.',
          }],
        });
        brainWrites.push(createBrainWriteRecord(
          'capture_learning',
          procedureCandidate.accepted ? 'success' : 'skipped',
          procedureCandidate.accepted
            ? `Procedure candidate captured for ${brief.mission_kind}.`
            : `Procedure candidate skipped for ${brief.mission_kind}: ${procedureCandidate.reason}`,
          procedureCandidate,
        ));
        captureNotes.push(procedureCandidate.accepted
          ? 'Procedure candidate proposed (pending confirmation).'
          : `Procedure proposal skipped: ${procedureCandidate.reason}`);
      }

      const sourceDomain = strictOutcome.domain;
      const sourceKeys = new Set(brief.brain_citations.flatMap((citation) => citation.entity_keys));
      const crossDomainCandidate = context.durable_memory
        .filter((memory) => memory.domain != null && memory.domain !== sourceDomain)
        .map((memory) => {
          const overlap = memory.entity_keys.filter((key) => sourceKeys.has(key)).length;
          return { memory, overlap };
        })
        .filter((item) => item.overlap >= 2)
        .sort((left, right) => right.overlap - left.overlap)[0];
      if (crossDomainCandidate) {
        const targetDomain = crossDomainCandidate.memory.domain!;
        const crossDomainResult = await this.brain.learn({
          mode: 'domain_memory',
          title: `Cross-domain transfer candidate: ${brief.mission_kind} -> ${targetDomain}`,
          content: [
            `Source mission kind: ${brief.mission_kind}`,
            `Source domain: ${sourceDomain}`,
            `Target domain: ${targetDomain}`,
            `Overlapping entity keys: ${crossDomainCandidate.memory.entity_keys.filter((key) => sourceKeys.has(key)).join(', ')}`,
            `Transfer hypothesis: ${crossDomainCandidate.memory.summary}`,
            'This is a candidate transfer and requires explicit owner confirmation before activation.',
          ].join('\n'),
          source: 'manager://cross-mission-transfer',
          domain: targetDomain,
          reusable: true,
          mission_id: null,
          tags: [
            'domain',
            'cross-mission',
            'auto-generated',
            'pending-confirmation',
            kindTag,
            `source-domain:${slugify(sourceDomain)}`,
            `target-domain:${slugify(targetDomain)}`,
          ],
          verified_by: 'system_inference',
          confirmed_by_user: false,
          written_by: 'manager',
          memory_subtype: 'domain.model',
          status_override: 'candidate',
          evidence_ref: [{
            type: 'note',
            ref: `cross-domain-candidate://${missionId}`,
            description: 'Auto-generated from overlap between verified mission context and another active domain.',
          }],
        });
        brainWrites.push(createBrainWriteRecord(
          'capture_learning',
          crossDomainResult.accepted ? 'success' : 'skipped',
          crossDomainResult.accepted
            ? `Cross-domain learning candidate captured for ${targetDomain}.`
            : `Cross-domain learning skipped: ${crossDomainResult.reason}`,
          crossDomainResult,
        ));
        captureNotes.push(crossDomainResult.accepted
          ? `Cross-domain candidate proposed for ${targetDomain} (pending confirmation).`
          : `Cross-domain proposal skipped: ${crossDomainResult.reason}`);
      }

      await emitProgress({
        stage: 'learning_capture',
        status: 'completed',
        actor: 'brain',
        title: 'Post-mission learning captured',
        detail: captureNotes.length > 0
          ? captureNotes.join(' ')
          : 'No new learning candidate was generated for this mission run.',
        decision_kind: decision.kind,
      });
    }

    if (verificationResult.status !== 'verified_complete') {
      const failureInput = buildFailureWrite(
        brief.goal,
        missionId,
        workerResult,
        verificationResult.status,
        decision.blocked_reason,
      ) as FailureInput;
      const failureResult = await this.brain.saveFailure(failureInput);
      brainWrites.push(createBrainWriteRecord(
        'save_failure',
        'success',
        `Failure lesson stored after ${verificationResult.status}.`,
        failureResult,
      ));
      await emitProgress({
        stage: 'failure_capture',
        status: 'completed',
        actor: 'brain',
        title: 'Failure lesson recorded',
        detail: `Stored a failure lesson after ${verificationResult.status}.`,
        decision_kind: decision.kind,
      });
    }

    await emitProgress({
      stage: 'finalize',
      status: verificationResult.status === 'verified_complete' ? 'completed' : verificationResult.status === 'rejected' ? 'blocked' : 'failed',
      actor: 'manager',
      title: verificationResult.status === 'verified_complete' ? 'Mission finished' : 'Mission finished with issues',
      detail: verificationResult.status === 'verified_complete'
        ? 'The manager finished the mission with verified proof.'
        : `The manager finished with ${verificationResult.status}.`,
      decision_kind: decision.kind,
      executed_worker: workerResult.executed_worker ?? null,
      blocked_reason_code: verificationResult.status === 'rejected' ? decision.blocked_reason_code : null,
    });

    return finalizeRun(
      input,
      decision,
      ambiguity,
      brief,
      briefValidation,
      missionGraph,
      runtimeBundle,
      workerResult,
      verificationResult,
      brainWrites,
      verificationResult.status === 'verified_complete'
        ? workerResult.summary
        : verificationResult.status === 'verification_failed'
          ? `Verification failed. ${workerResult.summary}`
          : workerResult.summary,
      startedBrainServer,
    );
  }

  async dispose(): Promise<void> {
    await this.brain.dispose();
  }
}

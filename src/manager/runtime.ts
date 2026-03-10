import type { FailureInput, StrictMissionOutcomeInput } from '../types.ts';
import { validateMissionOutcomeStrictInput } from '../validation.ts';
import { buildMissionReportDocument } from '../proving/report.ts';
import { LocalRuntimeSpine } from '../runtime/spine.ts';
import { WorkerFabric } from '../workers/fabric.ts';
import { createId } from '../utils/id.ts';
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
import { buildExecutionRequest } from './planner.ts';
import type { BrainAdapter, VerifierAdapter, WorkerAdapter } from './adapters/types.ts';
import { BrainHttpAdapter } from './adapters/brain-http.ts';
import { ClaudeCliAdapter } from './adapters/claude-cli.ts';
import { CodexCliAdapter } from './adapters/codex-cli.ts';
import { ShellCliAdapter } from './adapters/shell-cli.ts';
import { ManagerVerifierAdapter } from './adapters/verifier.ts';
import type {
  BrainWriteRecord,
  ManagerInput,
  ManagerOutputMode,
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
  return value === 'claude' || value === 'codex' || value === 'shell' ? value : 'auto';
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
  };
}

function shouldUseBrainAwareChat(goal: string): boolean {
  return /remember|my name|who am i|what do you know about me|what have you remembered|owner|persona|preference|\u0e08\u0e33\u0e44\u0e27\u0e49|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d\u0e2d\u0e30\u0e44\u0e23|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19|\u0e04\u0e38\u0e13\u0e08\u0e33\u0e2d\u0e30\u0e44\u0e23\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a\u0e09\u0e31\u0e19|\u0e15\u0e31\u0e27\u0e09\u0e31\u0e19/i.test(goal);
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
      ...(options.workers ?? {}),
    };
    this.verifier = options.verifier ?? new ManagerVerifierAdapter();
    this.fabric = new WorkerFabric(this.workers, this.verifier);
    this.now = options.now ?? (() => new Date());
    this.reasoner = options.reasoner ?? null;
    this.chatResponder = options.chatResponder ?? null;
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

  async run(rawInput: Pick<ManagerInput, 'goal'> & Partial<Omit<ManagerInput, 'goal'>>): Promise<ManagerRunResult> {
    const input = normalizeInput(rawInput);
    const runtimeSpine = new LocalRuntimeSpine();
    await this.brain.ensureAvailable();
    const startedBrainServer = this.brain.wasStartedByAdapter();
    let decision = routeIntent(input);
    let aiTriage: ManagerTriageResult | null = null;
    const existingMissionId = input.mission_id;
    let consult = await this.brain.consult({
      query: input.goal,
      mission_id: existingMissionId,
      domain: 'best-brain',
      limit: 5,
    });
    if (isThaiEquitiesActualManagerGoal(input.goal)) {
      const personaConsult = await this.brain.consult({
        query: `If you were the owner, what investment persona and screening criteria should guide this Thai equities stock scanner mission? Goal: ${input.goal}`,
        mission_id: null,
        domain: 'best-brain',
        limit: 8,
      });
      consult = mergeConsultResponses(consult, personaConsult);
    }
    const context = await this.brain.context({
      mission_id: existingMissionId,
      domain: 'best-brain',
      query: input.goal,
    });
    const initialAmbiguity = detectGoalAmbiguity(input, decision);
    const reasoner = this.reasoner;
    if (reasoner && this.shouldInvokeReasoner(input, decision, initialAmbiguity)) {
      aiTriage = await reasoner.triage({
        goal: input.goal,
        cwd: input.cwd,
        heuristic: decision,
        consult,
        context,
      });
      if (aiTriage) {
        decision = {
          kind: aiTriage.kind,
          should_execute: aiTriage.kind !== 'chat' && !input.dry_run && !input.no_execute,
          selected_worker: aiTriage.kind === 'chat' ? null : selectWorker(input.goal, input.worker_preference),
          reason: aiTriage.reason,
          verification_required: aiTriage.kind !== 'chat',
          blocked_reason: null,
          blocked_reason_code: null,
        };
      }
    }
    const missionId = existingMissionId ?? createId('mission');
    const ambiguity = detectGoalAmbiguity(input, decision);
    if (ambiguity.is_ambiguous && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(decision, ambiguity.reason, 'ambiguous_goal');
    }

    const brief = compileMissionBrief({
      input,
      consult,
      context,
      decision,
    }, missionId);
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
    }

    const blockedInputDecision = brief.input_adapter_decisions.find((adapterDecision) => adapterDecision.decision === 'blocked' && adapterDecision.blocked_reason != null);
    if (blockedInputDecision && decision.kind !== 'chat') {
      decision = buildBlockedDecisionWithCode(
        decision,
        blockedInputDecision.reason,
        blockedInputDecision.blocked_reason,
      );
    }

    if (!decision.should_execute) {
      const forceBrainAwareChat = decision.kind === 'chat' && shouldUseBrainAwareChat(input.goal);
      const directChatResponse = decision.kind === 'chat' && (forceBrainAwareChat || aiTriage?.direct_answer == null) && this.chatResponder
        ? await this.chatResponder.answer({
            goal: input.goal,
            cwd: input.cwd,
            consult,
            context,
          })
        : null;
      const ownerResponse = decision.kind === 'chat'
        ? (directChatResponse ?? aiTriage?.direct_answer ?? buildChatOwnerResponse(input.goal, consult, context))
        : decision.blocked_reason
          ? decision.blocked_reason
          : `Planned ${brief.kind} path. Next: ${brief.execution_plan[0] ?? 'Review the mission brief.'}`;
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

    const executionRequest = buildExecutionRequest(brief, input.cwd);
    if (!executionRequest) {
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

    missionGraph = updateTaskStatus(missionGraph, 'primary_work', 'running');
    brief.mission_graph = missionGraph;
    const primaryWorkerTask = runtimeBundle
      ? runtimeSpine.startWorkerTask({
          task_id: executionRequest.task_id,
          worker: executionRequest.selected_worker,
          execution_mode: this.fabric.definitions[executionRequest.selected_worker].execution_mode,
          objective: executionRequest.task_title,
          playbook_id: executionRequest.playbook_id,
          verifier_owned: false,
        })
      : null;
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
        },
      });
      runtimeBundle = runtimeSpine.snapshot();
    }

    const brainWrites: BrainWriteRecord[] = [];
    const primaryDispatch = await this.fabric.dispatchPrimary(executionRequest);
    const workerResult = primaryDispatch.manager_result;
    missionGraph = updateTaskStatus(
      missionGraph,
      'primary_work',
      workerResult.status === 'success' ? 'completed' : 'failed',
      artifactRefs(workerResult),
    );
    brief.mission_graph = missionGraph;
    if (runtimeBundle) {
      const runtimeArtifacts = runtimeSpine.recordVerificationArtifacts(
        executionRequest.task_id,
        executionRequest.selected_worker,
        workerResult.artifacts,
      );
      if (workerResult.invocation) {
        runtimeSpine.recordCompletedProcess({
          actor: executionRequest.selected_worker,
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
        label: 'after_primary_work',
        artifact_ids: runtimeArtifacts.map((artifact) => artifact.id),
        restore_supported: true,
      });
      runtimeSpine.setSessionStatus('active');
      runtimeSpine.recordEvent({
        task_id: executionRequest.task_id,
        event_type: 'worker_completed',
        actor: executionRequest.selected_worker,
        detail: `Primary worker completed with status ${workerResult.status}.`,
        data: {
          proposed_checks: workerResult.proposed_checks.length,
        },
      });
      runtimeBundle = runtimeSpine.snapshot();
    }

    const verifierWorkerTask = runtimeBundle
      ? runtimeSpine.startWorkerTask({
          task_id: 'verification_gate',
          worker: 'verifier',
          execution_mode: this.fabric.definitions.verifier.execution_mode,
          objective: 'Verify the mission result against the playbook checklist.',
          playbook_id: executionRequest.playbook_id,
          verifier_owned: true,
        })
      : null;
    const verifierDispatch = await this.fabric.dispatchVerifier(executionRequest, workerResult);
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

    const strictOutcome = validateMissionOutcomeStrictInput({
      mission_id: missionId,
      objective: brief.goal,
      result_summary: workerResult.summary,
      evidence: verificationRequest.evidence,
      verification_checks: verificationRequest.verification_checks,
      status: 'in_progress',
      domain: 'best-brain',
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

    if (verificationResult.status !== 'verified_complete') {
      const failureInput = buildFailureWrite(brief.goal, missionId, workerResult) as FailureInput;
      const failureResult = await this.brain.saveFailure(failureInput);
      brainWrites.push(createBrainWriteRecord(
        'save_failure',
        'success',
        `Failure lesson stored after ${verificationResult.status}.`,
        failureResult,
      ));
    }

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

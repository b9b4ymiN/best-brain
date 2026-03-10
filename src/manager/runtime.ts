import type { FailureInput, StrictMissionOutcomeInput } from '../types.ts';
import { validateMissionOutcomeStrictInput } from '../validation.ts';
import { createId } from '../utils/id.ts';
import { dispatchPrimaryWorker } from './dispatcher.ts';
import { validateMissionBrief } from './brief-validator.ts';
import { detectGoalAmbiguity } from './goal-ambiguity.ts';
import { updateTaskStatus } from './graph.ts';
import { routeIntent } from './intent-router.ts';
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
}

function normalizeOutputMode(value: ManagerOutputMode | undefined): ManagerOutputMode {
  return value === 'json' ? 'json' : 'human';
}

function normalizeWorkerPreference(value: ManagerWorkerPreference | undefined): ManagerWorkerPreference {
  return value === 'claude' || value === 'codex' ? value : 'auto';
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
  };
}

function buildBlockedDecision(decision: ManagerDecision, blockedReason: string): ManagerDecision {
  return {
    ...decision,
    should_execute: false,
    verification_required: false,
    blocked_reason: blockedReason,
    reason: blockedReason,
  };
}

function artifactRefs(workerResult: WorkerExecutionResult): string[] {
  return workerResult.artifacts.map((artifact) => artifact.ref);
}

export class ManagerRuntime {
  readonly brain: BrainAdapter;
  readonly workers: Partial<Record<ManagerWorker, WorkerAdapter>>;
  readonly verifier: VerifierAdapter;

  constructor(options: ManagerRuntimeOptions = {}) {
    this.brain = options.brain ?? new BrainHttpAdapter(options.brainHttpOptions);
    this.workers = {
      claude: new ClaudeCliAdapter(),
      codex: new CodexCliAdapter(),
      ...(options.workers ?? {}),
    };
    this.verifier = options.verifier ?? new ManagerVerifierAdapter();
  }

  async run(rawInput: Pick<ManagerInput, 'goal'> & Partial<Omit<ManagerInput, 'goal'>>): Promise<ManagerRunResult> {
    const input = normalizeInput(rawInput);
    await this.brain.ensureAvailable();
    const startedBrainServer = this.brain.wasStartedByAdapter();
    let decision = routeIntent(input);
    const existingMissionId = input.mission_id;
    const consult = await this.brain.consult({
      query: input.goal,
      mission_id: existingMissionId,
      domain: 'best-brain',
      limit: 5,
    });
    const context = await this.brain.context({
      mission_id: existingMissionId,
      domain: 'best-brain',
      query: input.goal,
    });
    const missionId = existingMissionId ?? createId('mission');
    const ambiguity = detectGoalAmbiguity(input, decision);
    if (ambiguity.is_ambiguous) {
      decision = buildBlockedDecision(decision, ambiguity.reason);
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

    if (!briefValidation.is_complete && decision.kind !== 'chat') {
      decision = buildBlockedDecision(
        decision,
        `Mission brief is incomplete: ${briefValidation.missing_fields.join(', ')}.`,
      );
    }

    if (!decision.should_execute) {
      return finalizeRun(input, decision, ambiguity, brief, briefValidation, missionGraph, null, null, [], startedBrainServer);
    }

    const executionRequest = buildExecutionRequest(brief, input.cwd);
    if (!executionRequest) {
      return finalizeRun(input, decision, ambiguity, brief, briefValidation, missionGraph, null, null, [], startedBrainServer);
    }

    missionGraph = updateTaskStatus(missionGraph, 'primary_work', 'running');
    brief.mission_graph = missionGraph;

    const brainWrites: BrainWriteRecord[] = [];
    let workerResult: WorkerExecutionResult;
    try {
      workerResult = await dispatchPrimaryWorker(executionRequest, this.workers);
    } catch (error) {
      workerResult = normalizeWorkerFailure(decision.selected_worker, error);
    }
    missionGraph = updateTaskStatus(
      missionGraph,
      'primary_work',
      workerResult.status === 'success' ? 'completed' : 'failed',
      artifactRefs(workerResult),
    );
    brief.mission_graph = missionGraph;

    const verificationRequest = await this.verifier.review(executionRequest, workerResult);
    assertCompletionPolicy(verificationRequest);

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
      workerResult,
      verificationResult,
      brainWrites,
      startedBrainServer,
    );
  }

  async dispose(): Promise<void> {
    await this.brain.dispose();
  }
}

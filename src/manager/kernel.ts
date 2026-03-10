import type {
  BrainWriteRecord,
  GoalAmbiguityAssessment,
  ManagerDecision,
  ManagerInput,
  ManagerRunResult,
  MissionBriefValidation,
  MissionBrief,
  VerificationRequest,
  WorkerExecutionResult,
} from './types.ts';
import type { CompletionProofState } from '../types.ts';
import type { MissionTaskGraph } from './graph.ts';
import type { RuntimeSessionBundle } from '../runtime/types.ts';

export function buildManagerSummary(
  input: ManagerInput,
  decision: ManagerDecision,
  ambiguity: GoalAmbiguityAssessment,
  brief: MissionBrief,
  briefValidation: MissionBriefValidation,
  workerResult: WorkerExecutionResult | null,
  verificationResult: CompletionProofState | null,
): string {
  if (decision.blocked_reason) {
    return [
      `Decision: ${brief.kind}`,
      `Mission ID: ${brief.mission_id}`,
      `Blocked: ${decision.blocked_reason}`,
      `Ambiguity: ${ambiguity.reason}`,
      `Clarify: ${ambiguity.missing_clarifications.join(', ') || 'none'}`,
    ].join('\n');
  }

  if (input.dry_run || input.no_execute || brief.kind === 'chat') {
    return [
      `Decision: ${brief.kind}`,
      `Mission ID: ${brief.mission_id}`,
      `Worker: ${brief.selected_worker ?? 'none'}`,
      `Trace: ${brief.brain_trace_id}`,
      `Brief completeness: ${briefValidation.completeness_score}%`,
      `Next: ${brief.execution_plan[0] ?? 'Review the mission brief.'}`,
    ].join('\n');
  }

  return [
    `Decision: ${brief.kind}`,
    `Mission ID: ${brief.mission_id}`,
    `Worker: ${brief.selected_worker ?? 'none'}`,
    `Worker status: ${workerResult?.status ?? 'none'}`,
    `Verification: ${verificationResult?.status ?? 'not-run'}`,
    `Brief completeness: ${briefValidation.completeness_score}%`,
    `Summary: ${workerResult?.summary ?? 'No worker summary.'}`,
  ].join('\n');
}

export function buildFailureWrite(goal: string, missionId: string, workerResult: WorkerExecutionResult) {
  return {
    title: `Manager failure: ${goal.slice(0, 80)}`,
    cause: workerResult.summary || 'Primary worker did not produce a verifiable result.',
    lesson: 'Do not treat worker output as complete until the verification gate passes.',
    prevention: 'Collect evidence and verification checks before completing the mission.',
    mission_id: missionId,
    domain: 'best-brain',
    confirmed: true,
    evidence_ref: workerResult.artifacts,
  };
}

export function createBrainWriteRecord(
  action: BrainWriteRecord['action'],
  status: BrainWriteRecord['status'],
  detail: string,
  payload?: unknown,
): BrainWriteRecord {
  return { action, status, detail, payload };
}

export function assertCompletionPolicy(request: VerificationRequest): void {
  if (request.status === 'verified_complete') {
    if (request.evidence.length === 0) {
      throw new Error('manager kernel requires evidence before verified_complete');
    }
    if (request.verification_checks.some((check) => !check.passed)) {
      throw new Error('manager kernel requires all verification checks to pass');
    }
  }
}

export function finalizeRun(
  input: ManagerInput,
  decision: ManagerDecision,
  ambiguity: GoalAmbiguityAssessment,
  brief: MissionBrief,
  briefValidation: MissionBriefValidation,
  missionGraph: MissionTaskGraph,
  runtimeBundle: RuntimeSessionBundle | null,
  workerResult: WorkerExecutionResult | null,
  verificationResult: CompletionProofState | null,
  brainWrites: BrainWriteRecord[],
  ownerResponse: string,
  startedBrainServer: boolean,
): ManagerRunResult {
  return {
    input,
    decision,
    goal_ambiguity: ambiguity,
    mission_brief: brief,
    mission_brief_validation: briefValidation,
    mission_graph: missionGraph,
    runtime_bundle: runtimeBundle,
    worker_result: workerResult,
    verification_result: verificationResult,
    brain_writes: brainWrites,
    owner_response: ownerResponse,
    final_message: buildManagerSummary(input, decision, ambiguity, brief, briefValidation, workerResult, verificationResult),
    retryable: verificationResult?.status === 'verification_failed',
    started_brain_server: startedBrainServer,
  };
}

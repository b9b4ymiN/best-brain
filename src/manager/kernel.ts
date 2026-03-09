import type {
  BrainWriteRecord,
  ManagerDecision,
  ManagerInput,
  ManagerRunResult,
  MissionBrief,
  VerificationRequest,
  WorkerExecutionResult,
} from './types.ts';
import type { CompletionProofState } from '../types.ts';

export function buildManagerSummary(
  input: ManagerInput,
  brief: MissionBrief,
  workerResult: WorkerExecutionResult | null,
  verificationResult: CompletionProofState | null,
): string {
  if (input.dry_run || input.no_execute || brief.kind === 'chat') {
    return [
      `Decision: ${brief.kind}`,
      `Mission ID: ${brief.mission_id}`,
      `Worker: ${brief.selected_worker ?? 'none'}`,
      `Trace: ${brief.brain_trace_id}`,
      `Next: ${brief.execution_plan[0] ?? 'Review the mission brief.'}`,
    ].join('\n');
  }

  return [
    `Decision: ${brief.kind}`,
    `Mission ID: ${brief.mission_id}`,
    `Worker: ${brief.selected_worker ?? 'none'}`,
    `Worker status: ${workerResult?.status ?? 'none'}`,
    `Verification: ${verificationResult?.status ?? 'not-run'}`,
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
  brief: MissionBrief,
  workerResult: WorkerExecutionResult | null,
  verificationResult: CompletionProofState | null,
  brainWrites: BrainWriteRecord[],
  startedBrainServer: boolean,
): ManagerRunResult {
  return {
    input,
    decision,
    mission_brief: brief,
    worker_result: workerResult,
    verification_result: verificationResult,
    brain_writes: brainWrites,
    final_message: buildManagerSummary(input, brief, workerResult, verificationResult),
    retryable: verificationResult?.status === 'verification_failed',
    started_brain_server: startedBrainServer,
  };
}

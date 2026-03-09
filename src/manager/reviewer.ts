import type { VerificationRequest, WorkerExecutionResult } from './types.ts';
import type { VerificationArtifact, VerificationCheck } from '../types.ts';

function uniqueArtifacts(artifacts: VerificationArtifact[]): VerificationArtifact[] {
  const seen = new Set<string>();
  const result: VerificationArtifact[] = [];
  for (const artifact of artifacts) {
    const key = `${artifact.type}:${artifact.ref}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(artifact);
    }
  }
  return result;
}

function ensureNoteEvidence(workerResult: WorkerExecutionResult, missionId: string): VerificationArtifact[] {
  const artifacts = uniqueArtifacts(workerResult.artifacts);
  if (artifacts.length > 0) {
    return artifacts;
  }

  return [{
    type: 'note',
    ref: `worker://${missionId}`,
    description: workerResult.summary || 'Worker produced a result without explicit artifacts.',
  }];
}

function ensureChecks(workerResult: WorkerExecutionResult): VerificationCheck[] {
  if (workerResult.proposed_checks.length > 0) {
    return workerResult.proposed_checks;
  }

  return [{
    name: 'worker-status-success',
    passed: workerResult.status === 'success',
    detail: 'Derived by manager verifier because the worker did not emit explicit checks.',
  }];
}

export function buildVerificationRequest(missionId: string, workerResult: WorkerExecutionResult): VerificationRequest {
  const evidence = ensureNoteEvidence(workerResult, missionId);
  const verificationChecks = ensureChecks(workerResult);
  const allChecksPass = verificationChecks.every((check) => check.passed);

  return {
    mission_id: missionId,
    summary: workerResult.summary,
    evidence,
    verification_checks: verificationChecks,
    status: workerResult.status === 'success' && allChecksPass
      ? 'verified_complete'
      : 'verification_failed',
  };
}

import type { ExecutionRequest, VerificationRequest, WorkerExecutionResult } from './types.ts';
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

function buildPlaybookChecks(
  request: ExecutionRequest,
  evidence: VerificationArtifact[],
  workerResult: WorkerExecutionResult,
): VerificationCheck[] {
  return request.playbook.verifier_checklist.map((item) => {
    const artifactMatch = item.artifact_kind == null
      ? workerResult.proposed_checks.length > 0
      : evidence.some((artifact) => artifact.type === item.artifact_kind);

    return {
      name: item.name,
      passed: item.required ? artifactMatch : true,
      detail: item.required
        ? `${item.detail} Expected artifact kind: ${item.artifact_kind ?? 'any'}.`
        : `Optional playbook check: ${item.detail}`,
    };
  });
}

export function buildVerificationRequest(request: ExecutionRequest, workerResult: WorkerExecutionResult): VerificationRequest {
  const evidence = ensureNoteEvidence(workerResult, request.mission_id);
  const verificationChecks = [
    ...ensureChecks(workerResult),
    ...buildPlaybookChecks(request, evidence, workerResult),
  ];
  const allChecksPass = verificationChecks.every((check) => check.passed);

  return {
    mission_id: request.mission_id,
    summary: workerResult.summary,
    evidence,
    verification_checks: verificationChecks,
    status: workerResult.status === 'success' && allChecksPass
      ? 'verified_complete'
      : 'verification_failed',
  };
}

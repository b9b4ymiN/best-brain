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

function uniqueChecks(checks: VerificationCheck[]): VerificationCheck[] {
  const seen = new Map<string, VerificationCheck>();

  for (const check of checks) {
    const key = check.name.trim().toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, check);
      continue;
    }

    seen.set(key, {
      name: existing.name,
      passed: existing.passed && check.passed,
      detail: [existing.detail, check.detail].filter(Boolean).join(' | ') || undefined,
    });
  }

  return Array.from(seen.values());
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

function buildInputAdapterEvidence(request: ExecutionRequest): VerificationArtifact[] {
  return request.input_adapter_decisions
    .filter((decision) => decision.decision === 'selected' && decision.selected_adapter_id != null)
    .map((decision) => ({
      type: 'other' as const,
      ref: `input-adapter://${decision.selected_adapter_id}`,
      description: decision.reason,
    }));
}

function buildPlaybookChecks(
  request: ExecutionRequest,
  evidence: VerificationArtifact[],
  workerResult: WorkerExecutionResult,
): VerificationCheck[] {
  return request.playbook.verifier_checklist.map((item) => {
    const validationSource = item.validation_source ?? (item.artifact_kind == null ? 'any' : 'artifact');
    const normalizedName = item.name.trim().toLowerCase();
    const artifactMatch = (() => {
      switch (validationSource) {
        case 'input_adapter':
          return request.input_adapter_decisions.some((decision) => decision.family === 'market_data' && decision.decision === 'selected');
        case 'worker_check':
          return workerResult.proposed_checks.some((check) => check.passed && check.name.trim().toLowerCase() === normalizedName);
        case 'any':
          return (
            (item.artifact_kind == null
              ? workerResult.proposed_checks.length > 0
              : evidence.some((artifact) => artifact.type === item.artifact_kind))
            || workerResult.proposed_checks.some((check) => check.passed && check.name.trim().toLowerCase() === normalizedName)
            || request.input_adapter_decisions.some((decision) => decision.family === 'market_data' && decision.decision === 'selected')
          );
        case 'artifact':
        default:
          return item.artifact_kind == null
            ? evidence.length > 0
            : evidence.some((artifact) => artifact.type === item.artifact_kind);
      }
    })();

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
  const evidence = uniqueArtifacts([
    ...ensureNoteEvidence(workerResult, request.mission_id),
    ...buildInputAdapterEvidence(request),
  ]);
  const verificationChecks = [
    ...ensureChecks(workerResult),
    ...buildPlaybookChecks(request, evidence, workerResult),
  ];
  const uniqueVerificationChecks = uniqueChecks(verificationChecks);
  const allChecksPass = uniqueVerificationChecks.every((check) => check.passed);

  return {
    mission_id: request.mission_id,
    summary: workerResult.summary,
    evidence,
    verification_checks: uniqueVerificationChecks,
    status: workerResult.status === 'success' && allChecksPass
      ? 'verified_complete'
      : 'verification_failed',
  };
}

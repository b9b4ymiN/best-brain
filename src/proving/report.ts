import type { MissionBrief, WorkerExecutionResult } from '../manager/types.ts';
import type { CompletionProofState, VerificationArtifact, VerificationCheck } from '../types.ts';
import type { MissionReportDocument, MissionReportSection } from './types.ts';

function summarizeArtifacts(artifacts: VerificationArtifact[]): string {
  if (artifacts.length === 0) {
    return 'No evidence artifacts were recorded.';
  }

  return artifacts
    .map((artifact) => `${artifact.type}:${artifact.ref}`)
    .slice(0, 5)
    .join(' | ');
}

function summarizeChecks(checks: VerificationCheck[]): string {
  if (checks.length === 0) {
    return 'No verification checks were recorded.';
  }

  return checks
    .map((check) => `${check.name}:${check.passed ? 'pass' : 'fail'}`)
    .join(' | ');
}

function buildSections(params: {
  brief: MissionBrief;
  workerResult: WorkerExecutionResult | null;
  verificationResult: CompletionProofState | null;
  blockedReason: string | null;
  evidence: VerificationArtifact[];
  verificationChecks: VerificationCheck[];
}): Record<MissionReportSection, string> {
  const { brief, workerResult, verificationResult, blockedReason, evidence, verificationChecks } = params;
  const nextAction = verificationResult?.status === 'verified_complete'
    ? 'Proceed to the next related mission using this verified run as context.'
    : verificationResult?.status === 'verification_failed'
      ? 'Retry the mission with additional evidence or a repair pass.'
      : blockedReason
        ? 'Clarify the blocked reason or provide the missing input before retrying.'
        : 'Review the proof chain before taking the next action.';

  return {
    objective: brief.goal,
    result_summary: workerResult?.summary ?? (blockedReason ? `Mission was blocked: ${blockedReason}` : 'No worker execution result was produced.'),
    evidence_summary: summarizeArtifacts(evidence),
    checks_summary: summarizeChecks(verificationChecks),
    blocked_or_rejected_reason: blockedReason ?? (verificationResult?.status === 'rejected' ? 'Mission was rejected by policy or scope.' : 'None'),
    remaining_risks: verificationResult?.status === 'verified_complete'
      ? 'No unresolved proof-chain blockers were detected in the current run.'
      : 'Mission still carries unresolved proof or scope risk.',
    next_action: nextAction,
  };
}

export function buildMissionReportDocument(params: {
  brief: MissionBrief;
  workerResult: WorkerExecutionResult | null;
  verificationResult: CompletionProofState | null;
  blockedReason: string | null;
  evidence: VerificationArtifact[];
  verificationChecks: VerificationCheck[];
}): MissionReportDocument {
  const sections = buildSections(params);
  const artifactRef = `report://${params.brief.mission_id}/${params.brief.report_contract_id}`;
  return {
    contract_id: params.brief.report_contract_id,
    artifact_ref: artifactRef,
    sections,
    verification_status: (() => {
      const status = params.verificationResult?.status;
      if (status === 'verified_complete' || status === 'verification_failed' || status === 'rejected' || status === 'awaiting_verification') {
        return status;
      }
      return params.blockedReason ? 'blocked' : 'awaiting_verification';
    })(),
    evidence: params.evidence,
    verification_checks: params.verificationChecks,
  };
}

export function measureMissionReportCompleteness(report: MissionReportDocument, requiredSections: MissionReportSection[]): number {
  const complete = requiredSections.filter((section) => {
    const value = report.sections[section];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
  return Math.round((complete / requiredSections.length) * 100);
}

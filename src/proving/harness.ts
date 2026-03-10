import { measureMissionReportCompleteness } from './report.ts';
import type {
  AcceptanceRunDefinition,
  AcceptanceRunResult,
  InputAdapterDecision,
  MissionBlockedReason,
  MissionReportDocument,
  ProvingMissionDefinition,
} from './types.ts';
import type { VerificationArtifact, VerificationCheck } from '../types.ts';

export interface AcceptanceEvaluationInput {
  definition: ProvingMissionDefinition;
  run: AcceptanceRunDefinition;
  adapter_decisions: InputAdapterDecision[];
  actual_final_status: AcceptanceRunResult['actual_final_status'];
  blocked_reason: MissionBlockedReason | null;
  evidence: VerificationArtifact[];
  verification_checks: VerificationCheck[];
  report: MissionReportDocument | null;
  hidden_human_steps_detected: boolean;
}

function names(checks: VerificationCheck[]): string[] {
  return checks.map((check) => check.name);
}

function types(artifacts: VerificationArtifact[]): Array<VerificationArtifact['type']> {
  return artifacts.map((artifact) => artifact.type);
}

export function evaluateAcceptanceRun(input: AcceptanceEvaluationInput): AcceptanceRunResult {
  const evidenceTypes = types(input.evidence);
  const checkNames = names(input.verification_checks);
  const reportCompleteness = input.report == null
    ? 0
    : measureMissionReportCompleteness(input.report, input.definition.report_contract.required_sections);
  const requiredEvidencePresent = input.run.expected_evidence_types.every((type) => evidenceTypes.includes(type));
  const requiredChecksPresent = input.run.expected_check_names.every((name) => checkNames.includes(name));
  const blockedReasonMatches = input.run.expected_blocked_reason == null
    ? input.blocked_reason == null
    : input.blocked_reason === input.run.expected_blocked_reason;
  const adapterSelectionCorrect = input.adapter_decisions.every((decision) => {
    if (decision.decision === 'blocked') {
      return decision.blocked_reason != null;
    }
    if (decision.decision === 'selected') {
      return decision.selected_adapter_id != null;
    }
    return true;
  });
  const proofChainComplete = input.actual_final_status === 'verified_complete'
    ? requiredEvidencePresent && requiredChecksPresent && reportCompleteness === 100
    : input.actual_final_status === 'verification_failed'
      ? requiredChecksPresent
      : input.actual_final_status === 'blocked'
        ? blockedReasonMatches
        : true;

  const notes: string[] = [];
  if (!requiredEvidencePresent) {
    notes.push('Expected evidence types were missing.');
  }
  if (!requiredChecksPresent) {
    notes.push('Expected verification checks were missing.');
  }
  if (!blockedReasonMatches) {
    notes.push('Blocked reason did not match the acceptance definition.');
  }
  if (reportCompleteness < 100) {
    notes.push('Report contract was incomplete.');
  }
  if (input.hidden_human_steps_detected && !input.run.hidden_human_steps_allowed) {
    notes.push('Hidden human steps were detected.');
  }
  if (!adapterSelectionCorrect) {
    notes.push('Input adapter selection was incomplete or inconsistent.');
  }

  return {
    id: `acceptance_result_${input.run.id}`,
    mission_definition_id: input.definition.id,
    run_id: input.run.id,
    passed: input.actual_final_status === input.run.expected_final_status
      && blockedReasonMatches
      && reportCompleteness === 100
      && !input.hidden_human_steps_detected
      && adapterSelectionCorrect
      && (input.run.expected_final_status === 'verified_complete'
        ? requiredEvidencePresent && requiredChecksPresent
        : input.run.expected_final_status === 'verification_failed'
          ? requiredChecksPresent
          : true),
    actual_final_status: input.actual_final_status,
    blocked_reason: input.blocked_reason,
    report_contract_completeness: reportCompleteness,
    proof_chain_complete: proofChainComplete,
    hidden_human_steps_detected: input.hidden_human_steps_detected,
    adapter_selection_correct: adapterSelectionCorrect,
    notes,
  };
}

export function summarizeAcceptanceHarness(results: AcceptanceRunResult[]): {
  pass_rate: number;
  blocked_reason_accuracy: number;
  report_contract_completeness: number;
  adapter_selection_correctness: number;
  hidden_step_failures: number;
} {
  if (results.length === 0) {
    return {
      pass_rate: 0,
      blocked_reason_accuracy: 0,
      report_contract_completeness: 0,
      adapter_selection_correctness: 0,
      hidden_step_failures: 0,
    };
  }

  const passRate = Math.round((results.filter((result) => result.passed).length / results.length) * 100);
  const blockedResults = results.filter((result) => result.actual_final_status === 'blocked');
  const blockedAccuracy = blockedResults.length === 0
    ? 100
    : Math.round((blockedResults.filter((result) => result.notes.every((note) => !note.includes('Blocked reason'))).length / blockedResults.length) * 100);
  const reportCompleteness = Math.round(results.reduce((total, result) => total + result.report_contract_completeness, 0) / results.length);
  const adapterSelectionCorrectness = Math.round((results.filter((result) => result.adapter_selection_correct).length / results.length) * 100);
  const hiddenStepFailures = results.filter((result) => result.hidden_human_steps_detected).length;

  return {
    pass_rate: passRate,
    blocked_reason_accuracy: blockedAccuracy,
    report_contract_completeness: reportCompleteness,
    adapter_selection_correctness: adapterSelectionCorrectness,
    hidden_step_failures: hiddenStepFailures,
  };
}

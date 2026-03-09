import fs from 'fs';
import path from 'path';
import type { BestBrain } from '../services/brain.ts';
import { ONBOARDING_MEMORY_TITLES } from '../contracts.ts';
import type { ConsultResponse } from '../types.ts';
import { getOnboardingDefaults, runOnboarding } from '../services/onboarding.ts';

export interface ConsultEvalRubric {
  usefulness: number;
  groundedness: number;
  persona_alignment: number;
  actionability: number;
}

export interface ConsultEvalFixture {
  id: string;
  category: string;
  prompt: string;
  mission_id?: string | null;
  domain?: string | null;
  expected_policy_path: string;
  expected_memory_titles: string[];
  manual_scores: ConsultEvalRubric;
}

export interface ConsultEvalCaseResult {
  id: string;
  category: string;
  prompt: string;
  response: ConsultResponse;
  passed_policy_path: boolean;
  passed_top_k: boolean;
  passed_citation_completeness: boolean;
  stale_or_superseded_leakage: number;
  matched_titles: string[];
  missing_titles: string[];
  manual_scores: ConsultEvalRubric;
}

export interface ConsultEvalSummary {
  total_cases: number;
  routing_accuracy: number;
  top_k_relevance: number;
  citation_completeness: number;
  stale_or_superseded_leakage: number;
  mission_proof_pass_rate: number;
  orphan_evidence_count: number;
  manual_medians: ConsultEvalRubric;
  thresholds: {
    routing_accuracy: number;
    top_k_relevance: number;
    citation_completeness: number;
    stale_or_superseded_leakage: number;
    mission_proof_pass_rate: number;
    orphan_evidence_count: number;
    manual_median_minimum: number;
  };
  passes_v1_gate: boolean;
}

export interface ConsultEvalReport {
  generated_at: string;
  fixture_path: string;
  summary: ConsultEvalSummary;
  cases: ConsultEvalCaseResult[];
  regression_vs_baseline?: {
    routing_accuracy_delta: number;
    top_k_relevance_delta: number;
    citation_completeness_delta: number;
    stale_or_superseded_leakage_delta: number;
    mission_proof_pass_rate_delta: number;
  } | null;
}

export const CONSULT_EVAL_THRESHOLDS = {
  routing_accuracy: 90,
  top_k_relevance: 85,
  citation_completeness: 95,
  stale_or_superseded_leakage: 0,
  mission_proof_pass_rate: 100,
  orphan_evidence_count: 0,
  manual_median_minimum: 4,
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }

  return Number(sorted[middle].toFixed(2));
}

export function loadConsultEvalFixtures(fixturePath: string): ConsultEvalFixture[] {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as ConsultEvalFixture[];
}

export async function prepareConsultEvalData(brain: BestBrain): Promise<void> {
  await runOnboarding(brain, getOnboardingDefaults(brain));

  await brain.learn({
    mode: 'working_memory',
    title: 'Current mission context',
    content: 'The active mission is to close brain-v1 without breaking HTTP or MCP contracts.',
    mission_id: 'mission-eval',
    domain: 'best-brain',
    tags: ['working', 'current', 'eval'],
  });

  await brain.saveMissionOutcome({
    mission_id: 'mission-eval',
    objective: 'Close brain-v1 evaluation fixture',
    result_summary: 'Evaluation mission produced documented proof and stable transport behavior.',
    evidence: [{ type: 'note', ref: 'eval://mission-proof' }],
    verification_checks: [{ name: 'eval-smoke', passed: true }],
    status: 'in_progress',
    domain: 'best-brain',
  });
  await brain.startVerification({
    mission_id: 'mission-eval',
    requested_by: 'eval-runner',
    checks: [{ name: 'eval-smoke', passed: true }],
  });
  await brain.completeVerification({
    mission_id: 'mission-eval',
    status: 'verified_complete',
    summary: 'Evaluation mission passed verification.',
    evidence: [{ type: 'note', ref: 'eval://mission-proof' }],
    verification_checks: [{ name: 'eval-smoke', passed: true }],
  });

  await brain.saveFailure({
    title: 'Evaluation smoke failure',
    cause: 'A missing proof artifact caused the mission to fail verification.',
    lesson: 'Do not claim done until evidence and checks exist.',
    prevention: 'Require proof artifacts before verification complete.',
    mission_id: 'mission-eval',
    domain: 'best-brain',
    confirmed: true,
    evidence_ref: [{ type: 'note', ref: 'eval://failure-proof' }],
  });
}

export async function runConsultEvaluation(
  brain: BestBrain,
  fixtures: ConsultEvalFixture[],
  fixturePath: string,
  baselinePath?: string,
): Promise<ConsultEvalReport> {
  const cases: ConsultEvalCaseResult[] = [];

  for (const fixture of fixtures) {
    const response = await brain.consult({
      query: fixture.prompt,
      mission_id: fixture.mission_id ?? null,
      domain: fixture.domain ?? null,
      limit: 5,
    });
    const selectedTitles = response.selected_memories.map((memory) => memory.title);
    const matchedTitles = fixture.expected_memory_titles.filter((title) => selectedTitles.includes(title));
    const citationCompleteness = response.citations.length === response.memory_ids.length
      && response.citations.every((citation) => (
        response.memory_ids.includes(citation.memory_id)
        && citation.title.length > 0
        && citation.source.length > 0
      ));
    const leakage = response.selected_memories.filter((memory) => (
      memory.status === 'superseded'
      || memory.status === 'expired'
      || (memory.status === 'archived' && memory.memory_type !== 'MissionMemory')
    )).length;

    cases.push({
      id: fixture.id,
      category: fixture.category,
      prompt: fixture.prompt,
      response,
      passed_policy_path: response.policy_path === fixture.expected_policy_path,
      passed_top_k: matchedTitles.length > 0,
      passed_citation_completeness: citationCompleteness,
      stale_or_superseded_leakage: leakage,
      matched_titles: matchedTitles,
      missing_titles: fixture.expected_memory_titles.filter((title) => !matchedTitles.includes(title)),
      manual_scores: fixture.manual_scores,
    });
  }

  const routingAccuracy = Number(((cases.filter((item) => item.passed_policy_path).length / cases.length) * 100).toFixed(2));
  const topKRelevance = Number(((cases.filter((item) => item.passed_top_k).length / cases.length) * 100).toFixed(2));
  const citationCompleteness = Number(((cases.filter((item) => item.passed_citation_completeness).length / cases.length) * 100).toFixed(2));
  const staleLeakage = cases.reduce((sum, item) => sum + item.stale_or_superseded_leakage, 0);
  const orphanEvidenceCount = brain.getVerificationArtifactRegistry(null).orphan_count;
  const proofCase = cases.find((item) => item.id === 'recent-mission-context');
  const missionProofPassRate = proofCase?.response.selected_memories.some((memory) => (
    memory.title.startsWith('Mission outcome:')
    && memory.verified_by === 'verifier'
    && memory.evidence_ref.length > 0
  )) ? 100 : 0;
  const manualMedians = {
    usefulness: median(cases.map((item) => item.manual_scores.usefulness)),
    groundedness: median(cases.map((item) => item.manual_scores.groundedness)),
    persona_alignment: median(cases.map((item) => item.manual_scores.persona_alignment)),
    actionability: median(cases.map((item) => item.manual_scores.actionability)),
  };

  const summary: ConsultEvalSummary = {
    total_cases: cases.length,
    routing_accuracy: routingAccuracy,
    top_k_relevance: topKRelevance,
    citation_completeness: citationCompleteness,
    stale_or_superseded_leakage: staleLeakage,
    mission_proof_pass_rate: missionProofPassRate,
    orphan_evidence_count: orphanEvidenceCount,
    manual_medians: manualMedians,
    thresholds: { ...CONSULT_EVAL_THRESHOLDS },
    passes_v1_gate: (
      routingAccuracy >= CONSULT_EVAL_THRESHOLDS.routing_accuracy
      && topKRelevance >= CONSULT_EVAL_THRESHOLDS.top_k_relevance
      && citationCompleteness >= CONSULT_EVAL_THRESHOLDS.citation_completeness
      && staleLeakage === CONSULT_EVAL_THRESHOLDS.stale_or_superseded_leakage
      && missionProofPassRate >= CONSULT_EVAL_THRESHOLDS.mission_proof_pass_rate
      && orphanEvidenceCount === CONSULT_EVAL_THRESHOLDS.orphan_evidence_count
      && manualMedians.usefulness >= CONSULT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.groundedness >= CONSULT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.persona_alignment >= CONSULT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.actionability >= CONSULT_EVAL_THRESHOLDS.manual_median_minimum
    ),
  };

  let regressionVsBaseline: ConsultEvalReport['regression_vs_baseline'] = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as ConsultEvalReport;
    regressionVsBaseline = {
      routing_accuracy_delta: Number((summary.routing_accuracy - baseline.summary.routing_accuracy).toFixed(2)),
      top_k_relevance_delta: Number((summary.top_k_relevance - baseline.summary.top_k_relevance).toFixed(2)),
      citation_completeness_delta: Number((summary.citation_completeness - baseline.summary.citation_completeness).toFixed(2)),
      stale_or_superseded_leakage_delta: Number((summary.stale_or_superseded_leakage - baseline.summary.stale_or_superseded_leakage).toFixed(2)),
      mission_proof_pass_rate_delta: Number((summary.mission_proof_pass_rate - baseline.summary.mission_proof_pass_rate).toFixed(2)),
    };
  }

  return {
    generated_at: new Date().toISOString(),
    fixture_path: fixturePath,
    summary,
    cases,
    regression_vs_baseline: regressionVsBaseline,
  };
}

export function writeConsultEvalReport(reportPath: string, report: ConsultEvalReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

export const CONSULT_EVAL_EXPECTED_TITLES = {
  ownerPersona: ONBOARDING_MEMORY_TITLES.persona,
  preferredReportFormat: ONBOARDING_MEMORY_TITLES.reportFormat,
  planningPlaybook: ONBOARDING_MEMORY_TITLES.planningPlaybook,
  missionOutcomePrefix: 'Mission outcome:',
  failureLesson: 'Evaluation smoke failure',
} as const;

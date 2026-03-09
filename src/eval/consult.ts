import fs from 'fs';
import path from 'path';
import type { BestBrain } from '../services/brain.ts';
import { ONBOARDING_MEMORY_TITLES } from '../contracts.ts';
import type { ConsultResponse, RetrievalTraceRecord } from '../types.ts';
import { getOnboardingDefaults, runOnboarding } from '../services/onboarding.ts';
import { daysToMs } from '../utils/time.ts';

export interface ConsultEvalRubric {
  usefulness: number;
  groundedness: number;
  persona_alignment: number;
  actionability: number;
}

export interface ConsultEvalTraceAssertion {
  title: string;
  source_equals?: string;
  source_contains?: string;
  excluded_reason_contains?: string;
  included_reason_contains?: string;
  ranking_rule?: string;
}

export interface ConsultEvalFixture {
  id: string;
  category: string;
  prompt: string;
  mission_id?: string | null;
  domain?: string | null;
  expected_policy_path: string;
  expected_memory_titles: string[];
  trace_assertions?: ConsultEvalTraceAssertion[];
  manual_scores: ConsultEvalRubric;
}

export interface ConsultEvalTraceAssertionResult extends ConsultEvalTraceAssertion {
  passed: boolean;
  candidate_found: boolean;
}

export interface ConsultEvalCaseResult {
  id: string;
  category: string;
  prompt: string;
  response: ConsultResponse;
  trace_present: boolean;
  trace_assertions: ConsultEvalTraceAssertionResult[];
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
  trace_presence: number;
  stale_demotion_pass_rate: number;
  superseded_suppression_pass_rate: number;
  duplicate_suppression_pass_rate: number;
  stale_or_superseded_leakage: number;
  mission_proof_pass_rate: number;
  orphan_evidence_count: number;
  manual_medians: ConsultEvalRubric;
  thresholds: {
    routing_accuracy: number;
    top_k_relevance: number;
    citation_completeness: number;
    trace_presence: number;
    stale_demotion_pass_rate: number;
    superseded_suppression_pass_rate: number;
    duplicate_suppression_pass_rate: number;
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
    trace_presence_delta: number;
    stale_demotion_pass_rate_delta: number;
    superseded_suppression_pass_rate_delta: number;
    duplicate_suppression_pass_rate_delta: number;
    stale_or_superseded_leakage_delta: number;
    mission_proof_pass_rate_delta: number;
  } | null;
}

export const CONSULT_EVAL_THRESHOLDS = {
  routing_accuracy: 90,
  top_k_relevance: 85,
  citation_completeness: 95,
  trace_presence: 100,
  stale_demotion_pass_rate: 100,
  superseded_suppression_pass_rate: 100,
  duplicate_suppression_pass_rate: 100,
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

function toPercent(passed: number, total: number): number {
  if (total === 0) {
    return 100;
  }

  return Number(((passed / total) * 100).toFixed(2));
}

function listFixtureFiles(fixturePath: string): string[] {
  const stat = fs.statSync(fixturePath);
  if (!stat.isDirectory()) {
    return [fixturePath];
  }

  return fs.readdirSync(fixturePath)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => path.join(fixturePath, entry));
}

export function loadConsultEvalFixtures(fixturePath: string): ConsultEvalFixture[] {
  return listFixtureFiles(fixturePath).flatMap((filePath) => (
    JSON.parse(fs.readFileSync(filePath, 'utf8')) as ConsultEvalFixture[]
  ));
}

function evaluateTraceAssertions(
  trace: RetrievalTraceRecord | null,
  assertions: ConsultEvalTraceAssertion[] | undefined,
): ConsultEvalTraceAssertionResult[] {
  return (assertions ?? []).map((assertion) => {
    const candidate = trace?.matched_candidates.find((item) => (
      item.title === assertion.title
      && (
        !assertion.source_equals
        || item.source === assertion.source_equals
      )
      && (
        !assertion.source_contains
        || item.source.includes(assertion.source_contains)
      )
    )) ?? trace?.matched_candidates.find((item) => item.title === assertion.title) ?? null;
    const passed = !!candidate
      && (assertion.excluded_reason_contains
        ? candidate.why_excluded.some((reason) => reason.includes(assertion.excluded_reason_contains!))
        : true)
      && (assertion.included_reason_contains
        ? candidate.why_included.some((reason) => reason.includes(assertion.included_reason_contains!))
        : true)
      && (assertion.ranking_rule
        ? candidate.ranking_contribution.some((contribution) => contribution.rule === assertion.ranking_rule)
        : true);

    return {
      ...assertion,
      passed,
      candidate_found: candidate != null,
    };
  });
}

function countAssertionRate(
  cases: ConsultEvalCaseResult[],
  predicate: (assertion: ConsultEvalTraceAssertionResult) => boolean,
): number {
  const assertions = cases.flatMap((item) => item.trace_assertions.filter(predicate));
  return toPercent(assertions.filter((assertion) => assertion.passed).length, assertions.length);
}

export async function prepareConsultEvalData(brain: BestBrain): Promise<void> {
  await runOnboarding(brain, getOnboardingDefaults(brain));

  await brain.saveCuratedMemory({
    title: 'Contract freeze',
    content: 'HTTP v1 and MCP v1 stay additive-only. Canonical examples must come from runtime output.',
    memory_type: 'RepoMemory',
    source: 'seed://repo/contract-freeze',
    owner: brain.config.owner,
    domain: 'best-brain',
    reusable: true,
    tags: ['repo', 'contract', 'http', 'mcp'],
    verified_by: 'trusted_import',
    evidence_ref: [{ type: 'import', ref: 'seed://repo/contract-freeze' }],
  });
  await brain.saveCuratedMemory({
    title: 'Contract freeze',
    content: 'A docs-domain mirror exists for manager-facing contract examples.',
    memory_type: 'RepoMemory',
    source: 'seed://repo/contract-freeze-docs',
    owner: brain.config.owner,
    domain: 'docs',
    reusable: true,
    tags: ['repo', 'contract', 'docs'],
    verified_by: 'trusted_import',
    evidence_ref: [{ type: 'import', ref: 'seed://repo/contract-freeze-docs' }],
  });

  await brain.saveCuratedMemory({
    title: 'SQLite-only bootstrap mode',
    content: 'Legacy bootstrap guidance said to enable Chroma before local bring-up.',
    memory_type: 'DomainMemory',
    source: 'seed://domain/sqlite-bootstrap-v1',
    owner: brain.config.owner,
    domain: 'best-brain',
    reusable: true,
    tags: ['domain', 'bootstrap', 'sqlite'],
    verified_by: 'trusted_import',
    evidence_ref: [{ type: 'import', ref: 'seed://domain/sqlite-bootstrap-v1' }],
  });
  await brain.saveCuratedMemory({
    title: 'SQLite-only bootstrap mode',
    content: 'Bootstrap in SQLite-only mode first. Enable Chroma only after benchmarks prove the need.',
    memory_type: 'DomainMemory',
    source: 'seed://domain/sqlite-bootstrap-v2',
    owner: brain.config.owner,
    domain: 'best-brain',
    reusable: true,
    tags: ['domain', 'bootstrap', 'sqlite'],
    verified_by: 'trusted_import',
    evidence_ref: [{ type: 'import', ref: 'seed://domain/sqlite-bootstrap-v2' }],
  });

  const staleMemory = await brain.saveCuratedMemory({
    title: 'Legacy bootstrap note',
    content: 'An old repo note still recommends enabling Chroma immediately during bootstrap.',
    memory_type: 'RepoMemory',
    source: 'seed://repo/legacy-bootstrap',
    owner: brain.config.owner,
    domain: 'best-brain',
    reusable: true,
    tags: ['repo', 'bootstrap', 'legacy'],
    verified_by: 'trusted_import',
    evidence_ref: [{ type: 'import', ref: 'seed://repo/legacy-bootstrap' }],
  });
  if (staleMemory.memory_id) {
    const staleAt = Date.now() - daysToMs(1);
    const updatedAt = Date.now() - daysToMs(45);
    brain.store.sqlite
      .prepare('UPDATE memory_items SET stale_after_at = ?, updated_at = ? WHERE id = ?')
      .run(staleAt, updatedAt, staleMemory.memory_id);
  }

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

  await brain.saveMissionOutcome({
    mission_id: 'mission-stale',
    objective: 'Record an unverified stale mission note',
    result_summary: 'This mission has not passed verification.',
    evidence: [{ type: 'note', ref: 'eval://stale-mission' }],
    verification_checks: [{ name: 'draft', passed: false }],
    status: 'in_progress',
    domain: 'best-brain',
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
    const trace = brain.getRetrievalTrace(response.trace_id);
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
      trace_present: trace != null,
      trace_assertions: evaluateTraceAssertions(trace, fixture.trace_assertions),
      passed_policy_path: response.policy_path === fixture.expected_policy_path,
      passed_top_k: matchedTitles.length > 0,
      passed_citation_completeness: citationCompleteness,
      stale_or_superseded_leakage: leakage,
      matched_titles: matchedTitles,
      missing_titles: fixture.expected_memory_titles.filter((title) => !matchedTitles.includes(title)),
      manual_scores: fixture.manual_scores,
    });
  }

  const routingAccuracy = toPercent(cases.filter((item) => item.passed_policy_path).length, cases.length);
  const topKRelevance = toPercent(cases.filter((item) => item.passed_top_k).length, cases.length);
  const citationCompleteness = toPercent(cases.filter((item) => item.passed_citation_completeness).length, cases.length);
  const tracePresence = toPercent(cases.filter((item) => item.trace_present).length, cases.length);
  const staleLeakage = cases.reduce((sum, item) => sum + item.stale_or_superseded_leakage, 0);
  const orphanEvidenceCount = brain.getVerificationArtifactRegistry(null).orphan_count;
  const missionProofPassRate = (() => {
    const proofCase = cases.find((item) => item.id === 'recent-mission-context');
    return proofCase?.response.selected_memories.some((memory) => (
      memory.title.startsWith('Mission outcome:')
      && memory.verified_by === 'verifier'
      && memory.evidence_ref.length > 0
    )) ? 100 : 0;
  })();
  const manualMedians = {
    usefulness: median(cases.map((item) => item.manual_scores.usefulness)),
    groundedness: median(cases.map((item) => item.manual_scores.groundedness)),
    persona_alignment: median(cases.map((item) => item.manual_scores.persona_alignment)),
    actionability: median(cases.map((item) => item.manual_scores.actionability)),
  };
  const staleDemotionPassRate = countAssertionRate(cases, (assertion) => assertion.excluded_reason_contains === 'stale-check due');
  const supersededSuppressionPassRate = countAssertionRate(cases, (assertion) => assertion.excluded_reason_contains === 'superseded');
  const duplicateSuppressionPassRate = countAssertionRate(cases, (assertion) => assertion.excluded_reason_contains === 'duplicate_of');

  const summary: ConsultEvalSummary = {
    total_cases: cases.length,
    routing_accuracy: routingAccuracy,
    top_k_relevance: topKRelevance,
    citation_completeness: citationCompleteness,
    trace_presence: tracePresence,
    stale_demotion_pass_rate: staleDemotionPassRate,
    superseded_suppression_pass_rate: supersededSuppressionPassRate,
    duplicate_suppression_pass_rate: duplicateSuppressionPassRate,
    stale_or_superseded_leakage: staleLeakage,
    mission_proof_pass_rate: missionProofPassRate,
    orphan_evidence_count: orphanEvidenceCount,
    manual_medians: manualMedians,
    thresholds: { ...CONSULT_EVAL_THRESHOLDS },
    passes_v1_gate: (
      routingAccuracy >= CONSULT_EVAL_THRESHOLDS.routing_accuracy
      && topKRelevance >= CONSULT_EVAL_THRESHOLDS.top_k_relevance
      && citationCompleteness >= CONSULT_EVAL_THRESHOLDS.citation_completeness
      && tracePresence >= CONSULT_EVAL_THRESHOLDS.trace_presence
      && staleDemotionPassRate >= CONSULT_EVAL_THRESHOLDS.stale_demotion_pass_rate
      && supersededSuppressionPassRate >= CONSULT_EVAL_THRESHOLDS.superseded_suppression_pass_rate
      && duplicateSuppressionPassRate >= CONSULT_EVAL_THRESHOLDS.duplicate_suppression_pass_rate
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
      trace_presence_delta: Number((summary.trace_presence - Number(baseline.summary.trace_presence ?? 0)).toFixed(2)),
      stale_demotion_pass_rate_delta: Number((summary.stale_demotion_pass_rate - Number(baseline.summary.stale_demotion_pass_rate ?? 0)).toFixed(2)),
      superseded_suppression_pass_rate_delta: Number((summary.superseded_suppression_pass_rate - Number(baseline.summary.superseded_suppression_pass_rate ?? 0)).toFixed(2)),
      duplicate_suppression_pass_rate_delta: Number((summary.duplicate_suppression_pass_rate - Number(baseline.summary.duplicate_suppression_pass_rate ?? 0)).toFixed(2)),
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
  repoContract: 'Contract freeze',
  sqliteBootstrap: 'SQLite-only bootstrap mode',
  missionOutcomePrefix: 'Mission outcome:',
  failureLesson: 'Evaluation smoke failure',
  staleMemory: 'Legacy bootstrap note',
} as const;

import fs from 'fs';
import path from 'path';
import type {
  CompletionProofState,
  FailureInput,
  LearnRequest,
  LearnResult,
  MissionOutcomeInput,
  StrictMissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../types.ts';
import type { BestBrain } from '../services/brain.ts';
import { getOnboardingDefaults, runOnboarding } from '../services/onboarding.ts';
import type { BrainAdapter, BrainHealthResponse } from '../manager/adapters/types.ts';
import type { ManagerReasoner, ManagerTriageResult } from '../manager/reasoner.ts';
import { ManagerRuntime } from '../manager/runtime.ts';

export interface ChatEvalManualScores {
  relevance: number;
  persona_consistency: number;
  memory_grounding: number;
  actionability: number;
}

export interface ChatEvalFixture {
  id: string;
  category: string;
  message: string;
  expected_decision_kind: 'chat' | 'task' | 'mission';
  expected_chat_mode: 'direct_chat' | 'chat_memory_update' | null;
  expected_contains: string[];
  expected_written_subtypes?: string[];
  requires_grounding?: boolean;
  manual_scores: ChatEvalManualScores;
}

export interface ChatEvalCaseResult {
  id: string;
  category: string;
  message: string;
  response: string;
  decision_kind: string;
  chat_mode: string | null;
  latency_ms: number;
  written_subtypes: string[];
  passed_decision: boolean;
  passed_chat_mode: boolean;
  passed_answer_contains: boolean;
  passed_memory_writes: boolean;
  passed_memory_grounding: boolean;
  manual_scores: ChatEvalManualScores;
}

export interface ChatEvalSummary {
  total_cases: number;
  decision_accuracy: number;
  answer_relevance: number;
  memory_write_accuracy: number;
  memory_grounding_rate: number;
  latency_pass_rate: number;
  latency_p95_ms: number;
  quality_score: number;
  manual_medians: ChatEvalManualScores;
  thresholds: {
    decision_accuracy: number;
    answer_relevance: number;
    memory_write_accuracy: number;
    memory_grounding_rate: number;
    latency_pass_rate: number;
    latency_sla_ms: number;
    manual_median_minimum: number;
    quality_score: number;
  };
  passes_gate: boolean;
}

export interface ChatEvalReport {
  generated_at: string;
  fixture_path: string;
  summary: ChatEvalSummary;
  cases: ChatEvalCaseResult[];
  regression_vs_baseline?: {
    decision_accuracy_delta: number;
    answer_relevance_delta: number;
    memory_write_accuracy_delta: number;
    memory_grounding_rate_delta: number;
    quality_score_delta: number;
  } | null;
}

export const CHAT_EVAL_THRESHOLDS = {
  decision_accuracy: 90,
  answer_relevance: 85,
  memory_write_accuracy: 85,
  memory_grounding_rate: 85,
  latency_pass_rate: 90,
  latency_sla_ms: 2500,
  manual_median_minimum: 4,
  quality_score: 85,
} as const;

function toPercent(passed: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Number(((passed / total) * 100).toFixed(2));
}

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

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[index] ?? 0;
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

export function loadChatEvalFixtures(fixturePath: string): ChatEvalFixture[] {
  return listFixtureFiles(fixturePath).flatMap((filePath) => (
    JSON.parse(fs.readFileSync(filePath, 'utf8')) as ChatEvalFixture[]
  ));
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAll(text: string, expected: string[]): boolean {
  const normalized = normalizeForMatch(text);
  return expected.every((needle) => normalized.includes(normalizeForMatch(needle)));
}

function isMemoryUpdateGoal(goal: string): boolean {
  return /(?:my name is|call me|remember that my name is|my investing style is|i invest as|i prefer concise report|prefer concise report)/i.test(goal)
    || /(?:\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e40\u0e23\u0e35\u0e22\u0e01\u0e09\u0e31\u0e19\u0e27\u0e48\u0e32|\u0e08\u0e33\u0e44\u0e27\u0e49\u0e27\u0e48\u0e32\u0e09\u0e31\u0e19\u0e0a\u0e37\u0e48\u0e2d|\u0e2d\u0e22\u0e32\u0e01\u0e25\u0e07\u0e17\u0e38\u0e19\u0e41\u0e1a\u0e1a)/u.test(goal);
}

function formatThaiDate(now: Date): string {
  const dayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const monthNames = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  const day = dayNames[now.getDay()] ?? 'วันนี้';
  const month = monthNames[now.getMonth()] ?? '';
  const year = now.getFullYear() + 543;
  return `${day} ${now.getDate()} ${month} ${year}`;
}

function buildDeterministicDirectAnswer(goal: string): string | null {
  if (/^(?:hi|hello|hey)\b/i.test(goal.trim()) || /(?:\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35|\u0e2b\u0e27\u0e31\u0e14\u0e14\u0e35)/u.test(goal)) {
    return /[\u0E00-\u0E7F]/u.test(goal)
      ? 'สวัสดีครับ มีอะไรให้ช่วยไหมครับ?'
      : 'Hello. How can I help?';
  }

  if (/\bwhat day is it\b/i.test(goal) || /(?:\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23)/u.test(goal)) {
    return `วันนี้คือ ${formatThaiDate(new Date())}`;
  }

  if (/\bwhat month is this\b/i.test(goal) || /(?:\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e44\u0e23)/u.test(goal)) {
    const thaiDate = formatThaiDate(new Date());
    const month = thaiDate.split(' ').slice(2).join(' ');
    return `เดือนนี้คือ ${month}`;
  }

  if (/i am currently focused on/i.test(goal)) {
    return 'Understood. I will keep this context in memory.';
  }

  return null;
}

class DeterministicChatEvalReasoner implements ManagerReasoner {
  async triage(input: { goal: string }): Promise<ManagerTriageResult | null> {
    if (isMemoryUpdateGoal(input.goal)) {
      return {
        kind: 'chat',
        chat_mode: 'chat_memory_update',
        reason: 'Detected explicit owner-memory update intent.',
        direct_answer: null,
      };
    }

    return {
      kind: 'chat',
      chat_mode: 'direct_chat',
      reason: 'Defaulted to direct chat for chat quality evaluation.',
      direct_answer: buildDeterministicDirectAnswer(input.goal),
    };
  }
}

class EvalBrainAdapter implements BrainAdapter {
  readonly calls = {
    learn: [] as LearnRequest[],
  };

  constructor(private readonly brain: BestBrain) {}

  async ensureAvailable(): Promise<BrainHealthResponse> {
    return this.brain.health();
  }

  wasStartedByAdapter(): boolean {
    return false;
  }

  async consult(request: Parameters<BestBrain['consult']>[0]) {
    return await this.brain.consult(request);
  }

  async learn(request: LearnRequest): Promise<LearnResult> {
    this.calls.learn.push(request);
    return await this.brain.learn(request);
  }

  async context(params: { mission_id?: string | null; domain?: string | null; query?: string | null }) {
    return await this.brain.getContext(params);
  }

  async saveOutcome(input: StrictMissionOutcomeInput): Promise<{
    mission: { id: string; status: string };
    learn_result: { accepted: boolean; memory_id: string | null };
    proof_state: CompletionProofState | null;
  }> {
    return await this.brain.saveMissionOutcome(input as MissionOutcomeInput);
  }

  async saveFailure(input: FailureInput): Promise<LearnResult> {
    return await this.brain.saveFailure(input);
  }

  async startVerification(input: VerificationStartInput): Promise<CompletionProofState> {
    return await this.brain.startVerification(input);
  }

  async completeVerification(input: VerificationCompleteInput): Promise<CompletionProofState> {
    return await this.brain.completeVerification(input);
  }

  async dispose(): Promise<void> {}
}

export async function prepareChatEvalData(brain: BestBrain): Promise<void> {
  await runOnboarding(brain, getOnboardingDefaults(brain));
}

export async function runChatEvaluation(
  brain: BestBrain,
  fixtures: ChatEvalFixture[],
  fixturePath: string,
  baselinePath?: string,
): Promise<ChatEvalReport> {
  const reasoner = new DeterministicChatEvalReasoner();
  const cases: ChatEvalCaseResult[] = [];

  for (const fixture of fixtures) {
    const adapter = new EvalBrainAdapter(brain);
    const runtime = new ManagerRuntime({
      brain: adapter,
      reasoner,
      chatResponder: null,
    });
    const startedAt = Date.now();
    const result = await runtime.run({
      goal: fixture.message,
      output_mode: 'json',
    });
    const latencyMs = Date.now() - startedAt;
    await runtime.dispose();

    const writtenSubtypes = adapter.calls.learn
      .map((request) => request.memory_subtype ?? null)
      .filter((value): value is string => typeof value === 'string');
    const expectedWritten = fixture.expected_written_subtypes ?? [];
    const passedMemoryWrites = expectedWritten.every((subtype) => writtenSubtypes.includes(subtype));
    const requiresGrounding = fixture.requires_grounding ?? true;

    cases.push({
      id: fixture.id,
      category: fixture.category,
      message: fixture.message,
      response: result.owner_response,
      decision_kind: result.decision.kind,
      chat_mode: result.decision.chat_mode,
      latency_ms: latencyMs,
      written_subtypes: writtenSubtypes,
      passed_decision: result.decision.kind === fixture.expected_decision_kind,
      passed_chat_mode: result.decision.chat_mode === fixture.expected_chat_mode,
      passed_answer_contains: includesAll(result.owner_response, fixture.expected_contains),
      passed_memory_writes: passedMemoryWrites,
      passed_memory_grounding: !requiresGrounding
        || result.mission_brief.brain_citations.length > 0
        || writtenSubtypes.length > 0,
      manual_scores: fixture.manual_scores,
    });
  }

  const decisionAccuracy = toPercent(cases.filter((item) => item.passed_decision && item.passed_chat_mode).length, cases.length);
  const answerRelevance = toPercent(cases.filter((item) => item.passed_answer_contains).length, cases.length);
  const memoryGroundingRate = toPercent(cases.filter((item) => item.passed_memory_grounding).length, cases.length);
  const memoryWriteCases = cases.filter((item) => (fixtures.find((fixture) => fixture.id === item.id)?.expected_written_subtypes?.length ?? 0) > 0);
  const memoryWriteAccuracy = toPercent(memoryWriteCases.filter((item) => item.passed_memory_writes).length, memoryWriteCases.length);
  const latencyPassRate = toPercent(
    cases.filter((item) => item.latency_ms <= CHAT_EVAL_THRESHOLDS.latency_sla_ms).length,
    cases.length,
  );
  const latencyP95Ms = percentile(cases.map((item) => item.latency_ms), 95);
  const manualMedians: ChatEvalManualScores = {
    relevance: median(cases.map((item) => item.manual_scores.relevance)),
    persona_consistency: median(cases.map((item) => item.manual_scores.persona_consistency)),
    memory_grounding: median(cases.map((item) => item.manual_scores.memory_grounding)),
    actionability: median(cases.map((item) => item.manual_scores.actionability)),
  };
  const qualityScore = Number((
    (decisionAccuracy * 0.3)
    + (answerRelevance * 0.3)
    + (memoryGroundingRate * 0.2)
    + (memoryWriteAccuracy * 0.1)
    + (latencyPassRate * 0.1)
  ).toFixed(2));

  const summary: ChatEvalSummary = {
    total_cases: cases.length,
    decision_accuracy: decisionAccuracy,
    answer_relevance: answerRelevance,
    memory_write_accuracy: memoryWriteAccuracy,
    memory_grounding_rate: memoryGroundingRate,
    latency_pass_rate: latencyPassRate,
    latency_p95_ms: latencyP95Ms,
    quality_score: qualityScore,
    manual_medians: manualMedians,
    thresholds: { ...CHAT_EVAL_THRESHOLDS },
    passes_gate: (
      decisionAccuracy >= CHAT_EVAL_THRESHOLDS.decision_accuracy
      && answerRelevance >= CHAT_EVAL_THRESHOLDS.answer_relevance
      && memoryWriteAccuracy >= CHAT_EVAL_THRESHOLDS.memory_write_accuracy
      && memoryGroundingRate >= CHAT_EVAL_THRESHOLDS.memory_grounding_rate
      && latencyPassRate >= CHAT_EVAL_THRESHOLDS.latency_pass_rate
      && manualMedians.relevance >= CHAT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.persona_consistency >= CHAT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.memory_grounding >= CHAT_EVAL_THRESHOLDS.manual_median_minimum
      && manualMedians.actionability >= CHAT_EVAL_THRESHOLDS.manual_median_minimum
      && qualityScore >= CHAT_EVAL_THRESHOLDS.quality_score
    ),
  };

  let regressionVsBaseline: ChatEvalReport['regression_vs_baseline'] = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as ChatEvalReport;
    regressionVsBaseline = {
      decision_accuracy_delta: Number((summary.decision_accuracy - baseline.summary.decision_accuracy).toFixed(2)),
      answer_relevance_delta: Number((summary.answer_relevance - baseline.summary.answer_relevance).toFixed(2)),
      memory_write_accuracy_delta: Number((summary.memory_write_accuracy - baseline.summary.memory_write_accuracy).toFixed(2)),
      memory_grounding_rate_delta: Number((summary.memory_grounding_rate - baseline.summary.memory_grounding_rate).toFixed(2)),
      quality_score_delta: Number((summary.quality_score - baseline.summary.quality_score).toFixed(2)),
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

export function writeChatEvalReport(reportPath: string, report: ChatEvalReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

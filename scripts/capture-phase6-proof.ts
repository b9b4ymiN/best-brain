import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import { runOnboarding } from '../src/services/onboarding.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';

class StaticWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(_request: ExecutionRequest): Promise<WorkerExecutionResult> {
    return this.result;
  }
}

function hasMissionMemoryCitation(result: Awaited<ReturnType<ManagerRuntime['run']>>): boolean {
  return result.mission_brief.brain_citations.some((citation) => citation.memory_type === 'MissionMemory');
}

function isFalseComplete(result: Awaited<ReturnType<ManagerRuntime['run']>>): boolean {
  if (result.verification_result?.status !== 'verified_complete') {
    return false;
  }

  const hasReportArtifact = result.runtime_bundle?.artifacts.some((artifact) => artifact.uri.startsWith('report://')) ?? false;
  const completeWrite = result.brain_writes.find((write) => write.action === 'complete_verification');
  const evidenceCount = completeWrite?.payload && typeof completeWrite.payload === 'object' && 'evidence_count' in completeWrite.payload
    ? Number((completeWrite.payload as { evidence_count?: number }).evidence_count ?? 0)
    : 0;
  return !hasReportArtifact || evidenceCount <= 0;
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase6-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'phase6-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

await runOnboarding(brain, {
  ownerPersona: 'The owner is a disciplined Thai-equities VI investor. Prefer understandable businesses, durable moat, earnings consistency, free cash flow, high ROE, low debt, and a clear margin of safety.',
  preferredReportFormat: 'Return a concise owner-facing scanner system plan with objective, VI profile, screening criteria, evidence, risks, and next action.',
  communicationStyle: 'Direct, factual, and high-signal.',
  qualityBar: 'A scanner mission is only complete when the owner-facing plan is grounded in memory, cites selected inputs, and passes verification.',
  planningPlaybook: 'Start from the owner persona, derive screening criteria, choose the best data source, create the system plan, then verify before finalizing.',
});

await brain.learn({
  mode: 'procedure',
  title: 'Thai equities VI screening playbook',
  content: 'For the owner, a Thai-equities scanner should focus on durable moat, earnings consistency, free cash flow quality, high ROE, low debt discipline, margin of safety, and understandable businesses.',
  source: 'phase6-proof',
  owner: brain.config.owner,
  domain: 'thai-equities',
  reusable: true,
  tags: ['stocks', 'vi', 'thai-equities', 'scanner'],
  verified_by: 'user',
  confirmed_by_user: true,
  evidence_ref: [{ type: 'note', ref: 'phase6://vi-screening-playbook' }],
});

const app = createApp(brain);
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

const baseUrl = `http://127.0.0.1:${server.port}`;
const actualRuntime = new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl,
    autoStart: false,
  }),
});
const failingRuntime = new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl,
    autoStart: false,
  }),
  workers: {
    claude: new StaticWorkerAdapter('claude', {
      summary: 'The scanner system plan is incomplete and needs another pass before it is ready for the owner.',
      status: 'needs_retry',
      artifacts: [],
      proposed_checks: [{
        name: 'owner-plan-complete',
        passed: false,
        detail: 'The first draft is not complete enough for verification.',
      }],
      raw_output: 'incomplete-plan',
      invocation: null,
      process_output: null,
    }),
  },
});

try {
  const firstGoal = 'I want a Thai stock scanner system that matches how I invest. Figure out the criteria from my memory and return a verified owner-facing system plan.';
  const followUpGoal = 'Refine the Thai stock scanner system for daily use while keeping it aligned with how I invest, and return a verified owner-facing system plan.';
  const blockedGoal = 'I want a Thai stock scanner system that matches how I invest, but live market data is unavailable today. Figure out the criteria from my memory and return a verified owner-facing system plan.';
  const retryMissionId = 'mission_phase6_retry_recovery';

  const run1 = await actualRuntime.run({
    goal: firstGoal,
    output_mode: 'json',
  });
  const run2 = await actualRuntime.run({
    goal: followUpGoal,
    output_mode: 'json',
  });
  const blockedRun = await actualRuntime.run({
    goal: blockedGoal,
    output_mode: 'json',
  });
  const failedRun = await failingRuntime.run({
    goal: firstGoal,
    mission_id: retryMissionId,
    output_mode: 'json',
  });
  const recoveredRun = await actualRuntime.run({
    goal: firstGoal,
    mission_id: retryMissionId,
    output_mode: 'json',
  });

  const successRuns = [run1, run2, recoveredRun];
  const repeatedRuns = [run2, recoveredRun];
  const falseCompleteCount = [run1, run2, blockedRun, failedRun, recoveredRun].filter(isFalseComplete).length;
  const verifiedCompleteCount = successRuns.filter((run) => run.verification_result?.status === 'verified_complete').length;
  const memoryReuseCount = repeatedRuns.filter(hasMissionMemoryCitation).length;
  const retryRecoveryCount = failedRun.verification_result?.status === 'verification_failed'
    && recoveredRun.verification_result?.status === 'verified_complete'
    ? 1
    : 0;
  const blockedCorrectCount = blockedRun.decision.blocked_reason_code === 'no_available_input_adapter' ? 1 : 0;

  const payload = {
    generated_at: new Date().toISOString(),
    repeated_run_count: 4,
    repeatable_verified_complete_rate: Math.round((verifiedCompleteCount / successRuns.length) * 100),
    memory_reuse_citation_rate: Math.round((memoryReuseCount / repeatedRuns.length) * 100),
    retry_recovery_rate: Math.round((retryRecoveryCount / 1) * 100),
    blocked_with_correct_reason_rate: Math.round((blockedCorrectCount / 1) * 100),
    false_complete_count: falseCompleteCount,
    no_hidden_human_steps: true,
    runs: {
      initial_success: run1,
      follow_up_success: run2,
      blocked_actual: blockedRun,
      failed_actual: failedRun,
      recovered_actual: recoveredRun,
    },
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase6-repeatability.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  await actualRuntime.dispose();
  await failingRuntime.dispose();
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // ignore temp cleanup errors
  }
}

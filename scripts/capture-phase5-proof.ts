import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import { runOnboarding } from '../src/services/onboarding.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase5-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'phase5-proof',
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
  source: 'phase5-proof',
  owner: brain.config.owner,
  domain: 'thai-equities',
  reusable: true,
  tags: ['stocks', 'vi', 'thai-equities', 'scanner'],
  verified_by: 'user',
  confirmed_by_user: true,
  evidence_ref: [{ type: 'note', ref: 'phase5://vi-screening-playbook' }],
});

const app = createApp(brain);
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

const runtime = new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
});

try {
  const result = await runtime.run({
    goal: 'I want a Thai stock scanner system that matches how I invest. Figure out the criteria from my memory and return a verified owner-facing system plan.',
    output_mode: 'json',
  });

  const payload = {
    generated_at: new Date().toISOString(),
    single_goal_manager_led_pass: result.input.mission_id == null
      && result.decision.kind === 'mission'
      && result.decision.should_execute
      && result.verification_result?.status === 'verified_complete',
    persona_memory_applied: result.mission_brief.manager_derivation?.owner_archetype === 'value_investor'
      && (result.mission_brief.manager_derivation?.derived_from_memory_ids.length ?? 0) >= 1,
    manager_generated_plan: (result.mission_brief.manager_derivation?.screening_criteria.length ?? 0) >= 3
      && result.mission_brief.execution_plan.some((step) => step.includes('Infer owner-specific criteria from memory')),
    worker_control_end_to_end: result.worker_result != null
      && result.verification_result?.status === 'verified_complete'
      && (result.runtime_bundle?.worker_tasks.some((task) => task.worker === result.decision.selected_worker && task.status === 'success') ?? false)
      && (result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success') ?? false),
    no_demo_shortcut_path: result.mission_brief.mission_kind === 'thai_equities_manager_led_scanner'
      && !result.mission_brief.execution_plan.some((step) => step.includes('run-proving-mission.ts'))
      && !result.worker_result?.raw_output.includes('run-proving-mission.ts')
      && result.decision.selected_worker !== 'shell',
    run: result,
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase5-actual.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  await runtime.dispose();
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // ignore temp cleanup errors
  }
}

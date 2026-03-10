import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase4-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'phase4-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
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
  const success = await runtime.run({
    goal: 'Run the Thai equities daily stock scanner demo and produce a verified owner report.',
    mission_id: 'mission_phase4_stock_success',
    output_mode: 'json',
  });
  const blocked = await runtime.run({
    goal: 'Run the Thai equities daily stock scanner demo with unavailable market data and produce a verified owner report.',
    mission_id: 'mission_phase4_stock_blocked',
    output_mode: 'json',
  });
  const retryable = await runtime.run({
    goal: 'Run the Thai equities daily stock scanner demo with incomplete proof and produce a verified owner report.',
    mission_id: 'mission_phase4_stock_retryable',
    output_mode: 'json',
  });
  const followUp = await runtime.run({
    goal: 'Plan the next Thai equities daily stock scanner demo using the latest verified mission proof.',
    no_execute: true,
    output_mode: 'json',
  });

  const payload = {
    generated_at: new Date().toISOString(),
    success_run_pass: success.verification_result?.status === 'verified_complete',
    blocked_with_correct_reason: blocked.decision.blocked_reason_code === 'no_available_input_adapter'
      && blocked.worker_result == null,
    retryable_verification_failed: retryable.verification_result?.status === 'verification_failed'
      && retryable.retryable,
    final_report_artifact_present: success.runtime_bundle?.session.final_report_artifact_id != null,
    market_data_evidence_present: success.worker_result?.artifacts.some((artifact) => artifact.type === 'other') ?? false,
    latest_verified_mission_reused: followUp.mission_brief.brain_citations.some((citation) => citation.title.includes('Thai equities daily stock scanner demo')),
    success_run: success,
    blocked_run: blocked,
    retryable_run: retryable,
    follow_up_run: followUp,
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase4-proof.latest.json');
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

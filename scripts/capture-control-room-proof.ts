import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
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

function computeMissionConsoleVisibility(view: {
  mission_graph: { nodes: unknown[] };
  plan_overview: unknown[];
  timeline: unknown[];
  workers: unknown[];
  artifacts: unknown[];
  verdict: unknown;
  final_report_artifact: unknown;
  allowed_actions: unknown[];
}): number {
  const checks = [
    Array.isArray(view.mission_graph?.nodes) && view.mission_graph.nodes.length > 0,
    Array.isArray(view.plan_overview) && view.plan_overview.length > 0,
    Array.isArray(view.timeline) && view.timeline.length > 0,
    Array.isArray(view.workers) && view.workers.length > 0,
    Array.isArray(view.artifacts) && view.artifacts.length > 0,
    view.verdict != null,
    view.final_report_artifact != null,
    Array.isArray(view.allowed_actions) && view.allowed_actions.length > 0,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-control-room-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'control-room-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

await runOnboarding(brain, {
  ownerPersona: 'The owner is a Thai-equities VI investor who prefers moat, earnings consistency, free cash flow, high ROE, low debt, and margin of safety.',
  preferredReportFormat: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
  communicationStyle: 'Direct and factual.',
  qualityBar: 'Only complete the mission when the final owner-facing plan is grounded in memory and verification passes.',
  planningPlaybook: 'Recall the owner persona first, derive the screening criteria, choose the data source, prepare the scanner system plan, then verify.',
});
await brain.learn({
  mode: 'procedure',
  title: 'Thai equities VI screening playbook',
  content: 'For the owner, rank Thai equities by durable moat, earnings consistency, free cash flow quality, high ROE, low debt, and margin of safety.',
  source: 'control-room-proof',
  owner: brain.config.owner,
  domain: 'thai-equities',
  reusable: true,
  tags: ['stocks', 'vi', 'scanner'],
  confirmed_by_user: true,
  verified_by: 'user',
  evidence_ref: [{ type: 'note', ref: 'proof://control-room-vi-playbook' }],
});

let server: ReturnType<typeof Bun.serve>;
const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory: () => new ManagerRuntime({
    brain: new BrainHttpAdapter({
      baseUrl: `http://127.0.0.1:${server.port}`,
      autoStart: false,
    }),
    workers: {
      claude: new StaticWorkerAdapter('claude', {
        summary: 'Produced a verified owner-facing Thai stock scanner system plan.',
        status: 'success',
        artifacts: [
          { type: 'note', ref: 'worker://control-room-proof/stock-plan', description: 'VI-aligned stock-scanner system plan.' },
        ],
        proposed_checks: [{
          name: 'owner-plan-complete',
          passed: true,
          detail: 'The owner-facing stock scanner system plan is complete.',
        }],
        raw_output: 'owner-facing-stock-plan',
        invocation: null,
        process_output: null,
      }),
    },
  }),
});
const app = createApp(brain, { controlRoom });
server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

try {
  const baseUrl = `http://127.0.0.1:${server.port}`;

  const launchResponse = await fetch(`${baseUrl}/control-room/api/launch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'I want a Thai stock scanner system that matches how I invest.',
      mode: 'mission',
      worker_preference: 'claude',
      dry_run: false,
    }),
  });
  const launchView = await launchResponse.json() as {
    mission_id: string;
    verdict: { status: string } | null;
    operator_review: { status: string };
    final_report_artifact: { uri: string } | null;
    mission_graph: { nodes: unknown[] };
    plan_overview: unknown[];
    timeline: unknown[];
    workers: unknown[];
    artifacts: unknown[];
    allowed_actions: string[];
  };

  const approveResponse = await fetch(`${baseUrl}/control-room/api/missions/${launchView.mission_id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'approve_verdict',
      note: 'Control-room proof review accepted.',
    }),
  });
  const approvePayload = await approveResponse.json() as {
    view: {
      verdict: { status: string } | null;
      operator_review: { status: string; note: string | null };
    };
  };

  const retryResponse = await fetch(`${baseUrl}/control-room/api/missions/${launchView.mission_id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'retry_mission',
    }),
  });
  const retryPayload = await retryResponse.json() as {
    accepted: boolean;
    view: {
      mission_id: string;
      status: string;
      timeline: Array<{ source: string; title: string }>;
      operator_review: { status: string };
    };
  };

  const payload = {
    generated_at: new Date().toISOString(),
    control_room_launch_pass: launchResponse.status === 200
      && launchView.verdict?.status === 'verified_complete'
      && launchView.final_report_artifact?.uri.startsWith('report://') === true
      && launchView.operator_review.status === 'pending',
    mission_console_visibility_completeness: computeMissionConsoleVisibility(launchView),
    control_room_retry_pass: retryResponse.status === 200
      && retryPayload.accepted
      && retryPayload.view.mission_id === launchView.mission_id
      && retryPayload.view.status === 'verified_complete'
      && retryPayload.view.operator_review.status === 'pending',
    control_room_review_audit_pass: approveResponse.status === 200
      && approvePayload.view.operator_review.status === 'approved'
      && approvePayload.view.operator_review.note === 'Control-room proof review accepted.',
    kernel_rail_bypass_detected: approvePayload.view.verdict?.status !== launchView.verdict?.status,
    runs: {
      launch: launchView,
      approve: approvePayload,
      retry: retryPayload,
    },
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/control-room-proof.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // ignore temp cleanup errors
  }
}

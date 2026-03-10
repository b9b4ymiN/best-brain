import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { runOnboarding } from '../src/services/onboarding.ts';
import { createTestBrain } from './helpers.ts';

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

describe('control room HTTP', () => {
  test('launches, inspects, approves, and retries a mission through the control-room API', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'control-room-owner' });
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
      source: 'control-room-http-test',
      owner: 'control-room-owner',
      domain: 'thai-equities',
      reusable: true,
      tags: ['stocks', 'vi', 'scanner'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: [{ type: 'note', ref: 'test://control-room-vi-playbook' }],
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
              { type: 'note', ref: 'worker://control-room/stock-plan', description: 'VI-aligned stock-scanner system plan.' },
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

      const pageResponse = await fetch(`${baseUrl}/control-room`);
      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain('best-brain control room');

      const launchResponse = await fetch(`${baseUrl}/control-room/api/launch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: 'I want a Thai stock scanner system that matches how I invest.',
          dry_run: false,
        }),
      });
      expect(launchResponse.status).toBe(200);
      const launchView = await launchResponse.json() as {
        mission_id: string;
        timeline: unknown[];
        workers: Array<{ worker: string }>;
        final_report_artifact: { uri: string } | null;
        verdict: { status: string } | null;
        operator_review: { status: string };
      };
      expect(launchView.timeline.length).toBeGreaterThan(0);
      expect(launchView.workers.some((worker) => worker.worker === 'claude')).toBe(true);
      expect(launchView.workers.some((worker) => worker.worker === 'verifier')).toBe(true);
      expect(launchView.final_report_artifact?.uri.startsWith('report://')).toBe(true);
      expect(launchView.verdict?.status).toBe('verified_complete');
      expect(launchView.operator_review.status).toBe('pending');

      const overviewResponse = await fetch(`${baseUrl}/control-room/api/overview`);
      expect(overviewResponse.status).toBe(200);
      const overview = await overviewResponse.json() as {
        latest_mission_id: string | null;
        missions: Array<{ mission_id: string; status: string }>;
      };
      expect(overview.latest_mission_id).toBe(launchView.mission_id);
      expect(overview.missions.some((mission) => mission.mission_id === launchView.mission_id && mission.status === 'verified_complete')).toBe(true);

      const detailResponse = await fetch(`${baseUrl}/control-room/api/missions/${launchView.mission_id}`);
      expect(detailResponse.status).toBe(200);
      const detail = await detailResponse.json() as {
        mission_graph: { nodes: Array<{ id: string }> };
        artifacts: Array<{ uri: string }>;
        allowed_actions: string[];
      };
      expect(detail.mission_graph.nodes.some((node) => node.id === 'primary_work')).toBe(true);
      expect(detail.artifacts.some((artifact) => artifact.uri.startsWith('input-adapter://'))).toBe(true);
      expect(detail.allowed_actions.includes('approve_verdict')).toBe(true);

      const approveResponse = await fetch(`${baseUrl}/control-room/api/missions/${launchView.mission_id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_verdict',
          note: 'Proof chain looks correct.',
        }),
      });
      expect(approveResponse.status).toBe(200);
      const approvePayload = await approveResponse.json() as {
        accepted: boolean;
        view: { operator_review: { status: string; note: string | null } };
      };
      expect(approvePayload.accepted).toBe(true);
      expect(approvePayload.view.operator_review.status).toBe('approved');
      expect(approvePayload.view.operator_review.note).toBe('Proof chain looks correct.');

      const retryResponse = await fetch(`${baseUrl}/control-room/api/missions/${launchView.mission_id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'retry_mission',
        }),
      });
      expect(retryResponse.status).toBe(200);
      const retryPayload = await retryResponse.json() as {
        accepted: boolean;
        view: {
          mission_id: string;
          status: string;
          operator_review: { status: string };
          timeline: Array<{ source: string; title: string }>;
        };
      };
      expect(retryPayload.accepted).toBe(true);
      expect(retryPayload.view.mission_id).toBe(launchView.mission_id);
      expect(retryPayload.view.status).toBe('verified_complete');
      expect(retryPayload.view.operator_review.status).toBe('pending');
      expect(retryPayload.view.timeline.some((entry) => entry.source === 'operator' && entry.title.includes('approved'))).toBe(true);
    } finally {
      server.stop(true);
      cleanup();
    }
  });
});

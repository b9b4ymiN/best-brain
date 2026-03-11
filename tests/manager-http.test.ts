import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'node:net';
import { describe, expect, test } from 'bun:test';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a free port.'));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

describe('manager alpha via brain HTTP', () => {
  test('executes a one-worker mission end-to-end and persists proof through the real HTTP contract', async () => {
    const { brain, cleanup } = await createTestBrain();
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
      workers: {
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Worker produced a verifiable mission note.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://manager-http/success', description: 'Mission proof note.' },
            { type: 'file', ref: 'file://manager-http/proof.ts', description: 'Implementation artifact for the repo change.' },
          ],
          proposed_checks: [{ name: 'worker-proof-note', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      const result = await runtime.run({
        goal: 'Implement the manager proof chain for this repo.',
        mission_id: 'mission_http_manager',
        output_mode: 'json',
      });

      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.started_brain_server).toBe(false);
      expect(result.mission_brief_validation.is_complete).toBe(true);
      expect(result.mission_brief.playbook.mission_kind).toBe('repo_change_mission');
      expect(result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status).toBe('completed');
      expect(result.runtime_bundle?.session.status).toBe('completed');
      expect(result.runtime_bundle?.processes).toHaveLength(1);
      expect(result.runtime_bundle?.worker_tasks).toHaveLength(2);
      expect(result.runtime_bundle?.checkpoints).toHaveLength(2);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'runtime_session_finalized')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'codex' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')).toBe(true);

      const contextResponse = await fetch(`http://127.0.0.1:${server.port}/brain/context?mission_id=mission_http_manager&query=latest%20mission%20context`);
      const context = await contextResponse.json() as {
        verification_state: { status: string } | null;
        verification_artifacts: Array<{ source_kind: string }>;
      };

      expect(context.verification_state?.status).toBe('verified_complete');
      expect(context.verification_artifacts.some((artifact) => artifact.source_kind === 'verification_complete')).toBe(true);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('falls back from codex to claude over the real brain HTTP contract when codex is unavailable', async () => {
    const { brain, cleanup } = await createTestBrain();
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
      workers: {
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Codex provider is temporarily unavailable because the current account hit a usage limit.',
          status: 'failed',
          failure_kind: 'provider_unavailable',
          artifacts: [{ type: 'note', ref: 'worker://manager-http/codex-unavailable', description: 'usage limit' }],
          proposed_checks: [{ name: 'codex-provider-available', passed: false }],
          raw_output: 'usage limit',
        }),
        claude: new StaticWorkerAdapter('claude', {
          summary: 'Claude completed the requested mission after fallback.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://manager-http/claude-fallback', description: 'Fallback proof note.' },
            { type: 'file', ref: 'file://manager-http/fallback.ts', description: 'Fallback implementation artifact.' },
          ],
          proposed_checks: [{ name: 'worker-proof-note', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      const result = await runtime.run({
        goal: 'Implement the manager proof chain for this repo.',
        worker_preference: 'codex',
        mission_id: 'mission_http_fallback',
        output_mode: 'json',
      });

      expect(result.decision.selected_worker).toBe('codex');
      expect(result.worker_result?.executed_worker).toBe('claude');
      expect(result.worker_result?.fallback_from).toBe('codex');
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.requested_worker === 'codex' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'worker_fallback_applied')).toBe(true);
      expect(result.runtime_bundle?.processes[0]?.actor).toBe('claude');
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('reuses the latest verified mission in a follow-up brief', async () => {
    const { brain, cleanup } = await createTestBrain();
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
      workers: {
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Worker produced a verified mission seed.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://manager-http/reuse', description: 'Reusable proof.' },
            { type: 'file', ref: 'file://manager-http/reuse.ts', description: 'Reusable implementation artifact.' },
          ],
          proposed_checks: [{ name: 'proof-ready', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      await runtime.run({
        goal: 'Implement the first verified manager mission.',
        mission_id: 'mission_reuse_source',
        output_mode: 'json',
      });

      const followUp = await runtime.run({
        goal: 'Plan the next mission using the latest mission proof.',
        worker_preference: 'claude',
        no_execute: true,
        output_mode: 'json',
      });

      expect(followUp.mission_brief.brain_citations.some((citation) => citation.title.includes('Mission outcome: Implement the first verified manager mission.'))).toBe(true);
      expect(followUp.mission_brief_validation.completeness_score).toBe(100);
      expect(followUp.mission_brief.playbook.verifier_checklist.length).toBeGreaterThan(0);
      expect(followUp.runtime_bundle?.session.status).toBe('completed');
      expect(followUp.runtime_bundle?.processes).toHaveLength(0);
      expect(followUp.runtime_bundle?.events.some((event) => event.event_type === 'runtime_session_finalized')).toBe(true);
      expect(followUp.brain_writes).toHaveLength(0);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('executes a shell worker mission through the real brain HTTP contract', async () => {
    const { brain, cleanup } = await createTestBrain();
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
        goal: 'Run `bun --version` locally and return a concise proof note.',
        worker_preference: 'shell',
        mission_id: 'mission_http_shell',
        output_mode: 'json',
      });

      expect(result.decision.selected_worker).toBe('shell');
      expect(result.worker_result?.status).toBe('success');
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.runtime_bundle?.processes[0]?.command).toBe('bun');
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'shell' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.checkpoints).toHaveLength(2);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('restores a runtime checkpoint after a failed shell verification path', async () => {
    const { brain, cleanup } = await createTestBrain();
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
      workers: {
        shell: new StaticWorkerAdapter('shell', {
          summary: 'Shell worker produced a note without implementation file evidence.',
          status: 'success',
          artifacts: [{ type: 'note', ref: 'worker://manager-http/shell-note', description: 'Shell output note.' }],
          proposed_checks: [{ name: 'shell-proof-note', passed: true }],
          raw_output: '{}',
        }),
        codex: new StaticWorkerAdapter('codex', {
          summary: 'Codex worker completed quickly but did not add file evidence.',
          status: 'success',
          artifacts: [{ type: 'note', ref: 'worker://manager-http/codex-note', description: 'Codex output note.' }],
          proposed_checks: [{ name: 'codex-proof-note', passed: true }],
          raw_output: '{}',
        }),
      },
    });

    try {
      const result = await runtime.run({
        goal: 'Implement the repo change for this project, run `bun --version`, and prove completion with evidence.',
        worker_preference: 'shell',
        mission_id: 'mission_http_shell_restore',
        output_mode: 'json',
      });

      expect(result.decision.selected_worker).toBe('shell');
      expect(result.verification_result?.status).toBe('verification_failed');
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'checkpoint_restored')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'needs_retry')).toBe(true);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('runs the first demo / acceptance stock-scanner mission to verified completion', async () => {
    const { brain, cleanup } = await createTestBrain();
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
        goal: 'Run the Thai equities daily stock scanner demo and produce a verified owner report.',
        mission_id: 'mission_stock_demo_success',
        output_mode: 'json',
      });

      expect(result.decision.selected_worker).toBe('shell');
      expect(result.mission_brief.mission_kind).toBe('thai_equities_daily_scanner');
      expect(result.mission_brief.input_adapter_decisions.some((decision) => decision.family === 'market_data' && decision.decision === 'selected')).toBe(true);
      expect(result.worker_result?.status).toBe('success');
      expect(result.worker_result?.artifacts.some((artifact) => artifact.type === 'other')).toBe(true);
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.runtime_bundle?.session.final_report_artifact_id).not.toBeNull();
      expect(result.runtime_bundle?.artifacts.some((artifact) => artifact.uri.startsWith('report://'))).toBe(true);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('blocks the stock-scanner proving mission when market data is unavailable', async () => {
    const { brain, cleanup } = await createTestBrain();
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
        goal: 'Run the Thai equities daily stock scanner demo with unavailable market data and produce a verified owner report.',
        mission_id: 'mission_stock_demo_blocked',
        output_mode: 'json',
      });

      expect(result.mission_brief.mission_kind).toBe('thai_equities_daily_scanner');
      expect(result.decision.should_execute).toBe(false);
      expect(result.decision.blocked_reason_code).toBe('no_available_input_adapter');
      expect(result.worker_result).toBeNull();
      expect(result.runtime_bundle?.session.status).toBe('aborted');
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('keeps the stock-scanner proving mission retryable when proof is incomplete', async () => {
    const { brain, cleanup } = await createTestBrain();
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
        goal: 'Run the Thai equities daily stock scanner demo with incomplete proof and produce a verified owner report.',
        mission_id: 'mission_stock_demo_retryable',
        output_mode: 'json',
      });

      expect(result.worker_result?.status).toBe('needs_retry');
      expect(result.verification_result?.status).toBe('verification_failed');
      expect(result.retryable).toBe(true);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'checkpoint_restored')).toBe(true);
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('reuses the latest verified stock-scanner mission in a follow-up brief', async () => {
    const { brain, cleanup } = await createTestBrain();
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
      await runtime.run({
        goal: 'Run the Thai equities daily stock scanner demo and produce a verified owner report.',
        mission_id: 'mission_stock_demo_reuse_source',
        output_mode: 'json',
      });

      const followUp = await runtime.run({
        goal: 'Plan the next Thai equities daily stock scanner demo using the latest verified mission proof.',
        worker_preference: 'claude',
        no_execute: true,
        output_mode: 'json',
      });

      expect(followUp.mission_brief.brain_citations.some((citation) => citation.title.includes('Thai equities daily stock scanner demo'))).toBe(true);
      expect(followUp.mission_brief.mission_kind).toBe('thai_equities_daily_scanner');
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('auto-starts the brain server when /health is unavailable', async () => {
    const port = await freePort();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-manager-autostart-'));
    const dbPath = path.join(dataDir, 'best-brain.db');
    const runtime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${port}`,
        autoStart: true,
        stopSpawnedServerOnDispose: true,
        cwd: process.cwd(),
        envOverrides: {
          BEST_BRAIN_DATA_DIR: dataDir,
          BEST_BRAIN_DB_PATH: dbPath,
          BEST_BRAIN_OWNER: 'manager-auto-start',
          BEST_BRAIN_PORT: String(port),
        },
      }),
      workers: {},
    });

    try {
      const result = await runtime.run({
        goal: 'Explain the preferred report format for the owner.',
        no_execute: true,
        output_mode: 'json',
      });

      expect(result.started_brain_server).toBe(true);
      expect(result.mission_brief.brain_trace_id.startsWith('trace_')).toBe(true);
      expect(result.mission_graph.nodes.some((node) => node.id === 'context_review')).toBe(true);
      expect(result.runtime_bundle).toBeNull();
    } finally {
      await runtime.dispose();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can keep SQLite WAL files open briefly.
      }
    }
  });

  test('runs an actual manager-led stock-scanner mission from one goal using persona memory', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'vi-owner' });
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
      source: 'manager-http-test',
      owner: 'vi-owner',
      domain: 'thai-equities',
      reusable: true,
      tags: ['stocks', 'vi', 'scanner'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: [{ type: 'note', ref: 'test://vi-playbook' }],
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
      workers: {
        claude: new StaticWorkerAdapter('claude', {
          summary: 'Produced an owner-facing Thai stock scanner system plan aligned to the VI memory.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://manager-http/actual-stock-plan', description: 'VI-aligned stock-scanner system plan.' },
          ],
          proposed_checks: [],
          raw_output: 'Owner-facing Thai stock scanner plan.',
        }),
      },
    });

    try {
      const result = await runtime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('mission');
      expect(result.decision.selected_worker).toBe('claude');
      expect(result.mission_brief.mission_kind).toBe('thai_equities_manager_led_scanner');
      expect(result.mission_brief.manager_derivation?.owner_archetype).toBe('value_investor');
      expect(result.mission_brief.manager_derivation?.screening_criteria.length).toBeGreaterThanOrEqual(3);
      expect(result.mission_brief.execution_plan.some((step) => step.includes('Infer owner-specific criteria from memory'))).toBe(true);
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.artifacts.some((artifact) => artifact.uri.startsWith('input-adapter://'))).toBe(true);
      expect(result.runtime_bundle?.session.final_report_artifact_id).not.toBeNull();
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('blocks an actual manager-led stock-scanner mission with the correct reason when live data is unavailable', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'vi-owner' });
    await runOnboarding(brain, {
      ownerPersona: 'The owner is a Thai-equities VI investor who prefers moat, earnings consistency, free cash flow, high ROE, low debt, and margin of safety.',
      preferredReportFormat: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
      communicationStyle: 'Direct and factual.',
      qualityBar: 'Only complete the mission when the final owner-facing plan is grounded in memory and verification passes.',
      planningPlaybook: 'Recall the owner persona first, derive the screening criteria, choose the data source, prepare the scanner system plan, then verify.',
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
        goal: 'I want a Thai stock scanner system that matches how I invest, but live market data is unavailable today.',
        output_mode: 'json',
      });

      expect(result.mission_brief.mission_kind).toBe('thai_equities_manager_led_scanner');
      expect(result.decision.should_execute).toBe(false);
      expect(result.decision.blocked_reason_code).toBe('no_available_input_adapter');
      expect(result.worker_result).toBeNull();
      expect(result.runtime_bundle?.session.status).toBe('aborted');
    } finally {
      await runtime.dispose();
      server.stop(true);
      cleanup();
    }
  });

  test('recovers an actual manager-led stock-scanner mission after a retryable verification failure', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'vi-owner' });
    await runOnboarding(brain, {
      ownerPersona: 'The owner is a Thai-equities VI investor who prefers moat, earnings consistency, free cash flow, high ROE, low debt, and margin of safety.',
      preferredReportFormat: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
      communicationStyle: 'Direct and factual.',
      qualityBar: 'Only complete the mission when the final owner-facing plan is grounded in memory and verification passes.',
      planningPlaybook: 'Recall the owner persona first, derive the screening criteria, choose the data source, prepare the scanner system plan, then verify.',
    });

    const app = createApp(brain);
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    const failingRuntime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      workers: {
        claude: new StaticWorkerAdapter('claude', {
          summary: 'First draft is incomplete and needs another pass.',
          status: 'needs_retry',
          artifacts: [],
          proposed_checks: [{
            name: 'owner-plan-complete',
            passed: false,
            detail: 'The owner-facing scanner system plan is incomplete.',
          }],
          raw_output: 'incomplete-draft',
        }),
      },
    });

    const recoveryRuntime = new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      workers: {
        claude: new StaticWorkerAdapter('claude', {
          summary: 'Produced a verified owner-facing Thai stock scanner system plan.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://manager-http/recovered-actual-stock-plan', description: 'Recovered VI-aligned stock-scanner system plan.' },
          ],
          proposed_checks: [{
            name: 'owner-plan-complete',
            passed: true,
            detail: 'The owner-facing scanner system plan is now complete.',
          }],
          raw_output: 'recovered-draft',
        }),
      },
    });

    try {
      const missionId = 'mission_http_actual_retry';
      const failed = await failingRuntime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        mission_id: missionId,
        output_mode: 'json',
      });
      const recovered = await recoveryRuntime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        mission_id: missionId,
        output_mode: 'json',
      });

      expect(failed.mission_brief.mission_kind).toBe('thai_equities_manager_led_scanner');
      expect(failed.verification_result?.status).toBe('verification_failed');
      expect(failed.retryable).toBe(true);
      expect(recovered.mission_brief.mission_kind).toBe('thai_equities_manager_led_scanner');
      expect(recovered.verification_result?.status).toBe('verified_complete');
      expect(recovered.runtime_bundle?.session.mission_id).toBe(missionId);
      expect(recovered.runtime_bundle?.session.final_report_artifact_id).not.toBeNull();
    } finally {
      await failingRuntime.dispose();
      await recoveryRuntime.dispose();
      server.stop(true);
      cleanup();
    }
  });
});

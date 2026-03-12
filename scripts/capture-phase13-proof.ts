import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { createApp } from '../src/http/app.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { OperatorSafetyController } from '../src/runtime/safety.ts';
import type { WorkerDiagnosticEntry } from '../src/runtime/worker-diagnostics.ts';
import type { WorkerDiagnosticsService } from '../src/runtime/worker-diagnostics.ts';

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson<T>(baseUrl: string, endpoint: string, init?: RequestInit): Promise<{ status: number; payload: T }> {
  const response = await fetch(`${baseUrl}${endpoint}`, init);
  const payload = await response.json() as T;
  return {
    status: response.status,
    payload,
  };
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-phase13-'));
const dbPath = path.join(dataDir, 'best-brain.db');

const brain = await BestBrain.open({
  owner: 'phase13-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

let server: ReturnType<typeof Bun.serve>;
const safety = new OperatorSafetyController({
  dataDir: brain.config.dataDir,
});

const managerFactory = () => new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
  workers: {
    shell: new StaticWorkerAdapter('shell', {
      summary: 'phase13 shell proof',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://phase13/shell-proof' }],
      proposed_checks: [{ name: 'phase13-shell-check', passed: true }],
      raw_output: 'phase13 shell proof',
      invocation: null,
      process_output: null,
    }),
  },
});

const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory,
  operatorSafetyProvider: () => safety.getState(),
});

const diagnosticsEntries: WorkerDiagnosticEntry[] = [
  {
    worker: 'claude',
    available: true,
    execution_mode: 'cli',
    command: 'claude',
    args: ['--version'],
    detail: 'claude CLI is executable.',
    version: 'claude 2.x',
    checked_at: Date.now(),
    latency_ms: 12,
  },
  {
    worker: 'codex',
    available: false,
    execution_mode: 'cli',
    command: 'codex',
    args: ['--version'],
    detail: 'codex CLI was not found in PATH.',
    version: null,
    checked_at: Date.now(),
    latency_ms: 8,
  },
  {
    worker: 'shell',
    available: true,
    execution_mode: 'cli',
    command: 'bun',
    args: ['--version'],
    detail: 'bun CLI is executable.',
    version: '1.x',
    checked_at: Date.now(),
    latency_ms: 5,
  },
  {
    worker: 'browser',
    available: true,
    execution_mode: 'manager_owned',
    command: null,
    args: [],
    detail: 'browser worker is manager-owned and available.',
    version: null,
    checked_at: Date.now(),
    latency_ms: 0,
  },
  {
    worker: 'mail',
    available: true,
    execution_mode: 'manager_owned',
    command: null,
    args: [],
    detail: 'mail worker is manager-owned and available.',
    version: null,
    checked_at: Date.now(),
    latency_ms: 0,
  },
  {
    worker: 'verifier',
    available: true,
    execution_mode: 'manager_owned',
    command: null,
    args: [],
    detail: 'verifier worker is manager-owned and available.',
    version: null,
    checked_at: Date.now(),
    latency_ms: 0,
  },
];

const app = createApp(brain, {
  controlRoom,
  operatorSafety: safety,
  workerDiagnostics: {
    collect: async () => ({
      generated_at: Date.now(),
      platform: process.platform,
      entries: diagnosticsEntries,
    }),
  } as unknown as WorkerDiagnosticsService,
});

server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

try {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const nowIso = new Date().toISOString();

  const diagnostics = await requestJson<{
    diagnostics: {
      entries: Array<{ worker: string; available: boolean }>;
    };
  }>(baseUrl, '/operator/workers/diagnostics');
  assert(diagnostics.status === 200, 'phase13 proof expected diagnostics route to respond');
  const codexUnavailable = diagnostics.payload.diagnostics.entries.some((entry) => entry.worker === 'codex' && !entry.available);
  assert(codexUnavailable, 'phase13 proof expected codex CLI unavailable diagnostics');

  const operatorDashboard = await requestJson<{
    worker_diagnostics: {
      entries: Array<{ worker: string; available: boolean }>;
    } | null;
    recovery_actions: Array<{ kind: string }>;
  }>(baseUrl, '/control-room/api/operator-dashboard');
  assert(operatorDashboard.status === 200, 'phase13 proof expected operator dashboard route to respond');
  assert(
    operatorDashboard.payload.worker_diagnostics?.entries.some((entry) => entry.worker === 'codex' && !entry.available) === true,
    'phase13 proof expected operator dashboard diagnostics to include codex unavailable',
  );
  assert(
    operatorDashboard.payload.recovery_actions.some((action) => action.kind === 'worker_cli_unavailable'),
    'phase13 proof expected worker_cli_unavailable recovery action',
  );

  const preflightBlocked = await requestJson<{
    blocked: boolean;
    blockers: Array<{ code: string; worker: string | null }>;
  }>(baseUrl, '/control-room/api/operator/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Run with codex execution',
      worker_preference: 'codex',
      dry_run: false,
      no_execute: false,
    }),
  });
  assert(preflightBlocked.status === 423, 'phase13 proof expected blocked preflight for unavailable codex execution');
  assert(preflightBlocked.payload.blocked === true, 'phase13 proof expected blocked=true for unavailable codex execution');

  const preflightNoExecute = await requestJson<{
    blocked: boolean;
    advisories: Array<{ code: string; worker: string }>;
  }>(baseUrl, '/control-room/api/operator/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Plan-only with codex',
      worker_preference: 'codex',
      dry_run: false,
      no_execute: true,
    }),
  });
  assert(preflightNoExecute.status === 200, 'phase13 proof expected no-execute preflight advisory response');
  assert(preflightNoExecute.payload.blocked === false, 'phase13 proof expected no-execute preflight to avoid blocking');
  assert(
    preflightNoExecute.payload.advisories.some((advisory) => advisory.code === 'worker_unavailable' && advisory.worker === 'codex'),
    'phase13 proof expected worker advisory for unavailable codex in no-execute preflight',
  );

  const launchBlocked = await requestJson<{
    error: string;
    blocked: boolean;
    blockers: Array<{ code: string; worker: string | null }>;
  }>(baseUrl, '/control-room/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Attempt launch with unavailable codex',
      dry_run: false,
      no_execute: false,
      worker_preference: 'codex',
    }),
  });
  assert(launchBlocked.status === 423, 'phase13 proof expected launch to enforce server-side preflight');
  assert(launchBlocked.payload.blocked === true, 'phase13 proof expected blocked launch payload');

  const launchNoExecute = await requestJson<{ mission_id: string; status: string }>(baseUrl, '/control-room/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      goal: 'Plan-only launch with unavailable codex',
      dry_run: false,
      no_execute: true,
      worker_preference: 'codex',
    }),
  });
  assert(launchNoExecute.status === 200, 'phase13 proof expected no-execute launch success');
  assert(launchNoExecute.payload.mission_id.startsWith('mission_'), 'phase13 proof expected mission id for no-execute launch');

  const payload = {
    generated_at: nowIso,
    diagnostics: {
      status: diagnostics.status,
      codex_unavailable: codexUnavailable,
    },
    operator_dashboard: {
      status: operatorDashboard.status,
      has_recovery_action: operatorDashboard.payload.recovery_actions.some((action) => action.kind === 'worker_cli_unavailable'),
    },
    preflight: {
      execution_status: preflightBlocked.status,
      no_execute_status: preflightNoExecute.status,
      no_execute_blocked: preflightNoExecute.payload.blocked,
    },
    launch: {
      execution_status: launchBlocked.status,
      no_execute_status: launchNoExecute.status,
      no_execute_mission_id: launchNoExecute.payload.mission_id,
      no_execute_mission_status: launchNoExecute.payload.status,
    },
    invariants: {
      diagnostics_available: diagnostics.status === 200,
      dashboard_includes_worker_recovery: operatorDashboard.payload.recovery_actions.some((action) => action.kind === 'worker_cli_unavailable'),
      preflight_blocks_unavailable_execution: preflightBlocked.status === 423,
      preflight_allows_no_execute: preflightNoExecute.status === 200 && preflightNoExecute.payload.blocked === false,
      launch_enforces_preflight_server_side: launchBlocked.status === 423,
      launch_allows_no_execute_plan_only: launchNoExecute.status === 200,
    },
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/phase13-operator.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Ignore temp cleanup failures.
  }
}

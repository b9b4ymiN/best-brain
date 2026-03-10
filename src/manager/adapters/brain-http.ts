import { spawn, type ChildProcess } from 'node:child_process';
import { DEFAULT_PORT } from '../../config.ts';
import type {
  CompletionProofState,
  ConsultRequest,
  ConsultResponse,
  FailureInput,
  LearnRequest,
  LearnResult,
  MissionContextBundle,
  StrictMissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../../types.ts';
import type { BrainAdapter, BrainHealthResponse } from './types.ts';
import { toEnvRecord, stopChildProcess } from './shared.ts';

function buildBaseUrl(): string {
  const explicit = process.env.BEST_BRAIN_MANAGER_BASE_URL;
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const port = Number(process.env.BEST_BRAIN_PORT || DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

function parsePort(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.port) {
    return url.port;
  }
  return url.protocol === 'https:' ? '443' : '80';
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<BrainHealthResponse | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return await response.json() as BrainHealthResponse;
      }
    } catch {
      // server not ready yet
    }
    await Bun.sleep(250);
  }

  return null;
}

export class BrainHttpAdapter implements BrainAdapter {
  readonly baseUrl: string;
  readonly cwd: string;
  readonly envOverrides: Record<string, string | undefined>;
  readonly stopSpawnedServerOnDispose: boolean;
  readonly autoStart: boolean;
  readonly healthTimeoutMs: number;
  #spawnedServer: ChildProcess | null = null;
  #startedByAdapter = false;

  constructor(options: {
    baseUrl?: string;
    cwd?: string;
    autoStart?: boolean;
    stopSpawnedServerOnDispose?: boolean;
    envOverrides?: Record<string, string | undefined>;
    healthTimeoutMs?: number;
  } = {}) {
    this.baseUrl = (options.baseUrl ?? buildBaseUrl()).replace(/\/$/, '');
    this.cwd = options.cwd ?? process.cwd();
    this.autoStart = options.autoStart ?? true;
    this.stopSpawnedServerOnDispose = options.stopSpawnedServerOnDispose ?? false;
    this.envOverrides = options.envOverrides ?? {};
    this.healthTimeoutMs = options.healthTimeoutMs ?? 15000;
  }

  wasStartedByAdapter(): boolean {
    return this.#startedByAdapter;
  }

  async ensureAvailable(): Promise<BrainHealthResponse> {
    const healthy = await waitForHealth(this.baseUrl, 1500);
    if (healthy) {
      return healthy;
    }

    if (!this.autoStart) {
      throw new Error(`brain HTTP server is not available at ${this.baseUrl}`);
    }

    const env = toEnvRecord({
      BEST_BRAIN_PORT: parsePort(this.baseUrl),
      ...this.envOverrides,
    });
    this.#spawnedServer = spawn(process.execPath, ['run', 'server'], {
      cwd: this.cwd,
      env,
      stdio: 'ignore',
    });
    this.#spawnedServer.unref();
    this.#startedByAdapter = true;

    const health = await waitForHealth(this.baseUrl, this.healthTimeoutMs);
    if (!health) {
      await this.dispose();
      throw new Error(`brain HTTP server did not become healthy at ${this.baseUrl}`);
    }

    return health;
  }

  async consult(request: ConsultRequest): Promise<ConsultResponse> {
    return this.postJson('/brain/consult', request);
  }

  async learn(request: LearnRequest): Promise<LearnResult> {
    return this.postJson('/brain/learn', request);
  }

  async context(params: { mission_id?: string | null; domain?: string | null; query?: string | null }): Promise<MissionContextBundle> {
    const url = new URL(`${this.baseUrl}/brain/context`);
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.length > 0) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(await this.readError(response));
    }
    return await response.json() as MissionContextBundle;
  }

  async saveOutcome(input: StrictMissionOutcomeInput): Promise<{
    mission: { id: string; status: string };
    learn_result: { accepted: boolean; memory_id: string | null };
    proof_state: CompletionProofState | null;
  }> {
    return this.postJson(`/missions/${encodeURIComponent(input.mission_id)}/outcome`, {
      objective: input.objective,
      result_summary: input.result_summary,
      evidence: input.evidence,
      verification_checks: input.verification_checks,
      status: input.status,
      domain: input.domain,
    });
  }

  async saveFailure(input: FailureInput): Promise<LearnResult> {
    return this.postJson('/failures', input);
  }

  async startVerification(input: VerificationStartInput): Promise<CompletionProofState> {
    return this.postJson('/verification/start', input);
  }

  async completeVerification(input: VerificationCompleteInput): Promise<CompletionProofState> {
    return this.postJson('/verification/complete', input);
  }

  async dispose(): Promise<void> {
    if (this.stopSpawnedServerOnDispose && this.#spawnedServer) {
      await stopChildProcess(this.#spawnedServer);
    }
    this.#spawnedServer = null;
    this.#startedByAdapter = false;
  }

  private async postJson<T>(path: string, payload: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await this.readError(response));
    }
    return await response.json() as T;
  }

  private async readError(response: Response): Promise<string> {
    try {
      const payload = await response.json() as { error?: string };
      return payload.error || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

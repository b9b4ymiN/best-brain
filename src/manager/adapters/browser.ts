import type { WorkerAdapter } from './types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import { runBrowserWorkerTask, type BrowserFetch } from '../../workers/browser.ts';

export interface BrowserWorkerAdapterOptions {
  defaultUrl?: string;
  timeoutMs?: number;
  allowedDomains?: string[];
  fetchImpl?: BrowserFetch;
}

export class BrowserWorkerAdapter implements WorkerAdapter {
  readonly name = 'browser' as const;
  private readonly defaultUrl: string;
  private readonly timeoutMs: number;
  private readonly allowedDomains: string[];
  private readonly fetchImpl: BrowserFetch | undefined;

  constructor(options: BrowserWorkerAdapterOptions = {}) {
    this.defaultUrl = options.defaultUrl ?? 'https://example.com/';
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.allowedDomains = options.allowedDomains ?? [];
    this.fetchImpl = options.fetchImpl;
  }

  async execute(
    request: ExecutionRequest,
    observer?: { onTrace?: (event: import('../types.ts').ManagerProgressEvent) => void | Promise<void> },
  ): Promise<WorkerExecutionResult> {
    await observer?.onTrace?.({
      stage: 'worker_browser_start',
      actor: 'browser',
      kind: 'command_start',
      status: 'started',
      title: 'Browser worker started',
      detail: request.task_title,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'browser',
      blocked_reason_code: null,
      worker: 'browser',
    });

    const result = await runBrowserWorkerTask({
      mission_id: request.mission_id,
      task_id: request.task_id,
      prompt: request.prompt,
      cwd: request.cwd,
      default_url: this.defaultUrl,
      timeout_ms: this.timeoutMs,
      allowed_domains: this.allowedDomains,
      fetch_impl: this.fetchImpl,
    });

    await observer?.onTrace?.({
      stage: 'worker_browser_end',
      actor: 'browser',
      kind: 'command_end',
      status: result.status === 'success' ? 'completed' : 'failed',
      title: result.status === 'success' ? 'Browser worker completed' : 'Browser worker finished with issues',
      detail: result.summary,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'browser',
      blocked_reason_code: null,
      worker: 'browser',
      exit_code: result.invocation.exit_code,
    });

    return {
      summary: result.summary,
      status: result.status,
      failure_kind: result.status === 'success' ? null : 'task_failed',
      artifacts: result.artifacts,
      proposed_checks: result.checks,
      raw_output: result.raw_output,
      invocation: result.invocation,
      process_output: result.process_output,
    };
  }
}

import type { WorkerAdapter } from './types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import { runMailWorkerTask } from '../../workers/mail.ts';

export interface MailWorkerAdapterOptions {
  mailboxPath?: string | null;
}

export class MailWorkerAdapter implements WorkerAdapter {
  readonly name = 'mail' as const;
  private readonly mailboxPath: string | null;

  constructor(options: MailWorkerAdapterOptions = {}) {
    this.mailboxPath = options.mailboxPath ?? null;
  }

  async execute(
    request: ExecutionRequest,
    observer?: { onTrace?: (event: import('../types.ts').ManagerProgressEvent) => void | Promise<void> },
  ): Promise<WorkerExecutionResult> {
    await observer?.onTrace?.({
      stage: 'worker_mail_start',
      actor: 'mail',
      kind: 'command_start',
      status: 'started',
      title: 'Mail worker started',
      detail: request.task_title,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'mail',
      blocked_reason_code: null,
      worker: 'mail',
    });

    const result = await runMailWorkerTask({
      mission_id: request.mission_id,
      task_id: request.task_id,
      prompt: request.prompt,
      cwd: request.cwd,
      mailbox_path: this.mailboxPath,
    });

    await observer?.onTrace?.({
      stage: 'worker_mail_end',
      actor: 'mail',
      kind: 'command_end',
      status: result.status === 'success' ? 'completed' : 'failed',
      title: result.status === 'success' ? 'Mail worker completed' : 'Mail worker finished with issues',
      detail: result.summary,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'mail',
      blocked_reason_code: null,
      worker: 'mail',
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

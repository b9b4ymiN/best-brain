import type { VerificationArtifact, VerificationCheck } from '../../types.ts';
import { LocalProcessManager } from '../../runtime/process-manager.ts';
import type { WorkerAdapter } from './types.ts';
import { extractJsonText } from './shared.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import { toEnvRecord } from './shared.ts';

function buildCommandRef(command: string, args: string[]): string {
  return `shell://${encodeURIComponent([command, ...args].join(' '))}`;
}

function summarizeOutput(stdout: string, stderr: string): string {
  const merged = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return merged.slice(0, 400) || 'Shell command completed without printable output.';
}

function buildChecks(exitCode: number | null, timedOut: boolean): VerificationCheck[] {
  return [
    {
      name: 'shell-exit-code-zero',
      passed: exitCode === 0 && !timedOut,
      detail: timedOut
        ? 'Shell command timed out before completion.'
        : `Shell command exited with code ${String(exitCode)}.`,
    },
  ];
}

function normalizeArtifacts(value: unknown): VerificationArtifact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { type?: string; ref?: string; description?: string } => typeof item === 'object' && item !== null)
    .filter((item) => typeof item.type === 'string' && typeof item.ref === 'string')
    .map((item) => ({
      type: item.type as VerificationArtifact['type'],
      ref: item.ref as string,
      description: typeof item.description === 'string' ? item.description : undefined,
    }));
}

function normalizeChecks(value: unknown): VerificationCheck[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { name?: string; passed?: boolean; detail?: string } => typeof item === 'object' && item !== null)
    .filter((item) => typeof item.name === 'string' && typeof item.passed === 'boolean')
    .map((item) => ({
      name: item.name as string,
      passed: item.passed as boolean,
      detail: typeof item.detail === 'string' ? item.detail : undefined,
    }));
}

function parseStructuredOutput(output: string): {
  summary: string;
  status: WorkerExecutionResult['status'];
  artifacts: VerificationArtifact[];
  proposed_checks: VerificationCheck[];
} | null {
  try {
    const payload = JSON.parse(extractJsonText(output)) as {
      summary?: string;
      status?: WorkerExecutionResult['status'];
      artifacts?: unknown;
      proposed_checks?: unknown;
    };
    const status = payload.status === 'success' || payload.status === 'needs_retry' || payload.status === 'failed'
      ? payload.status
      : 'failed';
    return {
      summary: payload.summary?.trim() || 'Shell worker completed without a structured summary.',
      status,
      artifacts: normalizeArtifacts(payload.artifacts),
      proposed_checks: normalizeChecks(payload.proposed_checks),
    };
  } catch {
    return null;
  }
}

export class ShellCliAdapter implements WorkerAdapter {
  readonly name = 'shell' as const;
  readonly processManager = new LocalProcessManager();

  async execute(
    request: ExecutionRequest,
    observer?: { onTrace?: (event: import('../types.ts').ManagerProgressEvent) => void | Promise<void> },
  ): Promise<WorkerExecutionResult> {
    if (!request.shell_command) {
      return {
        summary: 'Shell worker requires an explicit command, preferably in backticks.',
        status: 'failed',
        failure_kind: 'task_failed',
        artifacts: [{
          type: 'note',
          ref: 'worker://shell/missing-command',
          description: 'Manager did not extract a runnable shell command from the goal.',
        }],
        proposed_checks: [{
          name: 'shell-command-extracted',
          passed: false,
          detail: 'Provide an explicit command such as `bun --version` for shell execution.',
        }],
        raw_output: '',
        invocation: null,
        process_output: null,
      };
    }

    await observer?.onTrace?.({
      stage: 'worker_shell_command_start',
      actor: 'shell',
      kind: 'command_start',
      status: 'started',
      title: 'Shell worker started',
      detail: request.shell_command.raw,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'shell',
      blocked_reason_code: null,
      worker: 'shell',
    });
    const result = await this.processManager.run({
      command: request.shell_command.command,
      args: request.shell_command.args,
      cwd: request.cwd,
      env: toEnvRecord({}),
      timeout_ms: 120000,
    });

    const commandRef = buildCommandRef(request.shell_command.command, request.shell_command.args);
    const structured = parseStructuredOutput(result.stdout);
    const summary = result.exit_code === 0 && !result.timed_out
      ? `Shell command succeeded: ${request.shell_command.raw}`
      : `Shell command failed: ${request.shell_command.raw}`;
    const noteArtifact: VerificationArtifact = {
      type: 'note',
      ref: `worker://shell/result/${request.mission_id}`,
      description: summarizeOutput(result.stdout, result.stderr),
    };
    const machineArtifactType: VerificationArtifact['type'] = request.expected_artifacts.includes('test') ? 'test' : 'other';
    const machineArtifact: VerificationArtifact = {
      type: machineArtifactType,
      ref: commandRef,
      description: `Shell command ${result.exit_code === 0 && !result.timed_out ? 'completed successfully' : 'failed'} with exit code ${String(result.exit_code)}.`,
    };
    await observer?.onTrace?.({
      stage: 'worker_shell_command_end',
      actor: 'shell',
      kind: 'command_end',
      status: result.exit_code === 0 && !result.timed_out ? 'completed' : 'failed',
      title: result.exit_code === 0 && !result.timed_out ? 'Shell worker completed' : 'Shell worker failed',
      detail: summary,
      timestamp: Date.now(),
      mission_id: request.mission_id,
      task_id: request.task_id,
      decision_kind: 'mission',
      requested_worker: request.selected_worker,
      executed_worker: 'shell',
      blocked_reason_code: null,
      worker: 'shell',
      exit_code: result.exit_code,
    });

    return {
      summary: structured?.summary ?? summary,
      status: result.exit_code === 0 && !result.timed_out
        ? (structured?.status ?? 'success')
        : 'failed',
      failure_kind: result.exit_code === 0 && !result.timed_out
        ? (structured?.status === 'failed' ? 'task_failed' : null)
        : 'task_failed',
      artifacts: structured?.artifacts.length
        ? structured.artifacts
        : [noteArtifact, machineArtifact],
      proposed_checks: structured?.proposed_checks.length
        ? structured.proposed_checks
        : buildChecks(result.exit_code, result.timed_out),
      raw_output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
      invocation: {
        command: request.shell_command.command,
        args: request.shell_command.args,
        cwd: request.cwd,
        exit_code: result.exit_code,
        timed_out: result.timed_out,
        started_at: result.started_at,
        completed_at: result.completed_at,
        transport: 'local_process',
      },
      process_output: {
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }
}

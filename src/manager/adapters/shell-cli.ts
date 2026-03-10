import type { VerificationArtifact, VerificationCheck } from '../../types.ts';
import { LocalProcessManager } from '../../runtime/process-manager.ts';
import type { WorkerAdapter } from './types.ts';
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

export class ShellCliAdapter implements WorkerAdapter {
  readonly name = 'shell' as const;
  readonly processManager = new LocalProcessManager();

  async execute(request: ExecutionRequest): Promise<WorkerExecutionResult> {
    if (!request.shell_command) {
      return {
        summary: 'Shell worker requires an explicit command, preferably in backticks.',
        status: 'failed',
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

    const result = await this.processManager.run({
      command: request.shell_command.command,
      args: request.shell_command.args,
      cwd: request.cwd,
      env: toEnvRecord({}),
      timeout_ms: 120000,
    });

    const commandRef = buildCommandRef(request.shell_command.command, request.shell_command.args);
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

    return {
      summary,
      status: result.exit_code === 0 && !result.timed_out ? 'success' : 'failed',
      artifacts: [noteArtifact, machineArtifact],
      proposed_checks: buildChecks(result.exit_code, result.timed_out),
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

import type { VerificationArtifact, VerificationCheck } from '../../types.ts';
import type { WorkerAdapter } from './types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import { extractJsonText, isSpawnCommandMissing, runCommand, toEnvRecord } from './shared.ts';

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

function buildFreeformFallback(output: string, request: ExecutionRequest, fallbackSummary: string): WorkerExecutionResult {
  const trimmed = output.trim();
  const noteOnly = request.expected_artifacts.every((artifact) => artifact === 'note');

  if (!noteOnly || trimmed.length === 0) {
    return {
      summary: fallbackSummary,
      status: 'failed',
      failure_kind: 'task_failed',
      artifacts: [{
        type: 'note',
        ref: 'worker://claude/raw-output',
        description: 'Claude worker returned non-JSON output.',
      }],
      proposed_checks: [{
        name: 'structured-json-output',
        passed: false,
        detail: 'Claude worker did not return the required JSON object.',
      }],
      raw_output: output,
      invocation: null,
      process_output: null,
    };
  }

  return {
    summary: trimmed.split(/\r?\n/).find(Boolean)?.slice(0, 240) || fallbackSummary,
    status: 'success',
    failure_kind: null,
    artifacts: [{
      type: 'note',
      ref: `worker://claude/freeform/${request.mission_id}`,
      description: trimmed.slice(0, 400),
    }],
    proposed_checks: [{
      name: 'freeform-output-captured',
      passed: true,
      detail: 'Claude returned usable freeform text for a note-only mission.',
    }],
    raw_output: output,
    invocation: null,
    process_output: null,
  };
}

function parseWorkerResult(output: string, request: ExecutionRequest, fallbackSummary: string): WorkerExecutionResult {
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
      summary: payload.summary?.trim() || fallbackSummary,
      status,
      failure_kind: status === 'failed' ? 'task_failed' : null,
      artifacts: normalizeArtifacts(payload.artifacts),
      proposed_checks: normalizeChecks(payload.proposed_checks),
      raw_output: output,
      invocation: null,
      process_output: null,
    };
  } catch {
    return buildFreeformFallback(output, request, fallbackSummary);
  }
}

export class ClaudeCliAdapter implements WorkerAdapter {
  readonly name = 'claude' as const;

  async execute(request: ExecutionRequest): Promise<WorkerExecutionResult> {
    const prompt = [
      request.prompt,
      `Working directory: ${request.cwd}`,
      'Any non-JSON output is invalid. Return raw JSON only, with no prose before or after it.',
      'Return strict JSON only. Do not wrap the JSON in commentary.',
    ].join('\n');

    let result;
    try {
      result = await runCommand('claude', [
        '-p',
        '--no-session-persistence',
        '--output-format', 'json',
        '--allow-dangerously-skip-permissions',
        '--dangerously-skip-permissions',
        '--permission-mode', 'bypassPermissions',
      ], {
        cwd: request.cwd,
        env: toEnvRecord({}),
        timeoutMs: 180000,
        stdin: prompt,
      });
    } catch (error) {
      if (isSpawnCommandMissing(error)) {
        return {
          summary: 'Claude worker is not available on this machine.',
          status: 'failed',
          failure_kind: 'worker_unavailable',
          artifacts: [{
            type: 'note',
            ref: 'worker://claude/not-available',
            description: 'Claude CLI could not be started from the current PATH.',
          }],
          proposed_checks: [{
            name: 'claude-cli-available',
            passed: false,
            detail: 'Claude CLI could not be started from the current PATH.',
          }],
          raw_output: String(error),
          invocation: null,
          process_output: null,
        };
      }
      throw error;
    }

    if (result.exitCode !== 0) {
      return {
        summary: `Claude worker exited with code ${String(result.exitCode)}.`,
        status: 'failed',
        failure_kind: 'task_failed',
        artifacts: [{
          type: 'note',
          ref: 'worker://claude/exit-code',
          description: result.stderr.trim() || result.stdout.trim() || 'Claude worker failed.',
        }],
        proposed_checks: [{
          name: 'claude-exit-code-zero',
          passed: false,
          detail: `Claude worker exited with code ${String(result.exitCode)}.`,
        }],
        raw_output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
        invocation: {
          command: 'claude',
          args: [
            '-p',
            '--output-format', 'json',
            '--allow-dangerously-skip-permissions',
            '--dangerously-skip-permissions',
            '--permission-mode', 'bypassPermissions',
            '[prompt]',
          ],
          cwd: request.cwd,
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          started_at: result.startedAt,
          completed_at: result.completedAt,
          transport: 'cli',
        },
        process_output: {
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    }

    try {
      const envelope = JSON.parse(result.stdout) as { result?: string };
      const parsed = parseWorkerResult(envelope.result ?? result.stdout, request, 'Claude worker completed without a structured summary.');
      parsed.invocation = {
        command: 'claude',
        args: [
          '-p',
          '--output-format', 'json',
          '--allow-dangerously-skip-permissions',
          '--dangerously-skip-permissions',
          '--permission-mode', 'bypassPermissions',
          '[prompt]',
        ],
        cwd: request.cwd,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        transport: 'cli',
      };
      parsed.process_output = {
        stdout: result.stdout,
        stderr: result.stderr,
      };
      return parsed;
    } catch {
      const parsed = parseWorkerResult(result.stdout, request, 'Claude worker completed without a structured summary.');
      parsed.invocation = {
        command: 'claude',
        args: [
          '-p',
          '--output-format', 'json',
          '--allow-dangerously-skip-permissions',
          '--dangerously-skip-permissions',
          '--permission-mode', 'bypassPermissions',
          '[prompt]',
        ],
        cwd: request.cwd,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        transport: 'cli',
      };
      parsed.process_output = {
        stdout: result.stdout,
        stderr: result.stderr,
      };
      return parsed;
    }
  }
}

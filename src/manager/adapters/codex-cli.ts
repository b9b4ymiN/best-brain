import fs from 'fs';
import os from 'os';
import path from 'path';
import type { VerificationArtifact, VerificationCheck } from '../../types.ts';
import type { WorkerAdapter } from './types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import {
  detectCodexProviderIssue,
  extractCodexStreamError,
  extractCodexStreamMessage,
  extractJsonText,
  isSpawnCommandMissing,
  runCommand,
  toEnvRecord,
} from './shared.ts';

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
        ref: 'worker://codex/raw-output',
        description: 'Codex worker returned non-JSON output.',
      }],
      proposed_checks: [{
        name: 'structured-json-output',
        passed: false,
        detail: 'Codex worker did not return the required JSON object.',
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
      ref: `worker://codex/freeform/${request.mission_id}`,
      description: trimmed.slice(0, 400),
    }],
    proposed_checks: [{
      name: 'freeform-output-captured',
      passed: true,
      detail: 'Codex returned usable freeform text for a note-only mission.',
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

function tryParseStructuredWorkerResult(output: string, fallbackSummary: string): WorkerExecutionResult | null {
  try {
    const payload = JSON.parse(extractJsonText(output)) as {
      summary?: string;
      status?: WorkerExecutionResult['status'];
      artifacts?: unknown;
      proposed_checks?: unknown;
    };

    if (payload.status !== 'success' && payload.status !== 'needs_retry' && payload.status !== 'failed') {
      return null;
    }

    return {
      summary: payload.summary?.trim() || fallbackSummary,
      status: payload.status,
      failure_kind: payload.status === 'failed' ? 'task_failed' : null,
      artifacts: normalizeArtifacts(payload.artifacts),
      proposed_checks: normalizeChecks(payload.proposed_checks),
      raw_output: output,
      invocation: null,
      process_output: null,
    };
  } catch {
    return null;
  }
}

export class CodexCliAdapter implements WorkerAdapter {
  readonly name = 'codex' as const;

  private buildProviderUnavailableResult(summary: string, rawOutput: string): WorkerExecutionResult {
    return {
      summary,
      status: 'failed',
      failure_kind: 'provider_unavailable',
      artifacts: [{
        type: 'note',
        ref: 'worker://codex/provider-unavailable',
        description: summary,
      }],
      proposed_checks: [{
        name: 'codex-provider-available',
        passed: false,
        detail: summary,
      }],
      raw_output: rawOutput,
      invocation: null,
      process_output: null,
    };
  }

  async execute(
    request: ExecutionRequest,
    observer?: { onTrace?: (event: import('../types.ts').ManagerProgressEvent) => void | Promise<void> },
  ): Promise<WorkerExecutionResult> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-codex-'));
    const lastMessageFile = path.join(tempDir, 'last-message.txt');
    const prompt = [
      request.prompt,
      `Working directory: ${request.cwd}`,
      'Any non-JSON output is invalid. Return raw JSON only, with no prose before or after it.',
      'Return strict JSON only. Do not wrap the JSON in commentary.',
    ].join('\n');

    try {
      let result;
      try {
        await observer?.onTrace?.({
          stage: 'worker_codex_command_start',
          actor: 'codex',
          kind: 'command_start',
          status: 'started',
          title: 'Codex worker started',
          detail: request.task_title,
          timestamp: Date.now(),
          mission_id: request.mission_id,
          task_id: request.task_id,
          decision_kind: 'mission',
          requested_worker: request.selected_worker,
          executed_worker: 'codex',
          blocked_reason_code: null,
          worker: 'codex',
        });
        result = await runCommand('codex', [
          'exec',
          '--json',
          '--dangerously-bypass-approvals-and-sandbox',
          '--sandbox', 'danger-full-access',
          '--skip-git-repo-check',
          '-c', 'model_reasoning_effort=high',
          '--output-last-message', lastMessageFile,
          '-C', request.cwd,
          '-',
        ], {
          cwd: request.cwd,
          env: toEnvRecord({}),
          timeoutMs: 300000,
          stdin: prompt,
          onStdoutLine: async (line) => {
            try {
              const payload = JSON.parse(line) as { msg?: { type?: string; message?: string } };
              if (payload.msg?.type === 'task_started') {
                await observer?.onTrace?.({
                  stage: 'worker_codex_task_started',
                  actor: 'codex',
                  kind: 'status',
                  status: 'started',
                  title: 'Codex task started',
                  detail: 'Codex accepted the worker task.',
                  timestamp: Date.now(),
                  mission_id: request.mission_id,
                  task_id: request.task_id,
                  decision_kind: 'mission',
                  requested_worker: request.selected_worker,
                  executed_worker: 'codex',
                  blocked_reason_code: null,
                  worker: 'codex',
                });
              } else if (payload.msg?.type === 'agent_message' && typeof payload.msg.message === 'string' && payload.msg.message.trim()) {
                await observer?.onTrace?.({
                  stage: 'worker_codex_update',
                  actor: 'codex',
                  kind: 'status',
                  status: 'started',
                  title: 'Codex update',
                  detail: payload.msg.message.trim().slice(0, 220),
                  timestamp: Date.now(),
                  mission_id: request.mission_id,
                  task_id: request.task_id,
                  decision_kind: 'mission',
                  requested_worker: request.selected_worker,
                  executed_worker: 'codex',
                  blocked_reason_code: null,
                  worker: 'codex',
                });
              } else if (payload.msg?.type === 'error' && typeof payload.msg.message === 'string') {
                await observer?.onTrace?.({
                  stage: 'worker_codex_error',
                  actor: 'codex',
                  kind: 'error',
                  status: 'failed',
                  title: 'Codex error',
                  detail: payload.msg.message.trim().slice(0, 220),
                  timestamp: Date.now(),
                  mission_id: request.mission_id,
                  task_id: request.task_id,
                  decision_kind: 'mission',
                  requested_worker: request.selected_worker,
                  executed_worker: 'codex',
                  blocked_reason_code: null,
                  worker: 'codex',
                });
              }
            } catch {
              // Ignore non-JSON lines.
            }
          },
        });
      } catch (error) {
        if (isSpawnCommandMissing(error)) {
          return {
            summary: 'Codex worker is not available on this machine.',
            status: 'failed',
            failure_kind: 'worker_unavailable',
            artifacts: [{
              type: 'note',
              ref: 'worker://codex/not-available',
              description: 'Codex CLI could not be started from the current PATH.',
            }],
            proposed_checks: [{
              name: 'codex-cli-available',
              passed: false,
              detail: 'Codex CLI could not be started from the current PATH.',
            }],
            raw_output: String(error),
            invocation: null,
            process_output: null,
          };
        }
        throw error;
      }

      const lastMessage = fs.existsSync(lastMessageFile)
        ? fs.readFileSync(lastMessageFile, 'utf8')
        : result.stdout;
      const streamMessage = extractCodexStreamMessage(result.stdout);
      const streamError = extractCodexStreamError(result.stdout);
      const providerIssue = detectCodexProviderIssue([result.stdout, result.stderr, streamError].filter(Boolean).join('\n'));
      const preferredOutput = lastMessage.trim().length > 0
        ? lastMessage
        : streamMessage ?? result.stdout;

      if (providerIssue) {
        const unavailable = this.buildProviderUnavailableResult(
          providerIssue,
          [result.stdout, result.stderr, lastMessage, streamError].filter(Boolean).join('\n'),
        );
        unavailable.invocation = {
          command: 'codex',
          args: [
            'exec',
            '--json',
            '--dangerously-bypass-approvals-and-sandbox',
            '--sandbox', 'danger-full-access',
            '--skip-git-repo-check',
            '-c', 'model_reasoning_effort=high',
            '--output-last-message', '[temp-file]',
            '-C', request.cwd,
            '[prompt]',
          ],
          cwd: request.cwd,
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          started_at: result.startedAt,
          completed_at: result.completedAt,
          transport: 'cli',
        };
        unavailable.process_output = {
          stdout: result.stdout,
          stderr: result.stderr,
        };
        await observer?.onTrace?.({
          stage: 'worker_codex_command_end',
          actor: 'codex',
          kind: 'command_end',
          status: 'failed',
          title: 'Codex worker unavailable',
          detail: unavailable.summary,
          timestamp: Date.now(),
          mission_id: request.mission_id,
          task_id: request.task_id,
          decision_kind: 'mission',
          requested_worker: request.selected_worker,
          executed_worker: 'codex',
          blocked_reason_code: null,
          worker: 'codex',
          exit_code: result.exitCode,
        });
        return unavailable;
      }

      if (result.exitCode !== 0) {
        const parsedFromFailure = tryParseStructuredWorkerResult(preferredOutput, 'Codex worker completed without a structured summary.');
        if (parsedFromFailure) {
          await observer?.onTrace?.({
            stage: 'worker_codex_command_end',
            actor: 'codex',
            kind: 'command_end',
            status: parsedFromFailure.status === 'success' ? 'completed' : 'failed',
            title: parsedFromFailure.status === 'success' ? 'Codex worker completed' : 'Codex worker finished with issues',
            detail: parsedFromFailure.summary.slice(0, 220),
            timestamp: Date.now(),
            mission_id: request.mission_id,
            task_id: request.task_id,
            decision_kind: 'mission',
            requested_worker: request.selected_worker,
            executed_worker: 'codex',
            blocked_reason_code: null,
            worker: 'codex',
            exit_code: result.exitCode,
          });
          parsedFromFailure.raw_output = [result.stdout, result.stderr, lastMessage].filter(Boolean).join('\n');
          parsedFromFailure.invocation = {
            command: 'codex',
            args: [
              'exec',
              '--json',
              '--dangerously-bypass-approvals-and-sandbox',
              '--sandbox', 'danger-full-access',
              '--skip-git-repo-check',
              '-c', 'model_reasoning_effort=high',
              '--output-last-message', '[temp-file]',
              '-C', request.cwd,
              '[prompt]',
            ],
            cwd: request.cwd,
            exit_code: result.exitCode,
            timed_out: result.timedOut,
            started_at: result.startedAt,
            completed_at: result.completedAt,
            transport: 'cli',
          };
          parsedFromFailure.process_output = {
            stdout: result.stdout,
            stderr: result.stderr,
          };
          return parsedFromFailure;
        }

        await observer?.onTrace?.({
          stage: 'worker_codex_command_end',
          actor: 'codex',
          kind: 'command_end',
          status: 'failed',
          title: 'Codex worker failed',
          detail: `Codex exited with code ${String(result.exitCode)}.`,
          timestamp: Date.now(),
          mission_id: request.mission_id,
          task_id: request.task_id,
          decision_kind: 'mission',
          requested_worker: request.selected_worker,
          executed_worker: 'codex',
          blocked_reason_code: null,
          worker: 'codex',
          exit_code: result.exitCode,
        });

        return {
          summary: `Codex worker exited with code ${String(result.exitCode)}.`,
          status: 'failed',
          failure_kind: 'task_failed',
          artifacts: [{
            type: 'note',
            ref: 'worker://codex/exit-code',
            description: result.stderr.trim() || lastMessage.trim() || 'Codex worker failed.',
          }],
          proposed_checks: [{
            name: 'codex-exit-code-zero',
            passed: false,
            detail: `Codex worker exited with code ${String(result.exitCode)}.`,
          }],
          raw_output: [result.stdout, result.stderr, lastMessage].filter(Boolean).join('\n'),
          invocation: {
            command: 'codex',
            args: [
              'exec',
              '--json',
              '--dangerously-bypass-approvals-and-sandbox',
              '--sandbox', 'danger-full-access',
              '--skip-git-repo-check',
              '-c', 'model_reasoning_effort=high',
              '--output-last-message', '[temp-file]',
              '-C', request.cwd,
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

      const parsed = parseWorkerResult(preferredOutput, request, 'Codex worker completed without a structured summary.');
      await observer?.onTrace?.({
        stage: 'worker_codex_command_end',
        actor: 'codex',
        kind: 'command_end',
        status: parsed.status === 'success' ? 'completed' : 'failed',
        title: parsed.status === 'success' ? 'Codex worker completed' : 'Codex worker finished with issues',
        detail: parsed.summary.slice(0, 220),
        timestamp: Date.now(),
        mission_id: request.mission_id,
        task_id: request.task_id,
        decision_kind: 'mission',
        requested_worker: request.selected_worker,
        executed_worker: 'codex',
        blocked_reason_code: null,
        worker: 'codex',
        exit_code: result.exitCode,
      });
      parsed.invocation = {
        command: 'codex',
        args: [
          'exec',
          '--json',
          '--dangerously-bypass-approvals-and-sandbox',
          '--sandbox', 'danger-full-access',
          '--skip-git-repo-check',
          '-c', 'model_reasoning_effort=high',
          '--output-last-message', '[temp-file]',
          '-C', request.cwd,
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
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Ignore temp cleanup issues on Windows.
      }
    }
  }
}

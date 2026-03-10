import fs from 'fs';
import os from 'os';
import path from 'path';
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

export class CodexCliAdapter implements WorkerAdapter {
  readonly name = 'codex' as const;

  async execute(request: ExecutionRequest): Promise<WorkerExecutionResult> {
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
        result = await runCommand('codex', [
          'exec',
          '--json',
          '--full-auto',
          '--skip-git-repo-check',
          '-c', 'model_reasoning_effort=high',
          '--output-last-message', lastMessageFile,
          '-C', request.cwd,
          '-',
        ], {
          cwd: request.cwd,
          env: toEnvRecord({}),
          timeoutMs: 180000,
          stdin: prompt,
        });
      } catch (error) {
        if (isSpawnCommandMissing(error)) {
          return {
            summary: 'Codex worker is not available on this machine.',
            status: 'failed',
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

      if (result.exitCode !== 0) {
        return {
          summary: `Codex worker exited with code ${String(result.exitCode)}.`,
          status: 'failed',
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
              '--full-auto',
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

      const parsed = parseWorkerResult(lastMessage, request, 'Codex worker completed without a structured summary.');
      parsed.invocation = {
        command: 'codex',
        args: [
          'exec',
          '--json',
          '--full-auto',
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

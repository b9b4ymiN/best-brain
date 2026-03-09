import type { VerificationArtifact, VerificationCheck } from '../../types.ts';
import type { WorkerAdapter } from './types.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../types.ts';
import { extractJsonText, runCommand, toEnvRecord } from './shared.ts';

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
        ref: 'worker://claude/raw-output',
        description: 'Claude worker returned non-JSON output.',
      }],
      proposed_checks: [{
        name: 'structured-json-output',
        passed: false,
        detail: 'Claude worker did not return the required JSON object.',
      }],
      raw_output: output,
    };
  }

  return {
    summary: trimmed.split(/\r?\n/).find(Boolean)?.slice(0, 240) || fallbackSummary,
    status: 'success',
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

    const result = await runCommand('claude', [
      '-p',
      '--output-format', 'json',
      '--allow-dangerously-skip-permissions',
      '--dangerously-skip-permissions',
      '--permission-mode', 'bypassPermissions',
      prompt,
    ], {
      cwd: request.cwd,
      env: toEnvRecord({}),
      timeoutMs: 180000,
    });

    if (result.exitCode !== 0) {
      return {
        summary: `Claude worker exited with code ${String(result.exitCode)}.`,
        status: 'failed',
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
      };
    }

    try {
      const envelope = JSON.parse(result.stdout) as { result?: string };
      return parseWorkerResult(envelope.result ?? result.stdout, request, 'Claude worker completed without a structured summary.');
    } catch {
      return parseWorkerResult(result.stdout, request, 'Claude worker completed without a structured summary.');
    }
  }
}

import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';

function run(command: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function parseJsonOutput<T>(stdout: string): T | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

const tasks = [
  { id: 'thin_manager', script: 'smoke:manager' },
  { id: 'claude_primary', script: 'smoke:manager:claude' },
  { id: 'codex_primary', script: 'smoke:manager:codex' },
  { id: 'shell_primary', script: 'smoke:manager:shell' },
  { id: 'restore_retry', script: 'smoke:manager:restore' },
  { id: 'ambiguity_blocked', script: 'smoke:manager:ambiguity' },
] as const;

const results: Record<string, {
  pass: boolean;
  exit_code: number | null;
  output_excerpt: string;
  parsed: Record<string, unknown> | null;
}> = {};

for (const task of tasks) {
  const result = await run('bun', ['run', task.script]);
  const parsed = parseJsonOutput<Record<string, unknown>>(result.stdout);
  results[task.id] = {
    pass: result.exitCode === 0,
    exit_code: result.exitCode,
    output_excerpt: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n').slice(0, 400),
    parsed,
  };
}

const successRuns = [results.thin_manager, results.claude_primary, results.codex_primary, results.shell_primary]
  .filter((result) => result.parsed != null);
const completenessScores = successRuns
  .map((result) => Number((result.parsed?.mission_brief_validation as { completeness_score?: number } | undefined)?.completeness_score))
  .filter((value) => Number.isFinite(value));
const ambiguityRun = results.ambiguity_blocked.parsed;
const ambiguityBlockedCorrectly = ambiguityRun != null
  && (ambiguityRun.goal_ambiguity as { is_ambiguous?: boolean } | undefined)?.is_ambiguous === true
  && (ambiguityRun.decision as { should_execute?: boolean; blocked_reason?: string | null } | undefined)?.should_execute === false
  && typeof (ambiguityRun.decision as { blocked_reason?: string | null } | undefined)?.blocked_reason === 'string';
const blockedRuns = [ambiguityRun].filter((result): result is Record<string, unknown> => result != null);
const blockedCorrectReasonRate = blockedRuns.length === 0
  ? null
  : Math.round((blockedRuns.filter(() => ambiguityBlockedCorrectly).length / blockedRuns.length) * 100);
const falseCompleteCount = [results.thin_manager, results.claude_primary, results.codex_primary, results.shell_primary, results.restore_retry, results.ambiguity_blocked]
  .reduce((total, result) => {
    const verificationStatus = (result.parsed?.verification_result as { status?: string } | null | undefined)?.status;
    const blockedReason = (result.parsed?.decision as { blocked_reason?: string | null } | undefined)?.blocked_reason;
    const evidenceArtifacts = (result.parsed?.worker_result as { artifacts?: unknown[] } | null | undefined)?.artifacts?.length ?? 0;
    if (verificationStatus === 'verified_complete' && (blockedReason != null || evidenceArtifacts === 0)) {
      return total + 1;
    }
    return total;
  }, 0);
const runtimeSessionCapture = successRuns.every((result) => {
  const runtimeBundle = result.parsed?.runtime_bundle as {
    session?: { status?: string };
  } | null | undefined;
  return runtimeBundle?.session?.status === 'completed';
});
const checkpointCapture = [results.claude_primary, results.codex_primary, results.shell_primary].every((result) => {
  const runtimeBundle = result.parsed?.runtime_bundle as {
    checkpoints?: unknown[];
  } | null | undefined;
  return Array.isArray(runtimeBundle?.checkpoints) && runtimeBundle.checkpoints.length >= 2;
});
const checkpointRestoreCapture = ((results.restore_retry.parsed?.runtime_bundle as {
  events?: Array<{ event_type?: string }>;
} | null | undefined)?.events ?? []).some((event) => event.event_type === 'checkpoint_restored');

const payload = {
  generated_at: new Date().toISOString(),
  thin_manager_pass: results.thin_manager.pass,
  claude_primary_pass: results.claude_primary.pass,
  codex_primary_pass: results.codex_primary.pass,
  shell_primary_pass: results.shell_primary.pass,
  mission_brief_completeness: completenessScores.length === 0
    ? null
    : Math.round(completenessScores.reduce((total, value) => total + value, 0) / completenessScores.length),
  goal_ambiguity_detection: ambiguityBlockedCorrectly,
  false_complete_count: falseCompleteCount,
  blocked_with_correct_reason_rate: blockedCorrectReasonRate,
  runtime_session_capture: runtimeSessionCapture,
  checkpoint_capture: checkpointCapture,
  checkpoint_restore_capture: checkpointRestoreCapture,
  runs: results,
};

const outputPath = path.resolve(process.cwd(), 'artifacts/manager-proof.latest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));

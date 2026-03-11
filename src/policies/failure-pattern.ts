import type { CompletionProofState } from '../types.ts';
import type { WorkerExecutionResult } from '../manager/types.ts';

export const FAILURE_ROOT_CAUSES = [
  'worker_error',
  'invalid_input',
  'ambiguous_goal',
  'verification_gap',
] as const;

export type FailureRootCause = (typeof FAILURE_ROOT_CAUSES)[number];

export interface FailurePattern {
  root_cause: FailureRootCause;
  cause: string;
  lesson: string;
  prevention: string;
}

function containsAny(value: string, patterns: string[]): boolean {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function classifyFailurePattern(input: {
  goal: string;
  workerResult: WorkerExecutionResult;
  verificationStatus: CompletionProofState['status'];
  blockedReason?: string | null;
}): FailurePattern {
  const workerSummary = input.workerResult.summary.toLowerCase();
  const blockedReason = (input.blockedReason ?? '').toLowerCase();
  const combined = `${workerSummary}\n${blockedReason}`;

  if (containsAny(combined, ['ambiguous', 'missing work_target', 'clarification'])) {
    return {
      root_cause: 'ambiguous_goal',
      cause: 'The mission goal lacked enough explicit target detail to execute safely without assumptions.',
      lesson: 'Clarify the work target and acceptance scope before dispatching workers.',
      prevention: 'Require one concrete work target and expected output before mission execution.',
    };
  }

  if (containsAny(combined, ['no_available_input_adapter', 'market data unavailable', 'stale input', 'invalid input', 'missing input'])) {
    return {
      root_cause: 'invalid_input',
      cause: 'Required input/data was unavailable, stale, or invalid for the mission acceptance profile.',
      lesson: 'Block early with the explicit missing input reason rather than forcing execution.',
      prevention: 'Validate required input adapters before worker dispatch and fail closed when required inputs are missing.',
    };
  }

  if (containsAny(combined, ['enoent', 'spawn', 'provider unavailable', 'usage limit', 'exit code', 'timeout', 'failed to execute'])) {
    return {
      root_cause: 'worker_error',
      cause: 'The selected worker runtime failed before it could produce a complete, verifiable output.',
      lesson: 'Treat worker transport/runtime failures as infrastructure faults, not mission completion.',
      prevention: 'Apply retry/fallback policy and only continue once a worker returns valid artifacts and checks.',
    };
  }

  return {
    root_cause: 'verification_gap',
    cause: `Worker output did not satisfy verification gates for the mission objective: ${input.goal}`,
    lesson: 'Do not treat partial output as done until evidence and checks pass.',
    prevention: 'Repair the mission output against the verifier checklist before closing the mission.',
  };
}

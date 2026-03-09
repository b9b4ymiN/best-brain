import type { ManagerDecision, ManagerInput, ManagerWorker, ManagerWorkerPreference } from './types.ts';
import { tokenize } from '../utils/text.ts';

const CHAT_HINTS = ['what', 'why', 'explain', 'compare', 'brainstorm', 'think', 'help', 'question'];
const EXECUTION_HINTS = ['implement', 'edit', 'fix', 'write', 'run', 'ship', 'build', 'execute', 'verify', 'save'];
const MISSION_HINTS = ['mission', 'complete', 'proof', 'verification', 'deliver', 'finish'];
const ANALYSIS_HINTS = ['analyze', 'analysis', 'review', 'plan', 'draft', 'outline', 'summarize'];
const CODE_HINTS = ['code', 'repo', 'typescript', 'bun', 'test', 'server', 'cli', 'script', 'file'];

function includesAny(tokens: string[], hints: string[]): boolean {
  return hints.some((hint) => tokens.includes(hint));
}

export function selectWorker(goal: string, preference: ManagerWorkerPreference): ManagerWorker | null {
  if (preference === 'claude' || preference === 'codex') {
    return preference;
  }

  const tokens = tokenize(goal);
  if (includesAny(tokens, CODE_HINTS) || includesAny(tokens, EXECUTION_HINTS)) {
    return 'codex';
  }

  if (includesAny(tokens, ANALYSIS_HINTS) || includesAny(tokens, CHAT_HINTS)) {
    return 'claude';
  }

  return 'claude';
}

export function routeIntent(input: ManagerInput): ManagerDecision {
  const tokens = tokenize(input.goal);
  const hasExecution = includesAny(tokens, EXECUTION_HINTS);
  const hasMission = input.mission_id != null || includesAny(tokens, MISSION_HINTS);
  const hasAnalysis = includesAny(tokens, ANALYSIS_HINTS);
  const hasQuestion = input.goal.trim().endsWith('?') || includesAny(tokens, CHAT_HINTS);

  let kind: ManagerDecision['kind'] = 'task';
  let reason = 'defaulted to task because the goal implies real work with a bounded scope.';

  if ((hasQuestion || hasAnalysis) && !hasExecution && !hasMission) {
    kind = 'chat';
    reason = 'classified as chat because the goal asks for guidance or analysis without execution verbs.';
  } else if (hasMission || (hasExecution && includesAny(tokens, CODE_HINTS))) {
    kind = 'mission';
    reason = 'classified as mission because the goal implies repo changes, execution, or proof-of-done.';
  }

  return {
    kind,
    should_execute: kind !== 'chat' && !input.dry_run && !input.no_execute,
    selected_worker: kind === 'chat' ? null : selectWorker(input.goal, input.worker_preference),
    reason,
    verification_required: kind !== 'chat',
  };
}

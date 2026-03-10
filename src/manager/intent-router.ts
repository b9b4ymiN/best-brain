import type { ManagerDecision, ManagerInput, ManagerWorker, ManagerWorkerPreference } from './types.ts';
import { tokenize } from '../utils/text.ts';
import { isThaiEquitiesActualManagerGoal } from '../proving/packs.ts';

const CHAT_HINTS = ['what', 'why', 'explain', 'compare', 'brainstorm', 'think', 'help', 'question'];
const EXECUTION_HINTS = ['implement', 'edit', 'fix', 'write', 'run', 'ship', 'build', 'execute', 'verify', 'save'];
const MISSION_HINTS = ['mission', 'complete', 'proof', 'verification', 'deliver', 'finish'];
const SYSTEM_HINTS = ['system', 'platform', 'workflow', 'pipeline', 'service', 'scanner', 'tool'];
const ANALYSIS_HINTS = ['analyze', 'analysis', 'review', 'plan', 'draft', 'outline', 'summarize'];
const CODE_HINTS = ['code', 'repo', 'typescript', 'bun', 'test', 'server', 'cli', 'script', 'file'];
const WORK_TARGET_HINTS = ['file', 'repo', 'server', 'script', 'report', 'browser', 'mail', 'stock', 'scanner', 'system', 'web'];
const IMPLEMENT_HINTS = ['implement', 'edit', 'fix', 'write', 'patch', 'scaffold'];
const SHELL_HINTS = ['run', 'build', 'lint', 'smoke', 'terminal', 'shell', 'powershell', 'command'];
const THAI_CHAT_HINTS = [
  '\u0e2d\u0e30\u0e44\u0e23',
  '\u0e17\u0e33\u0e44\u0e21',
  '\u0e22\u0e31\u0e07\u0e44\u0e07',
  '\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e44\u0e2b\u0e23\u0e48',
  '\u0e01\u0e35\u0e48\u0e42\u0e21\u0e07',
  '\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23',
  '\u0e27\u0e31\u0e19\u0e44\u0e2b\u0e19',
  '\u0e2d\u0e18\u0e34\u0e1a\u0e32\u0e22',
  '\u0e2a\u0e23\u0e38\u0e1b',
  '\u0e0a\u0e48\u0e27\u0e22\u0e04\u0e34\u0e14',
  '\u0e16\u0e32\u0e21',
];
const THAI_EXECUTION_HINTS = [
  '\u0e2a\u0e23\u0e49\u0e32\u0e07',
  '\u0e41\u0e01\u0e49',
  '\u0e40\u0e02\u0e35\u0e22\u0e19',
  '\u0e23\u0e31\u0e19',
  '\u0e17\u0e14\u0e2a\u0e2d\u0e1a',
  '\u0e15\u0e23\u0e27\u0e08',
  '\u0e2a\u0e41\u0e01\u0e19',
  '\u0e2a\u0e48\u0e07\u0e2d\u0e2d\u0e01',
  '\u0e2a\u0e23\u0e38\u0e1b\u0e07\u0e32\u0e19',
  '\u0e17\u0e33\u0e23\u0e30\u0e1a\u0e1a',
];
const THAI_MISSION_HINTS = [
  '\u0e42\u0e1b\u0e23\u0e40\u0e08\u0e04',
  '\u0e20\u0e32\u0e23\u0e01\u0e34\u0e08',
  '\u0e17\u0e33\u0e08\u0e19\u0e40\u0e2a\u0e23\u0e47\u0e08',
  '\u0e15\u0e23\u0e27\u0e08\u0e43\u0e2b\u0e49\u0e1c\u0e48\u0e32\u0e19',
  '\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19',
];
const THAI_SYSTEM_HINTS = [
  '\u0e23\u0e30\u0e1a\u0e1a',
  '\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e21\u0e37\u0e2d',
  '\u0e40\u0e27\u0e34\u0e23\u0e4c\u0e01\u0e42\u0e1f\u0e25\u0e27\u0e4c',
  '\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19',
];
const THAI_WORK_TARGET_HINTS = [
  '\u0e44\u0e1f\u0e25\u0e4c',
  '\u0e23\u0e30\u0e1a\u0e1a',
  '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19',
  '\u0e40\u0e27\u0e47\u0e1a',
  '\u0e40\u0e21\u0e25',
  '\u0e2b\u0e38\u0e49\u0e19',
  '\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19',
];
const OWNER_WANT_HINTS = ['i want', 'want a', 'want an', 'want the', 'need a', 'need an'];
const THAI_OWNER_WANT_HINTS = ['\u0e2d\u0e22\u0e32\u0e01\u0e44\u0e14\u0e49', '\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23'];

function includesAny(tokens: string[], hints: string[]): boolean {
  return hints.some((hint) => tokens.includes(hint));
}

function includesAnyText(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}

export function selectWorker(goal: string, preference: ManagerWorkerPreference): ManagerWorker | null {
  if (preference === 'claude' || preference === 'codex' || preference === 'shell') {
    return preference;
  }

  const tokens = tokenize(goal);
  const isActualThaiEquitiesMission = isThaiEquitiesActualManagerGoal(goal);
  const hasExplicitCommand = goal.includes('`');
  const hasImplementationIntent = includesAny(tokens, IMPLEMENT_HINTS);

  if (isActualThaiEquitiesMission) {
    return hasImplementationIntent ? 'codex' : 'claude';
  }

  if (hasExplicitCommand || (includesAny(tokens, SHELL_HINTS) && !hasImplementationIntent)) {
    return 'shell';
  }

  if (includesAny(tokens, CODE_HINTS) || hasImplementationIntent) {
    return 'codex';
  }

  if (includesAny(tokens, ANALYSIS_HINTS) || includesAny(tokens, CHAT_HINTS)) {
    return 'claude';
  }

  return 'claude';
}

export function routeIntent(input: ManagerInput): ManagerDecision {
  const tokens = tokenize(input.goal);
  const goalText = input.goal.trim().toLowerCase();
  const isActualThaiEquitiesMission = isThaiEquitiesActualManagerGoal(input.goal);
  const hasExecution = includesAny(tokens, EXECUTION_HINTS) || includesAnyText(goalText, THAI_EXECUTION_HINTS);
  const hasMission = input.mission_id != null || includesAny(tokens, MISSION_HINTS) || includesAnyText(goalText, THAI_MISSION_HINTS);
  const hasSystemGoal = includesAny(tokens, SYSTEM_HINTS) || includesAnyText(goalText, THAI_SYSTEM_HINTS);
  const hasWorkTarget = includesAny(tokens, WORK_TARGET_HINTS) || includesAnyText(goalText, THAI_WORK_TARGET_HINTS);
  const hasAnalysis = includesAny(tokens, ANALYSIS_HINTS);
  const ownerWantsAnOutcome = includesAnyText(goalText, OWNER_WANT_HINTS) || includesAnyText(goalText, THAI_OWNER_WANT_HINTS);
  const hasQuestion = input.goal.trim().endsWith('?')
    || input.goal.trim().endsWith('？')
    || includesAny(tokens, CHAT_HINTS)
    || includesAnyText(goalText, THAI_CHAT_HINTS);

  let kind: ManagerDecision['kind'] = 'task';
  let reason = 'defaulted to task because the goal implies real work with a bounded scope.';

  if (isActualThaiEquitiesMission) {
    kind = 'mission';
    reason = 'classified as mission because a stock-scanner system goal requires manager-led planning, worker control, and proof.';
  } else if (hasSystemGoal && (hasExecution || hasMission || ownerWantsAnOutcome)) {
    kind = 'mission';
    reason = 'classified as mission because the goal asks the manager to create or deliver a system, not only answer a question.';
  } else if (!hasExecution && !hasMission && !hasWorkTarget) {
    kind = 'chat';
    reason = 'classified as chat because the goal does not indicate executable work or a concrete work target.';
  } else if ((hasQuestion || hasAnalysis) && !hasExecution && !hasMission) {
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
    blocked_reason: null,
    blocked_reason_code: null,
  };
}

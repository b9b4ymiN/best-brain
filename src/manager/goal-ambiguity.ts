import { tokenize } from '../utils/text.ts';
import type { GoalAmbiguityAssessment, ManagerDecision, ManagerInput } from './types.ts';

const DANGLING_REFERENCE_TOKENS = [
  'it',
  'this',
  'that',
  'them',
  'those',
  'same',
  'again',
  'continue',
  'previous',
  'above',
  'below',
] as const;

const LOW_INFORMATION_ACTIONS = [
  'fix',
  'improve',
  'update',
  'handle',
  'check',
  'review',
  'work',
  'do',
  'make',
  'continue',
  'proceed',
  'help',
  'plan',
  'build',
  'implement',
] as const;

const CONCRETE_TARGET_HINTS = [
  'repo',
  'file',
  'server',
  'test',
  'script',
  'scanner',
  'report',
  'mission',
  'verification',
  'proof',
  'owner',
  'preference',
  'preferences',
  'project',
  'status',
  'typescript',
  'bun',
  'stock',
  'equities',
  'browser',
  'mail',
  'worker',
  'manager',
  'brain',
  'system',
  'platform',
  'tool',
  'workflow',
  'command',
  'terminal',
] as const;

const THAI_CONCRETE_TARGET_HINTS = [
  '\u0e2b\u0e38\u0e49\u0e19',
  '\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19',
  '\u0e23\u0e30\u0e1a\u0e1a',
  '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19',
  '\u0e42\u0e1b\u0e23\u0e40\u0e08\u0e04',
  '\u0e44\u0e1f\u0e25\u0e4c',
  '\u0e40\u0e0b\u0e34\u0e23\u0e4c\u0e1f\u0e40\u0e27\u0e2d\u0e23\u0e4c',
  '\u0e40\u0e17\u0e2a\u0e15\u0e4c',
  '\u0e40\u0e17\u0e2a',
  '\u0e23\u0e31\u0e19\u0e40\u0e17\u0e2a',
  '\u0e20\u0e32\u0e23\u0e01\u0e34\u0e08',
  '\u0e07\u0e32\u0e19',
] as const;

const ACTION_SIGNAL_HINTS = [
  'fix',
  'improve',
  'update',
  'handle',
  'check',
  'review',
  'work',
  'do',
  'make',
  'continue',
  'proceed',
  'help',
  'plan',
  'build',
  'implement',
  'run',
  'execute',
  'summarize',
  'analyze',
  'create',
  'generate',
  'write',
  'redesign',
  'refactor',
] as const;

const THAI_ACTION_SIGNAL_HINTS = [
  '\u0e17\u0e33',
  '\u0e23\u0e31\u0e19',
  '\u0e2a\u0e23\u0e49\u0e32\u0e07',
  '\u0e2a\u0e23\u0e38\u0e1b',
  '\u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c',
  '\u0e41\u0e01\u0e49',
  '\u0e15\u0e23\u0e27\u0e08',
] as const;

const MULTI_OBJECTIVE_CONNECTORS = [
  'and',
  'then',
  'plus',
  'also',
] as const;

const THAI_MULTI_OBJECTIVE_CONNECTORS = [
  '\u0e41\u0e25\u0e30',
  '\u0e41\u0e25\u0e49\u0e27',
  '\u0e1e\u0e23\u0e49\u0e2d\u0e21',
  '\u0e01\u0e31\u0e1a',
] as const;

const SUCCESS_CRITERIA_HINTS = [
  'report',
  'summary',
  'summarize',
  'output',
  'artifact',
  'proof',
  'result',
  'deliver',
  'pass',
  'verify',
  'checklist',
] as const;

const THAI_SUCCESS_CRITERIA_HINTS = [
  '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19',
  '\u0e2a\u0e23\u0e38\u0e1b',
  '\u0e2b\u0e25\u0e31\u0e01\u0e10\u0e32\u0e19',
  '\u0e1e\u0e34\u0e2a\u0e39\u0e08\u0e19\u0e4c',
  '\u0e1c\u0e25\u0e25\u0e31\u0e1e\u0e18\u0e4c',
  '\u0e1c\u0e48\u0e32\u0e19',
  '\u0e15\u0e23\u0e27\u0e08',
] as const;

const IMPLICIT_BASELINE_HINTS = [
  'same as before',
  'as usual',
  'as before',
  'like before',
  'as discussed',
  '\u0e40\u0e2b\u0e21\u0e37\u0e2d\u0e19\u0e40\u0e14\u0e34\u0e21',
  '\u0e15\u0e32\u0e21\u0e40\u0e14\u0e34\u0e21',
  '\u0e41\u0e1a\u0e1a\u0e40\u0e14\u0e34\u0e21',
  '\u0e15\u0e32\u0e21\u0e17\u0e35\u0e48\u0e40\u0e04\u0e22\u0e17\u0e33',
] as const;

function includesAny(tokens: string[], hints: readonly string[]): boolean {
  return hints.some((hint) => tokens.includes(hint));
}

function includesAnyText(value: string, hints: readonly string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}

function countHits(tokens: string[], hints: readonly string[]): number {
  return hints.reduce((total, hint) => total + (tokens.includes(hint) ? 1 : 0), 0);
}

function countTextHits(value: string, hints: readonly string[]): number {
  return hints.reduce((total, hint) => total + (value.includes(hint) ? 1 : 0), 0);
}

export function detectGoalAmbiguity(input: ManagerInput, decision: ManagerDecision): GoalAmbiguityAssessment {
  if (decision.kind === 'chat' && decision.chat_mode === 'chat_memory_update') {
    return {
      is_ambiguous: false,
      reason: 'Owner self-facts and conversational memory updates are handled in chat mode.',
      missing_clarifications: [],
      confidence: 'low',
    };
  }

  const tokens = tokenize(input.goal);
  const goalText = input.goal.trim().toLowerCase();
  const missingClarifications: string[] = [];
  const hasMissionAnchor = input.mission_id != null;
  const hasDanglingReference = includesAny(tokens, DANGLING_REFERENCE_TOKENS);
  const hasConcreteTarget = includesAny(tokens, CONCRETE_TARGET_HINTS) || includesAnyText(goalText, THAI_CONCRETE_TARGET_HINTS);
  const hasLowInformationAction = includesAny(tokens, LOW_INFORMATION_ACTIONS);
  const isVeryShortGoal = tokens.length < 4;
  const looksLikeExecutableWork = decision.kind !== 'chat';
  const hasSuccessCriteriaHint = includesAny(tokens, SUCCESS_CRITERIA_HINTS) || includesAnyText(goalText, THAI_SUCCESS_CRITERIA_HINTS);
  const hasImplicitBaselineHint = includesAnyText(goalText, IMPLICIT_BASELINE_HINTS);
  const actionSignalCount = countHits(tokens, ACTION_SIGNAL_HINTS) + countTextHits(goalText, THAI_ACTION_SIGNAL_HINTS);
  const multiObjectiveConnectorCount = countHits(tokens, MULTI_OBJECTIVE_CONNECTORS) + countTextHits(goalText, THAI_MULTI_OBJECTIVE_CONNECTORS);
  const appearsMultiObjective = actionSignalCount >= 2 && multiObjectiveConnectorCount >= 1;

  if (!hasMissionAnchor && hasDanglingReference && !hasConcreteTarget) {
    missingClarifications.push('target_scope');
  }

  if (looksLikeExecutableWork && !hasMissionAnchor && !hasConcreteTarget) {
    missingClarifications.push('work_target');
  }

  if (looksLikeExecutableWork && (isVeryShortGoal || hasLowInformationAction) && !hasMissionAnchor && !hasConcreteTarget) {
    missingClarifications.push('success_criteria');
  }

  if (looksLikeExecutableWork && !hasMissionAnchor && appearsMultiObjective && !hasSuccessCriteriaHint) {
    missingClarifications.push('scope_prioritization');
  }

  if (looksLikeExecutableWork && !hasMissionAnchor && hasImplicitBaselineHint) {
    missingClarifications.push('baseline_reference');
  }

  const uniqueMissing = Array.from(new Set(missingClarifications));
  if (uniqueMissing.length === 0) {
    return {
      is_ambiguous: false,
      reason: 'Goal is concrete enough to compile into a manager brief.',
      missing_clarifications: [],
      confidence: 'low',
    };
  }

  const confidence: GoalAmbiguityAssessment['confidence'] = uniqueMissing.length >= 2 || hasDanglingReference
    ? 'high'
    : 'medium';

  return {
    is_ambiguous: true,
    reason: `Goal is too ambiguous for safe execution: missing ${uniqueMissing.join(', ')}.`,
    missing_clarifications: uniqueMissing,
    confidence,
  };
}

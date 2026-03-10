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
  '\u0e20\u0e32\u0e23\u0e01\u0e34\u0e08',
  '\u0e07\u0e32\u0e19',
];

function includesAny(tokens: string[], hints: readonly string[]): boolean {
  return hints.some((hint) => tokens.includes(hint));
}

function includesAnyText(value: string, hints: readonly string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}

export function detectGoalAmbiguity(input: ManagerInput, decision: ManagerDecision): GoalAmbiguityAssessment {
  const tokens = tokenize(input.goal);
  const goalText = input.goal.trim().toLowerCase();
  const missingClarifications: string[] = [];
  const hasMissionAnchor = input.mission_id != null;
  const hasDanglingReference = includesAny(tokens, DANGLING_REFERENCE_TOKENS);
  const hasConcreteTarget = includesAny(tokens, CONCRETE_TARGET_HINTS) || includesAnyText(goalText, THAI_CONCRETE_TARGET_HINTS);
  const hasLowInformationAction = includesAny(tokens, LOW_INFORMATION_ACTIONS);
  const isVeryShortGoal = tokens.length < 4;
  const looksLikeExecutableWork = decision.kind !== 'chat';

  if (!hasMissionAnchor && hasDanglingReference && !hasConcreteTarget) {
    missingClarifications.push('target_scope');
  }

  if (looksLikeExecutableWork && !hasMissionAnchor && !hasConcreteTarget) {
    missingClarifications.push('work_target');
  }

  if (looksLikeExecutableWork && (isVeryShortGoal || hasLowInformationAction) && !hasMissionAnchor && !hasConcreteTarget) {
    missingClarifications.push('success_criteria');
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

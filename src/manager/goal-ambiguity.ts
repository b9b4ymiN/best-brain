import { tokenize } from '../utils/text.ts';
import type { ManagerDecision, ManagerInput, GoalAmbiguityAssessment } from './types.ts';

const DANGLING_REFERENCE_TOKENS = [
  'it',
  'this',
  'that',
  'them',
  'those',
  'same',
  'again',
  'continue',
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
] as const;

function includesAny(tokens: string[], hints: readonly string[]): boolean {
  return hints.some((hint) => tokens.includes(hint));
}

export function detectGoalAmbiguity(input: ManagerInput, decision: ManagerDecision): GoalAmbiguityAssessment {
  const tokens = tokenize(input.goal);
  const missingClarifications: string[] = [];
  const hasMissionAnchor = input.mission_id != null;
  const hasDanglingReference = includesAny(tokens, DANGLING_REFERENCE_TOKENS);
  const hasConcreteTarget = includesAny(tokens, CONCRETE_TARGET_HINTS);
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

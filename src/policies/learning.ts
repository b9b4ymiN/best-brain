import type { LearnMode, LearnRequest, MemoryStatus, MemoryType, VerifiedBy } from '../types.ts';

export interface LearningRule {
  memoryType: MemoryType;
  defaultStatus: MemoryStatus;
  defaultVerifiedBy: VerifiedBy | null;
  requiresExplicitConfirmation: boolean;
  allowsAutoMerge: boolean;
}

const RULES: Record<LearnMode, LearningRule> = {
  persona: {
    memoryType: 'Persona',
    defaultStatus: 'active',
    defaultVerifiedBy: 'user',
    requiresExplicitConfirmation: true,
    allowsAutoMerge: true,
  },
  preference: {
    memoryType: 'Preferences',
    defaultStatus: 'active',
    defaultVerifiedBy: 'user',
    requiresExplicitConfirmation: true,
    allowsAutoMerge: true,
  },
  procedure: {
    memoryType: 'Procedures',
    defaultStatus: 'active',
    defaultVerifiedBy: 'trusted_import',
    requiresExplicitConfirmation: false,
    allowsAutoMerge: true,
  },
  domain_memory: {
    memoryType: 'DomainMemory',
    defaultStatus: 'active',
    defaultVerifiedBy: 'system_inference',
    requiresExplicitConfirmation: false,
    allowsAutoMerge: true,
  },
  mission_outcome: {
    memoryType: 'MissionMemory',
    defaultStatus: 'active',
    defaultVerifiedBy: 'system_inference',
    requiresExplicitConfirmation: false,
    allowsAutoMerge: false,
  },
  failure_lesson: {
    memoryType: 'FailureMemory',
    defaultStatus: 'candidate',
    defaultVerifiedBy: 'system_inference',
    requiresExplicitConfirmation: false,
    allowsAutoMerge: false,
  },
  working_memory: {
    memoryType: 'WorkingMemory',
    defaultStatus: 'active',
    defaultVerifiedBy: 'system_inference',
    requiresExplicitConfirmation: false,
    allowsAutoMerge: true,
  },
};

export function getLearningRule(mode: LearnMode): LearningRule {
  return RULES[mode];
}

export function validateLearnRequest(request: LearnRequest): string | null {
  if (!request.title.trim()) {
    return 'title is required';
  }

  if (!request.content.trim()) {
    return 'content is required';
  }

  const rule = getLearningRule(request.mode);
  if (rule.requiresExplicitConfirmation && request.confirmed_by_user !== true) {
    return `${request.mode} updates require confirmed_by_user=true`;
  }

  if (request.status_override != null) {
    if (request.status_override !== 'active' && request.status_override !== 'candidate') {
      return 'status_override must be active or candidate';
    }
    if (request.status_override === 'active' && request.mode !== 'working_memory' && request.confirmed_by_user !== true && rule.requiresExplicitConfirmation) {
      return `${request.mode} active updates require confirmed_by_user=true`;
    }
  }

  return null;
}

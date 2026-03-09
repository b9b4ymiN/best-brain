import type { ConsultIntent, MemoryType } from '../types.ts';

const INTENT_HINTS: Array<{ intent: ConsultIntent; keywords: string[] }> = [
  { intent: 'persona_guidance', keywords: ['owner', 'persona', 'think like', 'as the owner', 'identity'] },
  { intent: 'preference_lookup', keywords: ['prefer', 'format', 'style', 'report', 'output'] },
  { intent: 'procedure_lookup', keywords: ['how', 'steps', 'procedure', 'checklist', 'process'] },
  { intent: 'recent_mission', keywords: ['latest', 'recent', 'last mission', 'last task', 'recent work'] },
  { intent: 'failure_lesson', keywords: ['failed', 'mistake', 'lesson', 'avoid', 'incident'] },
  { intent: 'working_context', keywords: ['working', 'current', 'context', 'in progress', 'active task'] },
];

const PREFERRED_TYPES: Record<ConsultIntent, MemoryType[]> = {
  persona_guidance: ['Persona', 'Procedures', 'Preferences'],
  preference_lookup: ['Preferences', 'Persona'],
  procedure_lookup: ['Procedures', 'RepoMemory', 'DomainMemory'],
  repo_domain_lookup: ['RepoMemory', 'DomainMemory', 'Procedures'],
  recent_mission: ['MissionMemory', 'WorkingMemory', 'FailureMemory'],
  failure_lesson: ['FailureMemory', 'MissionMemory', 'Procedures'],
  working_context: ['WorkingMemory', 'MissionMemory', 'RepoMemory'],
};

export function classifyIntent(query: string, missionId?: string | null): ConsultIntent {
  const normalized = query.toLowerCase();
  for (const hint of INTENT_HINTS) {
    if (hint.keywords.some((keyword) => normalized.includes(keyword))) {
      return hint.intent;
    }
  }

  if (missionId) {
    return 'working_context';
  }

  return 'repo_domain_lookup';
}

export function preferredTypesForIntent(intent: ConsultIntent): MemoryType[] {
  return PREFERRED_TYPES[intent];
}

export function policyPathForIntent(intent: ConsultIntent): string {
  return `deterministic.${intent}.v1`;
}

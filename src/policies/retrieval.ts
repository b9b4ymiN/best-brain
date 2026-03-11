import type { ConsultIntent, MemoryType } from '../types.ts';

const INTENT_HINTS: Array<{ intent: ConsultIntent; keywords: string[] }> = [
  {
    intent: 'persona_guidance',
    keywords: [
      'owner', 'persona', 'think like', 'as the owner', 'identity', 'who am i', 'my name', 'name', 'about me',
      'ฉันชื่อ', 'ชื่อฉัน', 'เจ้าของชื่อ', 'แนวลงทุนของฉัน', 'ตัวฉัน', 'เกี่ยวกับฉัน',
    ],
  },
  {
    intent: 'preference_lookup',
    keywords: ['prefer', 'format', 'style', 'report', 'output', 'ชอบ', 'สไตล์', 'รายงาน', 'รูปแบบ'],
  },
  {
    intent: 'procedure_lookup',
    keywords: ['how', 'steps', 'procedure', 'checklist', 'process', 'อย่างไร', 'ขั้นตอน', 'วิธี', 'เช็กลิสต์'],
  },
  {
    intent: 'recent_mission',
    keywords: ['latest', 'recent', 'last mission', 'last task', 'recent work', 'ล่าสุด', 'งานล่าสุด', 'ภารกิจล่าสุด'],
  },
  {
    intent: 'failure_lesson',
    keywords: ['failed', 'mistake', 'lesson', 'avoid', 'incident', 'ล้มเหลว', 'บทเรียน', 'ผิดพลาด', 'หลีกเลี่ยง'],
  },
  {
    intent: 'working_context',
    keywords: ['working', 'current', 'context', 'in progress', 'active task', 'ตอนนี้', 'บริบท', 'งานที่ทำอยู่'],
  },
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
  let bestIntent: ConsultIntent | null = null;
  let bestScore = 0;

  for (const hint of INTENT_HINTS) {
    const score = hint.keywords.reduce((sum, keyword) => (
      normalized.includes(keyword) ? sum + 1 : sum
    ), 0);

    if (score > bestScore) {
      bestIntent = hint.intent;
      bestScore = score;
    }
  }

  if (bestIntent && bestScore > 0) {
    return bestIntent;
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

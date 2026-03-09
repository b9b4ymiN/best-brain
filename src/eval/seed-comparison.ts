import type { BestBrain } from '../services/brain.ts';
import { ONBOARDING_MEMORY_TITLES } from '../contracts.ts';

export interface SeedComparisonCase {
  id: string;
  prompt: string;
  expected_title: string;
}

export interface SeedComparisonCaseResult {
  id: string;
  prompt: string;
  expected_title: string;
  empty_memory_ids: string[];
  seeded_memory_ids: string[];
  seeded_hit: boolean;
  empty_hit: boolean;
}

export interface SeedComparisonReport {
  generated_at: string;
  summary: {
    total_cases: number;
    empty_hit_rate: number;
    seeded_hit_rate: number;
    seeded_context_coverage: number;
    seeded_gain: number;
  };
  cases: SeedComparisonCaseResult[];
}

export const DEFAULT_SEED_COMPARISON_CASES: SeedComparisonCase[] = [
  {
    id: 'persona',
    prompt: 'If you were the owner, how should this mission start?',
    expected_title: ONBOARDING_MEMORY_TITLES.persona,
  },
  {
    id: 'format',
    prompt: 'What report format does the owner prefer?',
    expected_title: ONBOARDING_MEMORY_TITLES.reportFormat,
  },
  {
    id: 'playbook',
    prompt: 'What procedure checklist should run before claiming the mission is complete?',
    expected_title: ONBOARDING_MEMORY_TITLES.planningPlaybook,
  },
];

function toPercent(passed: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Number(((passed / total) * 100).toFixed(2));
}

export async function runSeedComparison(
  emptyBrain: BestBrain,
  seededBrain: BestBrain,
  cases: SeedComparisonCase[] = DEFAULT_SEED_COMPARISON_CASES,
): Promise<SeedComparisonReport> {
  const results: SeedComparisonCaseResult[] = [];

  for (const testCase of cases) {
    const emptyResponse = await emptyBrain.consult({ query: testCase.prompt, limit: 5 });
    const seededResponse = await seededBrain.consult({ query: testCase.prompt, limit: 5 });

    results.push({
      id: testCase.id,
      prompt: testCase.prompt,
      expected_title: testCase.expected_title,
      empty_memory_ids: emptyResponse.memory_ids,
      seeded_memory_ids: seededResponse.memory_ids,
      empty_hit: emptyResponse.selected_memories.some((memory) => memory.title === testCase.expected_title),
      seeded_hit: seededResponse.selected_memories.some((memory) => memory.title === testCase.expected_title),
    });
  }

  const emptyHitRate = toPercent(results.filter((result) => result.empty_hit).length, results.length);
  const seededHitRate = toPercent(results.filter((result) => result.seeded_hit).length, results.length);

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_cases: results.length,
      empty_hit_rate: emptyHitRate,
      seeded_hit_rate: seededHitRate,
      seeded_context_coverage: seededHitRate,
      seeded_gain: Number((seededHitRate - emptyHitRate).toFixed(2)),
    },
    cases: results,
  };
}

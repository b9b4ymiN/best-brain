import { getDefaultPersonaSeed } from './default-persona.ts';
import type { LearnResult } from '../types.ts';
import type { BestBrain } from '../services/brain.ts';

export async function ensureDefaultSeedData(brain: BestBrain): Promise<LearnResult[]> {
  if (brain.store.getSetting('seed.default.completed') === 'true') {
    return [];
  }

  const results: LearnResult[] = [];
  for (const request of getDefaultPersonaSeed(brain.config.owner)) {
    results.push(await brain.learn(request));
  }

  brain.store.setSetting('seed.default.completed', 'true');
  return results;
}

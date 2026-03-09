import { describe, expect, test } from 'bun:test';
import { getDefaultPersonaSeed } from '../src/seed/default-persona.ts';
import { validateCuratedSeedRequests } from '../src/seed/validation.ts';
import { buildOnboardingRequests, getOnboardingDefaults, runOnboarding } from '../src/services/onboarding.ts';
import { runSeedComparison } from '../src/eval/seed-comparison.ts';
import { createTestBrain } from './helpers.ts';

describe('seed quality', () => {
  test('default seed and onboarding seed pass curated validation', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });

    try {
      const defaultValidation = validateCuratedSeedRequests(getDefaultPersonaSeed(brain.config.owner));
      const onboardingValidation = validateCuratedSeedRequests(buildOnboardingRequests(brain, getOnboardingDefaults(brain)));

      expect(defaultValidation.valid).toBe(true);
      expect(onboardingValidation.valid).toBe(true);
      expect(defaultValidation.errors).toHaveLength(0);
      expect(onboardingValidation.errors).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('seeded brain outperforms empty brain on persona and procedure prompts', async () => {
    const emptyFixture = await createTestBrain({ seedDefaults: false, owner: 'seed-compare-owner' });
    const seededFixture = await createTestBrain({ seedDefaults: false, owner: 'seed-compare-owner' });

    try {
      await runOnboarding(seededFixture.brain, getOnboardingDefaults(seededFixture.brain));
      const report = await runSeedComparison(emptyFixture.brain, seededFixture.brain);

      expect(report.summary.seeded_hit_rate).toBe(100);
      expect(report.summary.seeded_gain).toBeGreaterThan(0);
      expect(report.summary.seeded_context_coverage).toBeGreaterThan(report.summary.empty_hit_rate);
    } finally {
      emptyFixture.cleanup();
      seededFixture.cleanup();
    }
  });
});

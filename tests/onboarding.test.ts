import { describe, expect, test } from 'bun:test';
import { ONBOARDING_MEMORY_TITLES } from '../src/contracts.ts';
import { buildOnboardingRequests, getOnboardingDefaults, runOnboarding } from '../src/services/onboarding.ts';
import { createTestBrain } from './helpers.ts';

describe('onboarding flow', () => {
  test('marks onboarding complete and persists the curated onboarding memories', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const result = await runOnboarding(brain, getOnboardingDefaults(brain));
      expect(result.completed).toBe(true);
      expect(brain.health().onboarded).toBe(true);

      const snapshot = brain.getOnboardingSnapshot();
      expect(snapshot.completed).toBe(true);
      expect(snapshot.persona).toContain('owner');
      expect(snapshot.preferred_report_format).toContain('status');
      expect(snapshot.planning_playbook).toContain('proof');

      expect(brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.persona, 'Persona')).not.toBeNull();
      expect(brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.reportFormat, 'Preferences')).not.toBeNull();
      expect(brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.planningPlaybook, 'Procedures')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  test('rerunning onboarding with the same answers is idempotent and changed answers supersede old memory', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const defaults = getOnboardingDefaults(brain);
      await runOnboarding(brain, defaults);

      const initial = brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.reportFormat, 'Preferences');
      expect(initial).not.toBeNull();

      await runOnboarding(brain, defaults);
      const merged = brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.reportFormat, 'Preferences');
      expect(merged?.id).toBe(initial?.id);
      expect(merged?.version).toBeGreaterThan(initial?.version ?? 0);

      await runOnboarding(brain, {
        ...defaults,
        preferredReportFormat: 'Use a short paragraph with explicit proof and next actions.',
      });

      const updated = brain.store.findLatestMemoryByTitle(ONBOARDING_MEMORY_TITLES.reportFormat, 'Preferences');
      expect(updated?.id).not.toBe(initial?.id);
      expect(updated?.content).toContain('short paragraph');
      expect(brain.store.getMemory(initial!.id)?.status).toBe('superseded');
    } finally {
      cleanup();
    }
  });

  test('builds canonical onboarding requests with evidence refs for seed validation', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });

    try {
      const requests = buildOnboardingRequests(brain, getOnboardingDefaults(brain));

      expect(requests).toHaveLength(5);
      expect(requests.every((request) => request.source === 'onboarding')).toBe(true);
      expect(requests.every((request) => (request.evidence_ref?.length ?? 0) > 0)).toBe(true);
      expect(requests.every((request) => request.confirmed_by_user === true)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

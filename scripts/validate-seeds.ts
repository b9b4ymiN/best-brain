import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { getDefaultPersonaSeed } from '../src/seed/default-persona.ts';
import { validateCuratedSeedRequests } from '../src/seed/validation.ts';
import { buildOnboardingRequests, getOnboardingDefaults } from '../src/services/onboarding.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-seed-validation-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'seed-validation-owner',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: false,
});

try {
  const defaultSeed = getDefaultPersonaSeed(brain.config.owner);
  const onboardingSeed = buildOnboardingRequests(brain, getOnboardingDefaults(brain));

  const payload = {
    default_seed: validateCuratedSeedRequests(defaultSeed),
    onboarding_seed: validateCuratedSeedRequests(onboardingSeed),
  };

  console.log(JSON.stringify(payload, null, 2));

  if (!payload.default_seed.valid || !payload.onboarding_seed.valid) {
    process.exitCode = 1;
  }
} finally {
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Windows can keep SQLite WAL files open briefly.
  }
}

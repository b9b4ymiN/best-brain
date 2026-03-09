import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { runSeedComparison } from '../src/eval/seed-comparison.ts';
import { getOnboardingDefaults, runOnboarding } from '../src/services/onboarding.ts';

function makeTempBrainDir(prefix: string): { dataDir: string; dbPath: string } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dataDir,
    dbPath: path.join(dataDir, 'best-brain.db'),
  };
}

const emptyDirs = makeTempBrainDir('best-brain-empty-');
const seededDirs = makeTempBrainDir('best-brain-seeded-');

const emptyBrain = await BestBrain.open({
  owner: 'seed-comparison-owner',
  dataDir: emptyDirs.dataDir,
  dbPath: emptyDirs.dbPath,
  port: 0,
  seedDefaults: false,
});
const seededBrain = await BestBrain.open({
  owner: 'seed-comparison-owner',
  dataDir: seededDirs.dataDir,
  dbPath: seededDirs.dbPath,
  port: 0,
  seedDefaults: false,
});

try {
  await runOnboarding(seededBrain, getOnboardingDefaults(seededBrain));
  const report = await runSeedComparison(emptyBrain, seededBrain);
  const reportPath = path.resolve(process.cwd(), 'artifacts/seed-comparison.latest.json');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report_path: reportPath,
    ...report,
  }, null, 2));

  if (report.summary.seeded_gain <= 0) {
    process.exitCode = 1;
  }
} finally {
  emptyBrain.close();
  seededBrain.close();
  for (const dataDir of [emptyDirs.dataDir, seededDirs.dataDir]) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can keep SQLite WAL files open briefly.
    }
  }
}

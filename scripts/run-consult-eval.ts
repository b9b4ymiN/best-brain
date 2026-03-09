import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import {
  loadConsultEvalFixtures,
  prepareConsultEvalData,
  runConsultEvaluation,
  writeConsultEvalReport,
} from '../src/eval/consult.ts';

const fixturePath = process.env.BEST_BRAIN_EVAL_FIXTURES
  ? path.resolve(process.cwd(), process.env.BEST_BRAIN_EVAL_FIXTURES)
  : path.resolve(process.cwd(), 'tests/fixtures/consult');
const reportPath = path.resolve(process.cwd(), 'artifacts/consult-eval.latest.json');
const baselinePath = path.resolve(process.cwd(), 'artifacts/consult-eval.baseline.json');
const useRuntimeDb = process.env.BEST_BRAIN_EVAL_USE_RUNTIME_DB === '1';
const dataDir = useRuntimeDb ? undefined : fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-eval-'));
const dbPath = dataDir ? path.join(dataDir, 'best-brain.db') : undefined;

const brain = await BestBrain.open({
  owner: 'eval-owner',
  dataDir,
  dbPath,
  port: 0,
});

try {
  await prepareConsultEvalData(brain);
  const fixtures = loadConsultEvalFixtures(fixturePath);
  const report = await runConsultEvaluation(brain, fixtures, fixturePath, baselinePath);

  writeConsultEvalReport(reportPath, report);
  console.log(JSON.stringify({
    report_path: reportPath,
    fixture_path: fixturePath,
    generated_at: report.generated_at,
    summary: report.summary,
    regression_vs_baseline: report.regression_vs_baseline,
  }, null, 2));

  if (!report.summary.passes_v1_gate) {
    process.exitCode = 1;
  }
} finally {
  brain.close();
  if (dataDir) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {
      // Windows can keep SQLite WAL files open briefly.
    }
  }
}

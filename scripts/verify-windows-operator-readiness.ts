import fs from 'fs';
import path from 'path';
import { evaluateWindowsOperatorGate } from '../src/program/windows-operator-gate.ts';

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

const artifactsDir = path.resolve(process.cwd(), 'artifacts');
const outputPath = path.join(artifactsDir, 'windows-operator-gate.latest.json');

const phase11Proof = readJson<{
  payload: {
    scheduled_run_count: number;
    scheduled_verified_complete_rate: number;
    autonomy_gating_correct: boolean;
    no_manual_intervention_steps: boolean;
  };
}>(path.join(artifactsDir, 'phase11-operator.latest.json'));

const phase12Proof = readJson<{
  payload: {
    invariants: Record<string, boolean>;
  };
}>(path.join(artifactsDir, 'phase12-safety.latest.json'));

const phase13Proof = readJson<{
  payload: {
    invariants: Record<string, boolean>;
  };
}>(path.join(artifactsDir, 'phase13-operator.latest.json'));

const scorecard = readJson<{
  metric_values: Array<{
    id: string;
    status: 'pass' | 'fail' | 'unavailable';
  }>;
}>(path.join(artifactsDir, 'program-scorecard.latest.json'));

const evaluation = evaluateWindowsOperatorGate({
  phase11: phase11Proof?.payload ?? null,
  phase12: phase12Proof?.payload ?? null,
  phase13: phase13Proof?.payload ?? null,
  scorecard,
});

const payload = {
  generated_at: new Date().toISOString(),
  passed: evaluation.passed,
  checks: evaluation.checks,
};

fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ output_path: outputPath, payload }, null, 2));

console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));

if (!evaluation.passed) {
  process.exit(1);
}

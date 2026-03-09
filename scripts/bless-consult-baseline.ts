import fs from 'fs';
import path from 'path';

const latestPath = path.resolve(process.cwd(), 'artifacts/consult-eval.latest.json');
const baselinePath = path.resolve(process.cwd(), 'artifacts/consult-eval.baseline.json');

if (!fs.existsSync(latestPath)) {
  throw new Error(`latest consult eval report not found: ${latestPath}`);
}

fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
fs.copyFileSync(latestPath, baselinePath);

console.log(JSON.stringify({
  baseline_path: baselinePath,
  source_path: latestPath,
}, null, 2));

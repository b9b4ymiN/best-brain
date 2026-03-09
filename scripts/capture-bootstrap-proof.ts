import fs from 'fs';
import path from 'path';
import { runBootstrapSmoke } from '../src/smoke/bootstrap.ts';

const args = process.argv.slice(2);
const labelArgIndex = args.indexOf('--os-label');
const osLabel = labelArgIndex >= 0 ? args[labelArgIndex + 1] : process.platform;
const reportPath = path.resolve(process.cwd(), 'artifacts/bootstrap-proofs', `${osLabel}.json`);

const result = await runBootstrapSmoke({
  cwd: process.cwd(),
  skipInstall: process.env.BEST_BRAIN_BOOTSTRAP_SKIP_INSTALL === '1',
});

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  os_label: osLabel,
  captured_at: new Date().toISOString(),
  result,
}, null, 2));

console.log(JSON.stringify({
  report_path: reportPath,
  os_label: osLabel,
  captured_at: new Date().toISOString(),
  result,
}, null, 2));

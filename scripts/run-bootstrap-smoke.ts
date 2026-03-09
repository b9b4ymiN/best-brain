import fs from 'fs';
import path from 'path';
import { runBootstrapSmoke } from '../src/smoke/bootstrap.ts';

const reportPath = path.resolve(process.cwd(), 'artifacts/bootstrap-smoke.latest.json');
const result = await runBootstrapSmoke({
  cwd: process.cwd(),
  skipInstall: process.env.BEST_BRAIN_BOOTSTRAP_SKIP_INSTALL === '1',
});

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  report_path: reportPath,
  ...result,
}, null, 2));

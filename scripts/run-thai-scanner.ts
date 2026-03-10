import { scanThaiEquities, formatOwnerFacingReport, DEFAULT_CRITERIA } from '../src/scanner/thai-equities-scanner.ts';

const report = scanThaiEquities('thai_demo_backup_live', DEFAULT_CRITERIA);
console.log(formatOwnerFacingReport(report));
console.log('\n---JSON---');
console.log(JSON.stringify(report, null, 2));

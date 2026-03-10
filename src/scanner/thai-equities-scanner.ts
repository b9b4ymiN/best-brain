/**
 * Thai Equities Scanner - ระบบสแกนหุ้นไทยที่ตรงกับแนวลงทุน
 *
 * Input: thai_demo_backup_live market data adapter
 * Output: Owner-facing scanner report with evidence chain
 */

import { loadThaiEquitiesDemoFixture, type ThaiEquitiesDemoFixture } from '../market/demo.ts';

export interface ScreeningCriteria {
  minScore: number;
  maxResults: number;
  requireRationale: boolean;
}

export interface ScannerResult {
  ticker: string;
  score: number;
  rationale: string;
  passed: boolean;
}

export interface ScannerReport {
  objective: string;
  generated_at: string;
  input_adapter: string;
  market_date: string;
  criteria: ScreeningCriteria;
  results: ScannerResult[];
  passed_count: number;
  total_scanned: number;
  evidence_chain: {
    adapter_id: string;
    fixture_path: string | null;
    confidence: number;
  };
}

export const DEFAULT_CRITERIA: ScreeningCriteria = {
  minScore: 75,
  maxResults: 10,
  requireRationale: true,
};

export function scanThaiEquities(
  adapterId: string = 'thai_demo_backup_live',
  criteria: ScreeningCriteria = DEFAULT_CRITERIA,
): ScannerReport {
  const fixture = loadThaiEquitiesDemoFixture(adapterId);
  const generatedAt = new Date().toISOString();

  const results: ScannerResult[] = fixture.symbols.map((symbol) => ({
    ticker: symbol.ticker,
    score: symbol.score,
    rationale: symbol.rationale,
    passed: symbol.score >= criteria.minScore,
  }));

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Limit results
  const limitedResults = results.slice(0, criteria.maxResults);

  const report: ScannerReport = {
    objective: 'สแกนหุ้นไทยที่ตรงกับแนวลงทุนของเจ้าของ',
    generated_at: generatedAt,
    input_adapter: adapterId,
    market_date: fixture.market_date,
    criteria,
    results: limitedResults,
    passed_count: limitedResults.filter((r) => r.passed).length,
    total_scanned: fixture.symbols.length,
    evidence_chain: {
      adapter_id: adapterId,
      fixture_path: `fixtures/proving/thai-equities/thai-equities-live-backup.json`,
      confidence: 0.91,
    },
  };

  return report;
}

export function formatOwnerFacingReport(report: ScannerReport): string {
  const lines: string[] = [
    `# รายงานสแกนหุ้นไทย`,
    ``,
    `**วัตถุประสงค์:** ${report.objective}`,
    `**วันที่ตลาด:** ${report.market_date}`,
    `**สร้างเมื่อ:** ${report.generated_at}`,
    ``,
    `## เกณฑ์การคัดกรอง`,
    `- คะแนนขั้นต่ำ: ${report.criteria.minScore}`,
    `- จำนวนสูงสุด: ${report.criteria.maxResults}`,
    ``,
    `## ผลการสแกน`,
    `| หุ้น | คะแนน | ผ่าน | เหตุผล |`,
    `|------|--------|------|---------|`,
  ];

  for (const result of report.results) {
    const passed = result.passed ? '✓' : '✗';
    lines.push(`| ${result.ticker} | ${result.score} | ${passed} | ${result.rationale} |`);
  }

  lines.push(``);
  lines.push(`## สรุป`);
  lines.push(`- สแกนทั้งหมด: ${report.total_scanned} หุ้น`);
  lines.push(`- ผ่านเกณฑ์: ${report.passed_count} หุ้น`);
  lines.push(`- Input adapter: ${report.evidence_chain.adapter_id} (confidence: ${report.evidence_chain.confidence})`);

  return lines.join('\n');
}

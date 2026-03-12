import fs from 'fs';
import path from 'path';

type ScannerMetrics = {
  dividend_yield?: number | null;
};

type ScannerRow = {
  ticker: string;
  passed: boolean;
  vi_score?: number | null;
  metrics?: ScannerMetrics | null;
};

type ScannerReport = {
  objective: string;
  generated_at: string;
  market_date: string;
  criteria: {
    min_dividend_yield: number;
    max_pe?: number;
    max_pb?: number;
    min_roe?: number;
  };
  results: ScannerRow[];
  passed_count: number;
  total_scanned: number;
};

function parseArgs(argv: string[]): { minYield: number } {
  let minYield = 4;
  for (const arg of argv) {
    if (arg.startsWith('--min-yield=')) {
      const value = Number.parseFloat(arg.slice('--min-yield='.length));
      if (Number.isFinite(value) && value > 0 && value <= 100) {
        minYield = value;
      }
    }
  }
  return { minYield };
}

function extractJsonObject(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function dividendValue(row: ScannerRow): number | null {
  const value = row.metrics?.dividend_yield;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function topPassList(rows: ScannerRow[], limit = 8): string {
  const passed = rows
    .filter((row) => row.passed && dividendValue(row) != null)
    .sort((left, right) => (dividendValue(right) ?? -1) - (dividendValue(left) ?? -1))
    .slice(0, limit)
    .map((row) => `${row.ticker} (${(dividendValue(row) as number).toFixed(2)}%)`);
  return passed.length > 0 ? passed.join(', ') : 'none';
}

async function main(): Promise<void> {
  const { minYield } = parseArgs(process.argv.slice(2));
  const args = ['scripts/set50_dividend_scanner.py', '--min-yield', String(minYield), '--output', 'json'];
  const commandDisplay = `python ${args.join(' ')}`;
  const startedAt = Date.now();
  const proc = Bun.spawn(['python', ...args], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const completedAt = Date.now();

  const parsedText = extractJsonObject(stdout);
  const report = parsedText ? JSON.parse(parsedText) as ScannerReport : null;
  const hasResults = Array.isArray(report?.results) && report.results.length > 0;
  const hasDividendData = hasResults && report!.results.some((row) => dividendValue(row) != null);
  const passCount = report?.passed_count ?? 0;
  const topList = report ? topPassList(report.results) : 'none';

  const artifactsDir = path.join(process.cwd(), 'artifacts', 'scanner');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const reportFile = path.join(
    artifactsDir,
    `set50-dividend-${minYield.toString().replace('.', '_')}-${Date.now()}.json`,
  );
  if (report) {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  } else {
    fs.writeFileSync(reportFile, JSON.stringify({
      objective: `Scan SET50 stocks with dividend yield >= ${minYield}%`,
      error: 'scanner output was not valid JSON',
      stdout,
      stderr,
    }, null, 2), 'utf8');
  }

  let status: 'success' | 'needs_retry' | 'failed' = 'success';
  let summary = `SET50 dividend scanner completed (Dividend >= ${minYield}%). Passed: ${passCount}. Top: ${topList}.`;
  if (report == null) {
    status = 'failed';
    summary = `SET50 dividend scanner failed: output was not valid JSON (exit ${exitCode}).`;
  } else if (!hasDividendData) {
    status = 'needs_retry';
    summary = `SET50 dividend scanner ran but no usable dividend fields were returned by yfinance for this run (Dividend >= ${minYield}%).`;
  } else if (exitCode !== 0) {
    status = 'needs_retry';
    summary = `SET50 dividend scanner produced data but process exited non-zero (${exitCode}); keep run as retryable.`;
  }

  const payload = {
    summary,
    status,
    artifacts: [
      {
        type: 'note',
        ref: `worker://shell/set50-dividend/${Date.now()}`,
        description: summary,
      },
      {
        type: 'file',
        ref: reportFile,
        description: 'Machine-readable SET50 dividend scanner report.',
      },
      {
        type: 'other',
        ref: `shell://${encodeURIComponent(commandDisplay)}`,
        description: `Scanner command exit=${exitCode} duration_ms=${completedAt - startedAt}`,
      },
    ],
    proposed_checks: [
      {
        name: 'set50-dividend-command-completed',
        passed: exitCode === 0,
        detail: `Scanner command exited with code ${exitCode}.`,
      },
      {
        name: 'set50-dividend-produced-results',
        passed: hasResults,
        detail: `rows=${report?.results?.length ?? 0}`,
      },
      {
        name: 'set50-dividend-has-dividend-data',
        passed: hasDividendData,
        detail: hasDividendData
          ? 'At least one symbol has numeric dividend yield.'
          : 'No symbols returned numeric dividend yield from yfinance in this run.',
      },
      {
        name: 'set50-dividend-threshold-applied',
        passed: report == null
          ? false
          : report.results
            .filter((row) => row.passed && dividendValue(row) != null)
            .every((row) => (dividendValue(row) as number) >= minYield),
        detail: `Verified pass rows satisfy dividend yield >= ${minYield}%.`,
      },
    ],
  };

  console.log(JSON.stringify(payload));
}

await main();

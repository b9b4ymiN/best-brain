import fs from 'fs';
import path from 'path';

type ScannerRow = {
  ticker: string;
  npm_percent: number | null;
  passed: boolean;
  company_name?: string | null;
  rationale?: string | null;
};

type ScannerReport = {
  objective: string;
  generated_at: string;
  market_date: string;
  criteria: {
    min_npm: number;
    symbols_scanned: number;
  };
  results: ScannerRow[];
  passed_count: number;
  total_scanned: number;
  failed_data_count: number;
  evidence_chain?: {
    data_source?: string;
    confidence?: number;
  } | null;
};

function parseArgs(argv: string[]): { minNpm: number } {
  let minNpm = 20;
  for (const arg of argv) {
    if (arg.startsWith('--min-npm=')) {
      const value = Number.parseFloat(arg.slice('--min-npm='.length));
      if (Number.isFinite(value) && value > 0 && value <= 100) {
        minNpm = value;
      }
    }
  }
  return { minNpm };
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

function topPassList(rows: ScannerRow[], limit = 8): string {
  const passed = rows
    .filter((row) => row.passed && typeof row.npm_percent === 'number')
    .sort((left, right) => (right.npm_percent ?? -1) - (left.npm_percent ?? -1))
    .slice(0, limit)
    .map((row) => `${row.ticker} (${(row.npm_percent as number).toFixed(2)}%)`);
  return passed.length > 0 ? passed.join(', ') : 'none';
}

async function main(): Promise<void> {
  const { minNpm } = parseArgs(process.argv.slice(2));
  const args = ['scripts/set50_npm_scanner.py', '--min-npm', String(minNpm), '--output', 'json'];
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
  const hasNpmData = hasResults && report!.results.some((row) => typeof row.npm_percent === 'number');
  const passCount = report?.passed_count ?? 0;
  const topList = report ? topPassList(report.results) : 'none';

  const artifactsDir = path.join(process.cwd(), 'artifacts', 'scanner');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const reportFile = path.join(
    artifactsDir,
    `set50-npm-${minNpm.toString().replace('.', '_')}-${Date.now()}.json`,
  );
  if (report) {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
  } else {
    fs.writeFileSync(reportFile, JSON.stringify({
      objective: `Scan SET50 stocks with NPM >= ${minNpm}%`,
      error: 'scanner output was not valid JSON',
      stdout,
      stderr,
    }, null, 2), 'utf8');
  }

  let status: 'success' | 'needs_retry' | 'failed' = 'success';
  let summary = `SET50 NPM scanner completed (NPM >= ${minNpm}%). Passed: ${passCount}. Top: ${topList}.`;
  if (report == null) {
    status = 'failed';
    summary = `SET50 NPM scanner failed: output was not valid JSON (exit ${exitCode}).`;
  } else if (!hasNpmData) {
    status = 'needs_retry';
    summary = `SET50 NPM scanner ran but no usable NPM fields were returned by yfinance for this run (NPM >= ${minNpm}%).`;
  } else if (exitCode !== 0) {
    status = 'needs_retry';
    summary = `SET50 NPM scanner produced data but process exited non-zero (${exitCode}); keep run as retryable.`;
  }

  const payload = {
    summary,
    status,
    artifacts: [
      {
        type: 'note',
        ref: `worker://shell/set50-npm/${Date.now()}`,
        description: summary,
      },
      {
        type: 'file',
        ref: reportFile,
        description: 'Machine-readable SET50 NPM scanner report.',
      },
      {
        type: 'other',
        ref: `shell://${encodeURIComponent(commandDisplay)}`,
        description: `Scanner command exit=${exitCode} duration_ms=${completedAt - startedAt}`,
      },
    ],
    proposed_checks: [
      {
        name: 'set50-scanner-command-completed',
        passed: exitCode === 0,
        detail: `Scanner command exited with code ${exitCode}.`,
      },
      {
        name: 'set50-scanner-produced-results',
        passed: hasResults,
        detail: `rows=${report?.results?.length ?? 0}`,
      },
      {
        name: 'set50-scanner-has-npm-data',
        passed: hasNpmData,
        detail: hasNpmData
          ? 'At least one symbol has numeric NPM.'
          : 'No symbols returned numeric NPM from yfinance in this run.',
      },
      {
        name: 'set50-scanner-threshold-applied',
        passed: report == null
          ? false
          : report.results.filter((row) => row.passed && typeof row.npm_percent === 'number')
            .every((row) => (row.npm_percent as number) >= minNpm),
        detail: `Verified pass rows satisfy NPM >= ${minNpm}%.`,
      },
    ],
  };

  console.log(JSON.stringify(payload));
}

await main();

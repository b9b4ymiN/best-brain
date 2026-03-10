import fs from 'fs';
import path from 'path';
import type { MarketAdapterSourceKind, MarketDataAdapterCandidate } from './types.ts';

export const THAI_EQUITIES_DEMO_SCENARIOS = [
  'success',
  'stale',
  'unavailable',
  'retryable',
] as const;

export type ThaiEquitiesDemoScenario = (typeof THAI_EQUITIES_DEMO_SCENARIOS)[number];

export interface ThaiEquitiesDemoFixture {
  adapter_id: string;
  generated_at: string;
  market_date: string;
  symbols: Array<{
    ticker: string;
    score: number;
    rationale: string;
  }>;
}

export interface ThaiEquitiesDemoAdapterCandidate extends MarketDataAdapterCandidate {
  fixture_path: string | null;
}

const scenarioHints: Record<ThaiEquitiesDemoScenario, string[]> = {
  success: [],
  stale: ['stale'],
  unavailable: ['unavailable', 'blocked', 'no data'],
  retryable: ['retry', 'incomplete proof', 'partial proof'],
};

function fixturePath(fileName: string): string {
  return path.resolve(process.cwd(), 'fixtures/proving/thai-equities', fileName);
}

export function resolveThaiEquitiesDemoScenario(goal: string): ThaiEquitiesDemoScenario {
  const normalized = goal.toLowerCase();

  for (const scenario of THAI_EQUITIES_DEMO_SCENARIOS) {
    if (scenario === 'success') {
      continue;
    }
    if (scenarioHints[scenario].some((hint) => normalized.includes(hint))) {
      return scenario;
    }
  }

  return 'success';
}

function candidate(
  id: string,
  sourceKind: MarketAdapterSourceKind,
  available: boolean,
  freshnessMs: number | null,
  confidence: number,
  fixtureFile: string | null,
  notes: string[],
): ThaiEquitiesDemoAdapterCandidate {
  return {
    id,
    market: 'th_equities_daily',
    source_kind: sourceKind,
    available,
    freshness_ms: freshnessMs,
    confidence,
    fixture_path: fixtureFile ? fixturePath(fixtureFile) : null,
    notes,
  };
}

export function listThaiEquitiesDemoCandidates(scenario: ThaiEquitiesDemoScenario): ThaiEquitiesDemoAdapterCandidate[] {
  switch (scenario) {
    case 'stale':
      return [
        candidate(
          'thai_demo_primary_stale',
          'public_web_feed',
          true,
          26 * 60 * 60 * 1000,
          0.88,
          'thai-equities-stale.json',
          ['Deliberately stale fixture for blocked acceptance runs.'],
        ),
      ];
    case 'unavailable':
      return [
        candidate(
          'thai_demo_primary_unavailable',
          'public_web_feed',
          false,
          null,
          0.4,
          null,
          ['Deliberately unavailable source for blocked acceptance runs.'],
        ),
        candidate(
          'thai_demo_backup_unavailable',
          'official_source',
          false,
          null,
          0.5,
          null,
          ['Backup source is also unavailable in this scenario.'],
        ),
      ];
    case 'retryable':
      return [
        candidate(
          'thai_demo_primary_live',
          'public_web_feed',
          true,
          25 * 60 * 1000,
          0.86,
          'thai-equities-live-primary.json',
          ['Primary live fixture for retryable verification-failed runs.'],
        ),
        candidate(
          'thai_demo_backup_live',
          'official_source',
          true,
          70 * 60 * 1000,
          0.9,
          'thai-equities-live-backup.json',
          ['Backup live fixture.'],
        ),
      ];
    case 'success':
    default:
      return [
        candidate(
          'thai_demo_primary_live',
          'public_web_feed',
          true,
          20 * 60 * 1000,
          0.87,
          'thai-equities-live-primary.json',
          ['Primary live fixture for the stock-scanner proving mission demo.'],
        ),
        candidate(
          'thai_demo_backup_live',
          'official_source',
          true,
          75 * 60 * 1000,
          0.91,
          'thai-equities-live-backup.json',
          ['Backup live fixture for adapter failover.'],
        ),
      ];
  }
}

export function loadThaiEquitiesDemoFixture(adapterId: string): ThaiEquitiesDemoFixture {
  const candidates = [
    ...listThaiEquitiesDemoCandidates('success'),
    ...listThaiEquitiesDemoCandidates('retryable'),
    ...listThaiEquitiesDemoCandidates('stale'),
  ];
  const candidate = candidates.find((item) => item.id === adapterId);
  if (!candidate?.fixture_path) {
    throw new Error(`No fixture-backed market adapter exists for ${adapterId}`);
  }
  if (!fs.existsSync(candidate.fixture_path)) {
    throw new Error(`Fixture file is missing for ${adapterId}: ${candidate.fixture_path}`);
  }

  return JSON.parse(fs.readFileSync(candidate.fixture_path, 'utf8')) as ThaiEquitiesDemoFixture;
}

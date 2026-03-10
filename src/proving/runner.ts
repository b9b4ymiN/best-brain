import { loadThaiEquitiesDemoFixture, type ThaiEquitiesDemoScenario } from '../market/demo.ts';
import type { VerificationArtifact, VerificationCheck } from '../types.ts';

export interface ProvingMissionRunnerInput {
  definition_id: string;
  scenario: ThaiEquitiesDemoScenario;
  adapter_id: string;
}

export interface ProvingMissionRunnerOutput {
  summary: string;
  status: 'success' | 'needs_retry' | 'failed';
  artifacts: VerificationArtifact[];
  proposed_checks: VerificationCheck[];
}

function assertThaiEquitiesDefinition(definitionId: string): void {
  if (definitionId !== 'thai_equities_daily_scanner') {
    throw new Error(`Unsupported proving mission definition: ${definitionId}`);
  }
}

export function runProvingMission(input: ProvingMissionRunnerInput): ProvingMissionRunnerOutput {
  assertThaiEquitiesDefinition(input.definition_id);
  const fixture = loadThaiEquitiesDemoFixture(input.adapter_id);
  const picks = fixture.symbols
    .slice()
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const pickSummary = picks.map((symbol) => `${symbol.ticker}:${symbol.score}`).join(' | ');
  const noteArtifact: VerificationArtifact = {
    type: 'note',
    ref: `worker://shell/thai-equities-report/${fixture.market_date}`,
    description: `Top picks ${pickSummary}.`,
  };
  const marketArtifact: VerificationArtifact = {
    type: 'other',
    ref: `market://${input.adapter_id}/${fixture.market_date}`,
    description: `Market snapshot generated at ${fixture.generated_at}.`,
  };

  if (input.scenario === 'retryable') {
    return {
      summary: `Thai equities daily stock scanner produced partial output from ${input.adapter_id}, but proof is incomplete and the mission should retry.`,
      status: 'needs_retry',
      artifacts: [noteArtifact],
      proposed_checks: [
        {
          name: 'market-data-fresh',
          passed: true,
          detail: `Fixture ${input.adapter_id} is fresh enough for the proving mission demo.`,
        },
        {
          name: 'stock-scanner-result-set-present',
          passed: true,
          detail: `Produced ranked picks: ${pickSummary}.`,
        },
        {
          name: 'owner-report-ready',
          passed: false,
          detail: 'Machine-readable market evidence was intentionally omitted to keep the run retryable.',
        },
      ],
    };
  }

  return {
    summary: `Thai equities daily stock scanner demo completed using ${input.adapter_id} with ranked picks ${pickSummary}.`,
    status: 'success',
    artifacts: [noteArtifact, marketArtifact],
    proposed_checks: [
      {
        name: 'market-data-fresh',
        passed: true,
        detail: `Fixture ${input.adapter_id} is fresh enough for the proving mission demo.`,
      },
      {
        name: 'stock-scanner-result-set-present',
        passed: picks.length > 0,
        detail: `Produced ranked picks: ${pickSummary}.`,
      },
      {
        name: 'owner-report-ready',
        passed: true,
        detail: 'The stock scanner demo produced a summary note and machine-readable market evidence.',
      },
    ],
  };
}

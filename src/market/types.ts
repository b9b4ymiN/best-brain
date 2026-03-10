export const MARKET_KINDS = ['th_equities_daily'] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export const MARKET_ADAPTER_SOURCE_KINDS = [
  'public_web_feed',
  'official_source',
  'custom_api',
  'manual_import',
] as const;

export type MarketAdapterSourceKind = (typeof MARKET_ADAPTER_SOURCE_KINDS)[number];

export interface MarketDataAdapterCandidate {
  id: string;
  market: MarketKind;
  source_kind: MarketAdapterSourceKind;
  available: boolean;
  freshness_ms: number | null;
  confidence: number;
  notes: string[];
}

export interface MarketDataSelectionPolicy {
  max_freshness_ms: number;
  minimum_confidence: number;
}

export interface MarketDataAdapterDecision {
  market: MarketKind;
  selected_adapter_id: string | null;
  decision: 'use_adapter' | 'blocked';
  reason: string;
  considered: MarketDataAdapterCandidate[];
}

export function selectMarketDataAdapter(
  candidates: MarketDataAdapterCandidate[],
  policy: MarketDataSelectionPolicy,
): MarketDataAdapterDecision {
  const considered = [...candidates]
    .filter((candidate) => candidate.market === 'th_equities_daily')
    .sort((left, right) => {
      const freshnessDelta = (left.freshness_ms ?? Number.MAX_SAFE_INTEGER) - (right.freshness_ms ?? Number.MAX_SAFE_INTEGER);
      if (freshnessDelta !== 0) {
        return freshnessDelta;
      }
      return right.confidence - left.confidence;
    });

  const selected = considered.find((candidate) => (
    candidate.available
    && candidate.confidence >= policy.minimum_confidence
    && candidate.freshness_ms != null
    && candidate.freshness_ms <= policy.max_freshness_ms
  ));

  if (!selected) {
    return {
      market: 'th_equities_daily',
      selected_adapter_id: null,
      decision: 'blocked',
      reason: 'No live adapter meets availability, freshness, and confidence policy.',
      considered,
    };
  }

  return {
    market: 'th_equities_daily',
    selected_adapter_id: selected.id,
    decision: 'use_adapter',
    reason: `Selected ${selected.id} by freshness and confidence policy.`,
    considered,
  };
}

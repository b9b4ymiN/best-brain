import type { ConsultResponse, MissionContextBundle } from '../types.ts';
import type { ManagerDerivation } from './types.ts';

const VALUE_INVESTOR_PATTERNS = [
  /\bvi\b/i,
  /value investor/i,
  /value investing/i,
  /margin of safety/i,
  /moat/i,
  /free cash flow/i,
  /\broe\b/i,
  /low debt/i,
  /understandable businesses?/i,
];

const SCREENING_CRITERIA_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'durable moat', pattern: /moat|durable advantage/i },
  { label: 'earnings consistency', pattern: /earnings consistency|consistent earnings|predictable earnings/i },
  { label: 'free cash flow quality', pattern: /free cash flow|fcf/i },
  { label: 'high return on equity', pattern: /\broe\b|return on equity/i },
  { label: 'low debt discipline', pattern: /low debt|balance sheet discipline|debt discipline/i },
  { label: 'margin of safety', pattern: /margin of safety|valuation discount|discount/i },
  { label: 'understandable businesses', pattern: /understandable businesses?|simple businesses?/i },
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function collectSignals(consult: ConsultResponse, context: MissionContextBundle): Array<{
  memory_id: string;
  title: string;
  summary: string;
}> {
  const citationSignals = consult.citations.map((citation) => ({
    memory_id: citation.memory_id,
    title: citation.title,
    summary: citation.summary,
  }));
  const durableSignals = context.durable_memory.map((memory) => ({
    memory_id: memory.id,
    title: memory.title,
    summary: memory.summary,
  }));

  const merged = new Map<string, { memory_id: string; title: string; summary: string }>();
  for (const item of [...citationSignals, ...durableSignals]) {
    if (!merged.has(item.memory_id)) {
      merged.set(item.memory_id, item);
    }
  }

  return Array.from(merged.values());
}

export function buildManagerDerivation(
  missionKind: string,
  consult: ConsultResponse,
  context: MissionContextBundle,
): ManagerDerivation | null {
  if (missionKind !== 'thai_equities_manager_led_scanner') {
    return null;
  }

  const signals = collectSignals(consult, context);
  const signalText = signals
    .map((signal) => `${signal.title}. ${signal.summary}`)
    .concat([
      consult.answer,
      ...context.planning_hints,
      context.preferred_format,
    ])
    .join('\n');
  const ownerArchetype: ManagerDerivation['owner_archetype'] = VALUE_INVESTOR_PATTERNS.some((pattern) => pattern.test(signalText))
    ? 'value_investor'
    : 'unknown';

  const screeningCriteria = unique(
    SCREENING_CRITERIA_PATTERNS
      .filter((item) => item.pattern.test(signalText))
      .map((item) => item.label),
  );

  return {
    owner_archetype: ownerArchetype,
    persona_signals: unique(signals.slice(0, 5).map((signal) => `${signal.title}: ${signal.summary}`)),
    screening_criteria: screeningCriteria,
    planned_outputs: [
      'owner-facing scanner system plan',
      'screening criteria aligned to persona memory',
      'verification-ready report with evidence and risks',
    ],
    derived_from_memory_ids: unique(signals.map((signal) => signal.memory_id)),
  };
}

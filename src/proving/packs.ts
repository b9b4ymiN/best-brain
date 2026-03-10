import type { MissionPlaybook } from '../playbooks/types.ts';
import type { MissionContextBundle } from '../types.ts';
import { resolveThaiEquitiesDemoScenario } from '../market/demo.ts';
import type { ManagerDecision, ManagerInput, MissionBrief } from '../manager/types.ts';

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function isThaiEquitiesStockScannerGoal(goal: string): boolean {
  const tokens = tokenize(goal);
  const hasScanner = tokens.includes('scanner') || tokens.includes('scan');
  const hasThai = tokens.includes('thai');
  const hasEquities = tokens.includes('equities') || tokens.includes('stocks') || tokens.includes('stock') || tokens.includes('set');
  return hasScanner && hasThai && hasEquities;
}

export function buildThaiEquitiesStockScannerPlaybook(
  context: MissionContextBundle,
  decision: ManagerDecision,
): MissionPlaybook {
  return {
    id: 'playbook_thai_equities_daily_scanner',
    slug: 'thai-equities-daily-scanner',
    title: 'Thai equities daily stock scanner',
    scope: 'domain',
    mission_kind: 'thai_equities_daily_scanner',
    preferred_workers: Array.from(new Set([
      decision.selected_worker === 'shell' ? 'shell' : 'shell',
      'verifier',
    ])),
    planning_hints: Array.from(new Set([
      ...context.planning_hints,
      'Select the freshest live market adapter before execution.',
      'If market data is stale or unavailable, block instead of faking success.',
      'Finish with an owner-facing scanner report plus machine-readable evidence.',
    ])).slice(0, 6),
    report_format: 'Objective, stock picks, rationale, evidence, risks, next action.',
    verifier_checklist: [
      {
        id: 'check_note_evidence',
        name: 'Owner-facing note evidence exists',
        required: true,
        artifact_kind: 'note',
        detail: 'Stock scanner demo must produce an owner-facing note summary.',
      },
      {
        id: 'check_market_data_artifact',
        name: 'Market data evidence exists',
        required: true,
        artifact_kind: 'other',
        detail: 'Stock scanner demo must include machine-readable market-data evidence.',
      },
      {
        id: 'check_worker_checks',
        name: 'Worker and manager checks are recorded',
        required: true,
        artifact_kind: null,
        detail: 'The run must emit explicit freshness and completeness checks.',
      },
    ],
    repair_heuristics: [
      {
        id: 'repair_thai_equities_switch_adapter',
        trigger: 'blocked_or_ambiguous',
        instruction: 'Switch to the next eligible market-data adapter or block with the correct reason.',
        max_retries: 1,
      },
      {
        id: 'repair_thai_equities_collect_missing_evidence',
        trigger: 'verification_failed',
        instruction: 'Collect missing evidence or rerun the scanner before verification passes.',
        max_retries: 2,
      },
    ],
  };
}

export function resolveRegisteredMissionPlaybook(
  input: ManagerInput,
  context: MissionContextBundle,
  decision: ManagerDecision,
): MissionPlaybook | null {
  if (isThaiEquitiesStockScannerGoal(input.goal)) {
    return buildThaiEquitiesStockScannerPlaybook(context, decision);
  }

  return null;
}

export function buildMissionShellCommand(brief: MissionBrief): {
  command: string;
  args: string[];
  raw: string;
} | null {
  if (brief.selected_worker !== 'shell') {
    return null;
  }

  if (brief.mission_kind !== 'thai_equities_daily_scanner') {
    return null;
  }

  const scenario = resolveThaiEquitiesDemoScenario(brief.goal);
  const adapterId = brief.input_adapter_decisions.find((decision) => decision.family === 'market_data' && decision.decision === 'selected')?.selected_adapter_id ?? 'thai_demo_primary_live';
  const args = [
    'scripts/run-proving-mission.ts',
    '--definition=thai_equities_daily_scanner',
    `--scenario=${scenario}`,
    `--adapter=${adapterId}`,
  ];

  return {
    command: 'bun',
    args,
    raw: ['bun', ...args].join(' '),
  };
}

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

const DEMO_HINTS = ['demo', 'unavailable', 'incomplete proof', 'controlled'];

export function isThaiEquitiesDemoGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  return isThaiEquitiesStockScannerGoal(goal) && DEMO_HINTS.some((hint) => normalized.includes(hint));
}

export function isThaiEquitiesActualManagerGoal(goal: string): boolean {
  return isThaiEquitiesStockScannerGoal(goal) && !isThaiEquitiesDemoGoal(goal);
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
          validation_source: 'artifact',
          detail: 'Stock scanner demo must produce an owner-facing note summary.',
        },
        {
          id: 'check_market_data_artifact',
          name: 'Market data evidence exists',
          required: true,
          artifact_kind: 'other',
          validation_source: 'artifact',
          detail: 'Stock scanner demo must include machine-readable market-data evidence.',
        },
        {
          id: 'check_worker_checks',
          name: 'Worker and manager checks are recorded',
          required: true,
          artifact_kind: null,
          validation_source: 'any',
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

export function buildThaiEquitiesActualManagerPlaybook(
  context: MissionContextBundle,
  decision: ManagerDecision,
): MissionPlaybook {
  const selectedWorker = decision.selected_worker === 'codex' ? 'codex' : 'claude';
  return {
    id: 'playbook_thai_equities_manager_led_scanner',
    slug: 'thai-equities-manager-led-scanner',
    title: 'Thai equities manager-led scanner mission',
    scope: 'domain',
    mission_kind: 'thai_equities_manager_led_scanner',
    preferred_workers: [selectedWorker, 'verifier'],
    planning_hints: Array.from(new Set([
      ...context.planning_hints,
      'Recall the owner investment persona before deciding screening criteria.',
      'Derive screening criteria and report shape from brain memory, not from hidden scripts.',
      'Use the selected market-data adapter as explicit evidence in the proof chain.',
      'Return an owner-facing scanner system plan that can guide later implementation work.',
    ])).slice(0, 6),
    report_format: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
    verifier_checklist: [
      {
        id: 'check_note_evidence',
        name: 'Owner-facing note evidence exists',
        required: true,
        artifact_kind: 'note',
        validation_source: 'artifact',
        detail: 'The actual manager-led mission must produce an owner-facing note or report.',
      },
      {
        id: 'check_market_data_input_recorded',
        name: 'Selected market-data input is recorded',
        required: true,
        artifact_kind: null,
        validation_source: 'input_adapter',
        detail: 'The proof chain must record which market-data adapter was selected.',
      },
    ],
    repair_heuristics: [
      {
        id: 'repair_thai_equities_actual_recall_persona',
        trigger: 'blocked_or_ambiguous',
        instruction: 'Recall owner persona and clarify the expected stock-scanner outcome before continuing.',
        max_retries: 1,
      },
      {
        id: 'repair_thai_equities_actual_collect_plan_evidence',
        trigger: 'verification_failed',
        instruction: 'Collect a clearer owner-facing plan note and rerun verification.',
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
  if (isThaiEquitiesDemoGoal(input.goal)) {
    return buildThaiEquitiesStockScannerPlaybook(context, decision);
  }

  if (isThaiEquitiesActualManagerGoal(input.goal)) {
    return buildThaiEquitiesActualManagerPlaybook(context, decision);
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

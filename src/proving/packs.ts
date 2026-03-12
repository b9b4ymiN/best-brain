import type { MissionPlaybook } from '../playbooks/types.ts';
import type { MissionContextBundle } from '../types.ts';
import type { ManagerDecision, ManagerInput, MissionBrief } from '../manager/types.ts';
import { tokenize } from '../utils/text.ts';
import { resolveThaiEquitiesDemoScenario } from '../market/demo.ts';

const THAI_SCANNER_TEXT = '\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19';
const THAI_SYSTEM_SCANNER_TEXT = '\u0e23\u0e30\u0e1a\u0e1a\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19';
const THAI_EQUITIES_TEXT = '\u0e2b\u0e38\u0e49\u0e19\u0e44\u0e17\u0e22';
const THAI_STOCK_TEXT = '\u0e2b\u0e38\u0e49\u0e19';
const THAI_SCAN_TEXT = '\u0e2a\u0e41\u0e01\u0e19';
const THAI_SET50_TEXT = 'set 50';
const THAI_NPM_TEXT = 'npm';
const THAI_DIVIDEND_TEXT = '\u0e1b\u0e31\u0e19\u0e1c\u0e25';
const THAI_YFINANCE_TEXT = 'yfinance';

function hasSet50Scope(normalized: string): boolean {
  return /\bset\s*50\b/.test(normalized) || normalized.includes('set50') || normalized.includes(THAI_SET50_TEXT);
}

export function isThaiEquitiesStockScannerGoal(goal: string): boolean {
  const tokens = tokenize(goal);
  const normalized = goal.toLowerCase();
  const hasScanner = tokens.includes('scanner') || tokens.includes('scan');
  const hasThai = tokens.includes('thai');
  const hasEquities = tokens.includes('equities') || tokens.includes('stocks') || tokens.includes('stock') || tokens.includes('set');
  const hasThaiScannerText = normalized.includes(THAI_SCANNER_TEXT) || normalized.includes(THAI_SYSTEM_SCANNER_TEXT);
  const hasThaiEquitiesText = normalized.includes(THAI_EQUITIES_TEXT) || normalized.includes(THAI_STOCK_TEXT);
  return (hasScanner && hasThai && hasEquities) || (hasThaiScannerText && hasThaiEquitiesText);
}

export function isSet50NpmYfinanceGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  const hasSet50 = hasSet50Scope(normalized);
  const hasNpm = /\bnpm\b/.test(normalized) || normalized.includes('net profit margin') || normalized.includes(THAI_NPM_TEXT);
  const hasYfinance = normalized.includes('yfinance') || normalized.includes(THAI_YFINANCE_TEXT);
  const hasThaiScanStock = normalized.includes(THAI_STOCK_TEXT) && normalized.includes(THAI_SCAN_TEXT);

  return (hasSet50 || hasThaiScanStock) && hasNpm && hasYfinance;
}

export function isSet50DividendYfinanceGoal(goal: string): boolean {
  const normalized = goal.toLowerCase();
  const hasSet50 = hasSet50Scope(normalized);
  const hasDividend = /\bdividend\b/.test(normalized)
    || /\byield\b/.test(normalized)
    || normalized.includes('dividend yield')
    || normalized.includes(THAI_DIVIDEND_TEXT);
  const hasYfinance = normalized.includes('yfinance') || normalized.includes(THAI_YFINANCE_TEXT);
  const hasThaiScanStock = normalized.includes(THAI_STOCK_TEXT) && normalized.includes(THAI_SCAN_TEXT);

  return (hasSet50 || hasThaiScanStock) && hasDividend && hasYfinance;
}

export function extractSet50NpmThreshold(goal: string): number {
  const normalized = goal.toLowerCase();
  const directComparator = normalized.match(/\bnpm\b[^0-9]{0,10}([0-9]+(?:\.[0-9]+)?)/);
  if (directComparator) {
    const value = Number.parseFloat(directComparator[1]!);
    if (Number.isFinite(value) && value > 0 && value <= 100) {
      return value;
    }
  }

  const percentMention = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percentMention) {
    const value = Number.parseFloat(percentMention[1]!);
    if (Number.isFinite(value) && value > 0 && value <= 100) {
      return value;
    }
  }

  return 20;
}

export function extractSet50DividendThreshold(goal: string): number {
  const normalized = goal.toLowerCase();
  const directComparator = normalized.match(/(?:dividend|yield|\u0e1b\u0e31\u0e19\u0e1c\u0e25)[^0-9]{0,14}([0-9]+(?:\.[0-9]+)?)/);
  if (directComparator) {
    const value = Number.parseFloat(directComparator[1]!);
    if (Number.isFinite(value) && value > 0 && value <= 100) {
      return value;
    }
  }

  const percentMention = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percentMention) {
    const value = Number.parseFloat(percentMention[1]!);
    if (Number.isFinite(value) && value > 0 && value <= 100) {
      return value;
    }
  }

  return 4;
}

const DEMO_HINTS = ['demo', 'controlled', 'acceptance mission'];

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
    required_exact_keys: [],
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
    required_exact_keys: [],
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

export function buildSet50NpmYfinancePlaybook(
  context: MissionContextBundle,
): MissionPlaybook {
  return {
    id: 'playbook_set50_npm_yfinance_scanner',
    slug: 'set50-npm-yfinance-scanner',
    title: 'SET50 NPM yfinance scanner mission',
    scope: 'domain',
    mission_kind: 'set50_npm_yfinance_scanner',
    required_exact_keys: [],
    preferred_workers: ['shell', 'verifier'],
    planning_hints: Array.from(new Set([
      ...context.planning_hints,
      'Run the SET50 scanner command through shell and capture machine-readable evidence.',
      'Extract pass-list for NPM threshold and include objective/risk/next action.',
      'If market fields are missing, return a grounded retryable result instead of claiming completion.',
    ])).slice(0, 6),
    report_format: 'Objective, pass list, evidence, checks, risks, next action.',
    verifier_checklist: [
      {
        id: 'check_note_evidence',
        name: 'Owner-facing note evidence exists',
        required: true,
        artifact_kind: 'note',
        validation_source: 'artifact',
        detail: 'Scanner runs must produce a concise owner-facing note.',
      },
      {
        id: 'check_report_file',
        name: 'Scanner report artifact exists',
        required: true,
        artifact_kind: 'file',
        validation_source: 'artifact',
        detail: 'Scanner runs must save a report file for reproducibility.',
      },
      {
        id: 'check_worker_checks',
        name: 'Worker and manager checks are recorded',
        required: true,
        artifact_kind: null,
        validation_source: 'any',
        detail: 'Verification must include explicit checks and outcomes.',
      },
    ],
    repair_heuristics: [
      {
        id: 'repair_set50_npm_collect_market_fields',
        trigger: 'verification_failed',
        instruction: 'Capture missing market fields and rerun scanner with the same threshold.',
        max_retries: 2,
      },
      {
        id: 'repair_set50_npm_clarify_threshold',
        trigger: 'blocked_or_ambiguous',
        instruction: 'Clarify target threshold and symbol scope before rerun.',
        max_retries: 1,
      },
    ],
  };
}

export function buildSet50DividendYfinancePlaybook(
  context: MissionContextBundle,
): MissionPlaybook {
  return {
    id: 'playbook_set50_dividend_yfinance_scanner',
    slug: 'set50-dividend-yfinance-scanner',
    title: 'SET50 dividend yfinance scanner mission',
    scope: 'domain',
    mission_kind: 'set50_dividend_yfinance_scanner',
    required_exact_keys: [],
    preferred_workers: ['shell', 'verifier'],
    planning_hints: Array.from(new Set([
      ...context.planning_hints,
      'Run the SET50 dividend scanner command through shell and capture machine-readable evidence.',
      'Extract pass-list for dividend threshold and include objective/risk/next action.',
      'If dividend fields are missing, return a grounded retryable result instead of claiming completion.',
    ])).slice(0, 6),
    report_format: 'Objective, pass list, evidence, checks, risks, next action.',
    verifier_checklist: [
      {
        id: 'check_note_evidence',
        name: 'Owner-facing note evidence exists',
        required: true,
        artifact_kind: 'note',
        validation_source: 'artifact',
        detail: 'Scanner runs must produce a concise owner-facing note.',
      },
      {
        id: 'check_report_file',
        name: 'Scanner report artifact exists',
        required: true,
        artifact_kind: 'file',
        validation_source: 'artifact',
        detail: 'Scanner runs must save a report file for reproducibility.',
      },
      {
        id: 'check_worker_checks',
        name: 'Worker and manager checks are recorded',
        required: true,
        artifact_kind: null,
        validation_source: 'any',
        detail: 'Verification must include explicit checks and outcomes.',
      },
    ],
    repair_heuristics: [
      {
        id: 'repair_set50_dividend_collect_market_fields',
        trigger: 'verification_failed',
        instruction: 'Capture missing dividend fields and rerun scanner with the same threshold.',
        max_retries: 2,
      },
      {
        id: 'repair_set50_dividend_clarify_threshold',
        trigger: 'blocked_or_ambiguous',
        instruction: 'Clarify target threshold and symbol scope before rerun.',
        max_retries: 1,
      },
    ],
  };
}

export function resolveRegisteredMissionPlaybook(
  input: ManagerInput,
  context: MissionContextBundle,
  decision: ManagerDecision,
): MissionPlaybook | null {
  if (decision.mission_profile_hint === 'set50_dividend_yfinance_scanner') {
    return buildSet50DividendYfinancePlaybook(context);
  }

  if (decision.mission_profile_hint === 'set50_npm_yfinance_scanner') {
    return buildSet50NpmYfinancePlaybook(context);
  }

  if (decision.mission_profile_hint === 'thai_equities_daily_scanner') {
    return buildThaiEquitiesStockScannerPlaybook(context, decision);
  }

  if (decision.mission_profile_hint === 'thai_equities_manager_led_scanner') {
    return buildThaiEquitiesActualManagerPlaybook(context, decision);
  }

  if (typeof decision.mission_profile_hint === 'string' && decision.mission_profile_hint.trim().length > 0) {
    return null;
  }

  if (isSet50DividendYfinanceGoal(input.goal)) {
    return buildSet50DividendYfinancePlaybook(context);
  }

  if (isSet50NpmYfinanceGoal(input.goal)) {
    return buildSet50NpmYfinancePlaybook(context);
  }

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
    if (brief.mission_kind === 'set50_dividend_yfinance_scanner') {
      const threshold = extractSet50DividendThreshold(brief.goal);
      const args = [
        'scripts/run-set50-dividend-mission.ts',
        `--min-yield=${threshold}`,
      ];
      return {
        command: 'bun',
        args,
        raw: ['bun', ...args].join(' '),
      };
    }

    if (brief.mission_kind === 'set50_npm_yfinance_scanner') {
      const threshold = extractSet50NpmThreshold(brief.goal);
      const args = [
        'scripts/run-set50-npm-mission.ts',
        `--min-npm=${threshold}`,
      ];
      return {
        command: 'bun',
        args,
        raw: ['bun', ...args].join(' '),
      };
    }
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

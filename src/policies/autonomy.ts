import type { MissionStatus } from '../types.ts';

export const AUTONOMY_LEVELS = [
  'supervised',
  'semi_autonomous',
  'autonomous',
] as const;

export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export interface AutonomyPolicyConfig {
  default_level: AutonomyLevel;
  mission_kind_levels: Record<string, AutonomyLevel>;
  routine_min_verified_runs: number;
  updated_at: number;
}

export interface AutonomyPolicyUpdateInput {
  default_level?: AutonomyLevel;
  mission_kind_levels?: Record<string, AutonomyLevel>;
  routine_min_verified_runs?: number;
}

export interface AutonomyDecision {
  mission_kind: string;
  mission_status: MissionStatus;
  configured_level: AutonomyLevel;
  effective_level: AutonomyLevel;
  prior_verified_runs: number;
  is_routine: boolean;
  requires_operator_approval: boolean;
  auto_approved: boolean;
  alert_required: boolean;
  reason: string;
  evaluated_at: number;
}

export function defaultAutonomyPolicy(now: () => number = () => Date.now()): AutonomyPolicyConfig {
  return {
    default_level: 'supervised',
    mission_kind_levels: {},
    routine_min_verified_runs: 2,
    updated_at: now(),
  };
}

export function normalizeAutonomyPolicy(
  input: unknown,
  now: () => number = () => Date.now(),
): AutonomyPolicyConfig {
  if (!input || typeof input !== 'object') {
    return defaultAutonomyPolicy(now);
  }
  const payload = input as Partial<AutonomyPolicyConfig>;
  const defaultLevel = AUTONOMY_LEVELS.includes(payload.default_level as AutonomyLevel)
    ? payload.default_level as AutonomyLevel
    : 'supervised';
  const routineMinVerifiedRuns = Number.isFinite(payload.routine_min_verified_runs)
    ? Math.max(0, Math.floor(Number(payload.routine_min_verified_runs)))
    : 2;
  const missionKindLevels: Record<string, AutonomyLevel> = {};
  if (payload.mission_kind_levels && typeof payload.mission_kind_levels === 'object') {
    for (const [missionKind, level] of Object.entries(payload.mission_kind_levels)) {
      if (!missionKind.trim()) {
        continue;
      }
      if (!AUTONOMY_LEVELS.includes(level as AutonomyLevel)) {
        continue;
      }
      missionKindLevels[missionKind.trim()] = level as AutonomyLevel;
    }
  }

  return {
    default_level: defaultLevel,
    mission_kind_levels: missionKindLevels,
    routine_min_verified_runs: routineMinVerifiedRuns,
    updated_at: Number.isFinite(payload.updated_at)
      ? Number(payload.updated_at)
      : now(),
  };
}

export function applyAutonomyPolicyUpdate(
  current: AutonomyPolicyConfig,
  update: AutonomyPolicyUpdateInput,
  now: () => number = () => Date.now(),
): AutonomyPolicyConfig {
  const nextMissionKindLevels = { ...current.mission_kind_levels };
  if (update.mission_kind_levels) {
    for (const [missionKind, level] of Object.entries(update.mission_kind_levels)) {
      const normalizedKind = missionKind.trim();
      if (!normalizedKind) {
        continue;
      }
      if (!AUTONOMY_LEVELS.includes(level)) {
        throw new Error(`unsupported autonomy level for mission kind ${normalizedKind}`);
      }
      nextMissionKindLevels[normalizedKind] = level;
    }
  }

  return {
    default_level: update.default_level ?? current.default_level,
    mission_kind_levels: nextMissionKindLevels,
    routine_min_verified_runs: update.routine_min_verified_runs == null
      ? current.routine_min_verified_runs
      : Math.max(0, Math.floor(update.routine_min_verified_runs)),
    updated_at: now(),
  };
}

export function evaluateAutonomyDecision(input: {
  policy: AutonomyPolicyConfig;
  mission_kind: string;
  mission_status: MissionStatus;
  prior_verified_runs: number;
  now?: () => number;
}): AutonomyDecision {
  const now = input.now ?? (() => Date.now());
  const missionKind = input.mission_kind.trim();
  const configuredLevel = input.policy.mission_kind_levels[missionKind] ?? input.policy.default_level;
  const priorVerifiedRuns = Math.max(0, Math.floor(input.prior_verified_runs));
  const routineThreshold = Math.max(0, input.policy.routine_min_verified_runs);
  const isRoutine = priorVerifiedRuns >= routineThreshold;

  const approvalCandidate = input.mission_status === 'verified_complete';
  let requiresOperatorApproval = false;
  let reason = 'No approval gate is required for this mission status.';
  if (approvalCandidate) {
    if (configuredLevel === 'supervised') {
      requiresOperatorApproval = true;
      reason = 'Supervised mode requires operator approval for every verified mission.';
    } else if (configuredLevel === 'semi_autonomous') {
      requiresOperatorApproval = !isRoutine;
      reason = isRoutine
        ? `Semi-autonomous mode auto-approves routine missions (prior verified runs: ${priorVerifiedRuns}).`
        : `Semi-autonomous mode gates novel missions until operator approval (prior verified runs: ${priorVerifiedRuns}).`;
    } else {
      requiresOperatorApproval = false;
      reason = 'Autonomous mode auto-approves verified missions within policy bounds.';
    }
  }

  const alertRequired = configuredLevel === 'autonomous'
    && (input.mission_status === 'verification_failed' || input.mission_status === 'rejected');

  return {
    mission_kind: missionKind,
    mission_status: input.mission_status,
    configured_level: configuredLevel,
    effective_level: configuredLevel,
    prior_verified_runs: priorVerifiedRuns,
    is_routine: isRoutine,
    requires_operator_approval: requiresOperatorApproval,
    auto_approved: approvalCandidate && !requiresOperatorApproval,
    alert_required: alertRequired,
    reason: alertRequired
      ? `${reason} Autonomous mode raised an alert because the mission did not complete successfully.`
      : reason,
    evaluated_at: now(),
  };
}

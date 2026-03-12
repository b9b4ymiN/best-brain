import { describe, expect, test } from 'bun:test';
import {
  applyAutonomyPolicyUpdate,
  defaultAutonomyPolicy,
  evaluateAutonomyDecision,
  normalizeAutonomyPolicy,
} from '../src/policies/autonomy.ts';

describe('autonomy policy', () => {
  test('evaluates supervised, semi-autonomous, and autonomous approval behavior', () => {
    const base = defaultAutonomyPolicy(() => 1_700_000_000_000);
    expect(base.default_level).toBe('supervised');
    expect(base.routine_min_verified_runs).toBe(2);

    const supervisedDecision = evaluateAutonomyDecision({
      policy: base,
      mission_kind: 'command_execution_mission',
      mission_status: 'verified_complete',
      prior_verified_runs: 10,
      now: () => 1_700_000_000_100,
    });
    expect(supervisedDecision.requires_operator_approval).toBe(true);
    expect(supervisedDecision.auto_approved).toBe(false);

    const semiPolicy = applyAutonomyPolicyUpdate(base, {
      default_level: 'semi_autonomous',
      routine_min_verified_runs: 1,
    }, () => 1_700_000_000_200);
    const semiNovel = evaluateAutonomyDecision({
      policy: semiPolicy,
      mission_kind: 'command_execution_mission',
      mission_status: 'verified_complete',
      prior_verified_runs: 0,
      now: () => 1_700_000_000_300,
    });
    const semiRoutine = evaluateAutonomyDecision({
      policy: semiPolicy,
      mission_kind: 'command_execution_mission',
      mission_status: 'verified_complete',
      prior_verified_runs: 1,
      now: () => 1_700_000_000_400,
    });
    expect(semiNovel.requires_operator_approval).toBe(true);
    expect(semiRoutine.requires_operator_approval).toBe(false);
    expect(semiRoutine.auto_approved).toBe(true);

    const autonomousPolicy = applyAutonomyPolicyUpdate(semiPolicy, {
      default_level: 'autonomous',
    }, () => 1_700_000_000_500);
    const autonomousFailure = evaluateAutonomyDecision({
      policy: autonomousPolicy,
      mission_kind: 'command_execution_mission',
      mission_status: 'verification_failed',
      prior_verified_runs: 3,
      now: () => 1_700_000_000_600,
    });
    expect(autonomousFailure.requires_operator_approval).toBe(false);
    expect(autonomousFailure.alert_required).toBe(true);
  });

  test('normalizes persisted policy payloads and ignores invalid mission-kind levels', () => {
    const normalized = normalizeAutonomyPolicy({
      default_level: 'semi_autonomous',
      mission_kind_levels: {
        command_execution_mission: 'autonomous',
        invalid_kind: 'unsupported',
      },
      routine_min_verified_runs: 4,
      updated_at: 123,
    }, () => 999);

    expect(normalized.default_level).toBe('semi_autonomous');
    expect(normalized.mission_kind_levels.command_execution_mission).toBe('autonomous');
    expect(normalized.mission_kind_levels.invalid_kind).toBeUndefined();
    expect(normalized.routine_min_verified_runs).toBe(4);
    expect(normalized.updated_at).toBe(123);
  });
});

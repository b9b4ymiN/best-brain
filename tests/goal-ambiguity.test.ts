import { describe, expect, test } from 'bun:test';
import { routeIntent } from '../src/manager/intent-router.ts';
import { detectGoalAmbiguity } from '../src/manager/goal-ambiguity.ts';
import type { ManagerInput } from '../src/manager/types.ts';

interface AmbiguityCase {
  goal: string;
  mission_id?: string | null;
  expected_ambiguous?: boolean;
  expected_missing?: string[];
}

function makeInput(goal: string, mission_id: string | null = null): ManagerInput {
  return {
    goal,
    worker_preference: 'auto',
    mission_id,
    cwd: process.cwd(),
    dry_run: false,
    no_execute: false,
    output_mode: 'json',
  };
}

const UNAMBIGUOUS_CASES: AmbiguityCase[] = [
  { goal: 'Implement a verification guard in this repo and return a proof note.' },
  { goal: 'Run `bun --version` and summarize the output in one note.' },
  { goal: 'Create a mission report that analyzes current project status and includes evidence.' },
  { goal: 'ช่วย run bun test แล้วสรุปผลเป็นรายงานพร้อมหลักฐาน' },
  { goal: 'Review scanner criteria and deliver an owner-facing summary with proof.' },
  { goal: 'Analyze repo status and return checklist pass/fail output.' },
  { goal: 'Execute the shell smoke command and provide a result summary.' },
  { goal: 'สแกนหุ้นไทยแล้วสรุปรายงานพร้อมหลักฐานและความเสี่ยง' },
  { goal: 'Refactor the manager runtime in this repo and provide file evidence.' },
  { goal: 'Create concise report for verification checks in this project.' },
  { goal: 'Run `bun run eval:chat` then report pass/fail and next action.' },
  { goal: 'Build the local server and return startup logs with a verification note.' },
  { goal: 'Implement TypeScript type cleanup in this repo and provide patch evidence.' },
  { goal: 'Analyze mission history and summarize recurring failures with mitigation steps.' },
  { goal: 'ช่วยเขียนสรุปผลจากการรันเทส พร้อมหลักฐานการตรวจ' },
  { goal: 'Run command `git status` and return concise proof.' },
  { goal: 'Draft an analysis plan for this project and include a verification checklist.' },
  { goal: 'Create a report comparing latest verified mission versus stale notes.' },
  { goal: 'ตรวจ repo นี้แล้วสรุป action ที่ต้องทำต่อ พร้อมหลักฐาน' },
  { goal: 'Plan and verify a command execution mission for bun test output.' },
  {
    goal: 'Run the same scanner as before and provide updated proof report.',
    mission_id: 'mission_anchor_001',
  },
  {
    goal: 'Continue mission_2 and run the command checklist with proof.',
    mission_id: 'mission_anchor_002',
  },
];

const AMBIGUOUS_CASES: AmbiguityCase[] = [
  {
    goal: 'Fix it',
    expected_ambiguous: true,
    expected_missing: ['target_scope', 'work_target', 'success_criteria'],
  },
  {
    goal: 'Run it again',
    expected_ambiguous: true,
    expected_missing: ['target_scope', 'work_target', 'success_criteria'],
  },
  {
    goal: 'build and run and verify',
    expected_ambiguous: true,
    expected_missing: ['work_target', 'success_criteria'],
  },
  {
    goal: 'Implement repo changes and redesign UI and write docs',
    expected_ambiguous: true,
    expected_missing: ['scope_prioritization'],
  },
  {
    goal: 'Run same as before and finish it',
    expected_ambiguous: true,
    expected_missing: ['baseline_reference'],
  },
  {
    goal: 'แก้แบบเดิมแล้วทำต่อ',
    expected_ambiguous: true,
    expected_missing: ['baseline_reference'],
  },
  {
    goal: 'execute this and that',
    expected_ambiguous: true,
    expected_missing: ['target_scope', 'work_target'],
  },
  {
    goal: 'run and build and lint',
    expected_ambiguous: true,
    expected_missing: ['work_target', 'success_criteria', 'scope_prioritization'],
  },
];

describe('goal ambiguity hardening', () => {
  test('covers >=20 curated mixed-language, multi-objective, and implicit-constraint cases', () => {
    const totalCases = UNAMBIGUOUS_CASES.length + AMBIGUOUS_CASES.length;
    expect(totalCases).toBeGreaterThanOrEqual(20);

    const unexpectedBlocks: Array<{ goal: string; missing: string[] }> = [];
    for (const testCase of UNAMBIGUOUS_CASES) {
      const input = makeInput(testCase.goal, testCase.mission_id ?? null);
      const decision = routeIntent(input);
      const ambiguity = detectGoalAmbiguity(input, decision);
      if (ambiguity.is_ambiguous) {
        unexpectedBlocks.push({
          goal: testCase.goal,
          missing: ambiguity.missing_clarifications,
        });
      }
    }
    expect(unexpectedBlocks).toEqual([]);

    const missedAmbiguity: Array<{ goal: string; missing: string[] }> = [];
    const missingFieldMismatch: Array<{ goal: string; expected: string; actual: string[] }> = [];
    for (const testCase of AMBIGUOUS_CASES) {
      const input = makeInput(testCase.goal, testCase.mission_id ?? null);
      const decision = routeIntent(input);
      const ambiguity = detectGoalAmbiguity(input, decision);
      if (!ambiguity.is_ambiguous) {
        missedAmbiguity.push({
          goal: testCase.goal,
          missing: ambiguity.missing_clarifications,
        });
        continue;
      }
      for (const expectedMissing of testCase.expected_missing ?? []) {
        if (!ambiguity.missing_clarifications.includes(expectedMissing)) {
          missingFieldMismatch.push({
            goal: testCase.goal,
            expected: expectedMissing,
            actual: ambiguity.missing_clarifications,
          });
        }
      }
    }
    expect(missedAmbiguity).toEqual([]);
    expect(missingFieldMismatch).toEqual([]);
  });

  test('false-block rate stays below 5% on clear executable goals', () => {
    const falseBlocks = UNAMBIGUOUS_CASES.reduce((total, testCase) => {
      const input = makeInput(testCase.goal, testCase.mission_id ?? null);
      const decision = routeIntent(input);
      const ambiguity = detectGoalAmbiguity(input, decision);
      return total + (ambiguity.is_ambiguous ? 1 : 0);
    }, 0);

    const falseBlockRate = falseBlocks / UNAMBIGUOUS_CASES.length;
    expect(falseBlockRate).toBeLessThan(0.05);
  });
});

import { describe, expect, test } from 'bun:test';
import type { ManagerRunResult } from '../src/manager/types.ts';
import { AutonomousTaskQueue } from '../src/runtime/task-queue.ts';
import { createTestBrain } from './helpers.ts';

function buildQueueFollowupResult(input: {
  goal: string;
  missionId: string;
  verificationStatus: 'verified_complete' | 'verification_failed' | 'rejected';
  retryable: boolean;
  planningHints: string[];
}): ManagerRunResult {
  const payload: unknown = {
    input: {
      goal: input.goal,
      worker_preference: 'auto',
      mission_id: input.missionId,
      cwd: process.cwd(),
      dry_run: false,
      no_execute: false,
      output_mode: 'json',
    },
    decision: {
      kind: 'task',
      chat_mode: null,
      should_execute: true,
      selected_worker: 'claude',
      reason: 'test',
      verification_required: true,
      blocked_reason: null,
      blocked_reason_code: null,
    },
    goal_ambiguity: {
      is_ambiguous: false,
      reason: 'clear',
      missing_clarifications: [],
      confidence: 'high',
    },
    mission_brief: {
      mission_id: input.missionId,
      mission_kind: 'command_execution_mission',
      mission_definition_id: 'test_definition',
      acceptance_profile_id: 'test_acceptance',
      report_contract_id: 'test_report',
      required_exact_keys: [],
      resolved_exact_keys: [],
      missing_exact_keys: [],
      conflicting_exact_keys: [],
      goal: input.goal,
      kind: 'task',
      selected_worker: 'claude',
      success_criteria: ['complete'],
      constraints: [],
      preferred_format: 'brief',
      planning_hints: input.planningHints,
      brain_citations: [],
      brain_trace_id: 'trace_test',
      playbook: {
        id: 'playbook_test',
        slug: 'playbook-test',
        title: 'Test playbook',
        scope: 'mission',
        mission_kind: 'command_execution_mission',
        required_exact_keys: [],
        preferred_workers: ['claude'],
        planning_hints: input.planningHints,
        report_format: 'brief',
        verifier_checklist: [],
        repair_heuristics: [
          {
            id: 'repair_test',
            trigger: 'verification_failed',
            instruction: 'Retry failed verification checks with focused evidence.',
            max_retries: 2,
          },
        ],
      },
      mission_definition: {
        id: 'test_definition',
        slug: 'test-definition',
        title: 'Test definition',
        mission_kind: 'command_execution_mission',
        goal_template: 'Do test work',
        required_exact_keys: [],
        required_inputs: [],
        allowed_workers: ['claude'],
        required_evidence: [],
        verifier_checklist: [],
        repair_heuristics: [],
        report_contract: {
          id: 'test_report',
          title: 'Test report',
          required_sections: ['objective', 'result_summary'],
          artifact_kind: 'report',
          requires_verification_evidence: false,
        },
        acceptance: {
          id: 'acceptance_test',
          acceptance_scenarios: ['success'],
          success_statuses: ['verified_complete'],
          retryable_statuses: ['verification_failed'],
          blocked_reasons: ['ambiguous_goal'],
          required_evidence_types: [],
          required_check_names: [],
        },
      },
      report_contract: {
        id: 'test_report',
        title: 'Test report',
        required_sections: ['objective', 'result_summary'],
        artifact_kind: 'report',
        requires_verification_evidence: false,
      },
      input_adapter_decisions: [],
      manager_derivation: null,
      mission_graph: {
        mission_id: input.missionId,
        nodes: [],
        edges: [],
      },
      execution_plan: [],
    },
    mission_brief_validation: {
      is_complete: true,
      completeness_score: 1,
      missing_fields: [],
      warnings: [],
    },
    mission_graph: {
      mission_id: input.missionId,
      nodes: [],
      edges: [],
    },
    runtime_bundle: null,
    worker_result: null,
    verification_result: {
      mission_id: input.missionId,
      status: input.verificationStatus,
      verification_run_id: `verify_${input.missionId}`,
      evidence_count: input.verificationStatus === 'verified_complete' ? 1 : 0,
      checks_passed: input.verificationStatus === 'verified_complete' ? 1 : 0,
      checks_total: 1,
    },
    brain_writes: [],
    owner_response: '',
    final_message: `Result: ${input.verificationStatus}`,
    retryable: input.retryable,
    started_brain_server: false,
  };
  return payload as ManagerRunResult;
}

describe('autonomous task queue', () => {
  test('prioritizes urgent tasks and retries retryable failures with backoff', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    let now = 1_700_000_000_000;
    try {
      const queue = new AutonomousTaskQueue({
        store: brain.store,
        now: () => now,
        executeTask: async (item) => {
          if (item.goal === 'retry candidate' && item.attempt_count === 1) {
            return {
              mission_id: `mission_${item.id}_attempt_${item.attempt_count}`,
              status: 'verification_failed',
              final_message: 'needs retry',
              retryable: true,
            };
          }
          return {
            mission_id: `mission_${item.id}_attempt_${item.attempt_count}`,
            status: 'verified_complete',
            final_message: 'ok',
            retryable: false,
          };
        },
      });

      const background = queue.enqueue({
        goal: 'background task',
        priority: 'background',
        source: 'manual_test',
      });
      const urgent = queue.enqueue({
        goal: 'urgent task',
        priority: 'urgent',
        source: 'manual_test',
      });
      const retryCandidate = queue.enqueue({
        goal: 'retry candidate',
        priority: 'scheduled',
        source: 'manual_test',
      });

      const firstTick = await queue.tick(1);
      expect(firstTick.processed_count).toBe(1);
      expect(firstTick.items[0]?.queue_item_id).toBe(urgent.id);
      expect(firstTick.items[0]?.final_status).toBe('completed');

      const secondTick = await queue.tick(2);
      expect(secondTick.processed_count).toBe(2);
      expect(secondTick.items.some((item) => item.queue_item_id === retryCandidate.id && item.final_status === 'queued' && item.retry_scheduled)).toBe(true);
      expect(secondTick.items.some((item) => item.queue_item_id === background.id && item.final_status === 'completed')).toBe(true);

      const retryQueued = brain.store.getTaskQueueItem(retryCandidate.id);
      expect(retryQueued?.status).toBe('queued');
      expect(retryQueued?.attempt_count).toBe(1);
      expect((retryQueued?.next_attempt_at ?? 0) > now).toBe(true);

      now += 61_000;
      const retryTick = await queue.tick(1);
      expect(retryTick.processed_count).toBe(1);
      expect(retryTick.items[0]?.queue_item_id).toBe(retryCandidate.id);
      expect(retryTick.items[0]?.final_status).toBe('completed');

      const retryCompleted = brain.store.getTaskQueueItem(retryCandidate.id);
      expect(retryCompleted?.status).toBe('completed');
      expect(retryCompleted?.attempt_count).toBe(2);
    } finally {
      cleanup();
    }
  });

  test('enqueues follow-up tasks from manager results with dedupe guards', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: false });
    try {
      const queue = new AutonomousTaskQueue({
        store: brain.store,
        executeTask: async () => ({
          mission_id: null,
          status: 'verified_complete',
          final_message: 'ok',
          retryable: false,
        }),
      });

      const failedResult = buildQueueFollowupResult({
        goal: 'Build scanner',
        missionId: 'mission_failed',
        verificationStatus: 'verification_failed',
        retryable: true,
        planningHints: ['collect validation evidence'],
      });
      const firstFollowups = queue.enqueueFollowupsFromResult(failedResult);
      expect(firstFollowups.length).toBe(1);
      expect(firstFollowups[0]?.source).toBe('verification_retry');
      expect(firstFollowups[0]?.priority).toBe('urgent');

      const duplicateFollowups = queue.enqueueFollowupsFromResult(failedResult);
      expect(duplicateFollowups.length).toBe(0);

      const completedResult = buildQueueFollowupResult({
        goal: 'Run stock scan',
        missionId: 'mission_complete',
        verificationStatus: 'verified_complete',
        retryable: false,
        planningHints: ['rotate symbols', 'tighten valuation filter'],
      });
      const planningFollowups = queue.enqueueFollowupsFromResult(completedResult);
      expect(planningFollowups.length).toBe(1);
      expect(planningFollowups[0]?.source).toBe('planning_followup');
      expect(planningFollowups[0]?.priority).toBe('background');

      const queueGeneratedResult = buildQueueFollowupResult({
        goal: 'Retry mission mission_failed after verification_failed verification.',
        missionId: 'mission_queue_generated',
        verificationStatus: 'verification_failed',
        retryable: true,
        planningHints: ['should not enqueue'],
      });
      const suppressed = queue.enqueueFollowupsFromResult(queueGeneratedResult);
      expect(suppressed.length).toBe(0);
    } finally {
      cleanup();
    }
  });
});

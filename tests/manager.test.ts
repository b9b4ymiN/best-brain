import { describe, expect, test } from 'bun:test';
import type {
  CompletionProofState,
  ConsultResponse,
  FailureInput,
  LearnRequest,
  LearnResult,
  MissionContextBundle,
  StrictMissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../src/types.ts';
import { routeIntent } from '../src/manager/intent-router.ts';
import { detectGoalAmbiguity } from '../src/manager/goal-ambiguity.ts';
import type { ChatResponder } from '../src/manager/chat-responder.ts';
import type { ManagerReasoner, ManagerTriageResult } from '../src/manager/reasoner.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { BrainAdapter, BrainHealthResponse, VerifierAdapter, WorkerAdapter } from '../src/manager/adapters/types.ts';
import type {
  ExecutionRequest,
  ManagerInput,
  VerificationRequest,
  WorkerExecutionResult,
} from '../src/manager/types.ts';

const THAI_TODAY_QUESTION = '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23';
const THAI_MONDAY_FRAGMENT = '\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c';
const THAI_MONDAY_COLOR_QUESTION = '\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c\u0e2a\u0e35\u0e2d\u0e30\u0e44\u0e23';
const THAI_MONTH_QUESTION = '\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e44\u0e23';

function makeInput(goal: string, overrides: Partial<ManagerInput> = {}): ManagerInput {
  return {
    goal,
    worker_preference: 'auto',
    mission_id: null,
    cwd: process.cwd(),
    dry_run: false,
    no_execute: false,
    output_mode: 'json',
    ...overrides,
  };
}

function makeConsultResponse(overrides: Partial<ConsultResponse> = {}): ConsultResponse {
  return {
    answer: 'Consult intent: recent_mission.\n- [MissionMemory] Mission outcome: Ship manager alpha: Verified manager run.',
    memory_ids: ['mem_verified_mission'],
    citations: [{
      memory_id: 'mem_verified_mission',
      title: 'Mission outcome: Ship manager alpha',
      memory_type: 'MissionMemory',
      memory_scope: 'mission',
      memory_layer: 'retro',
      memory_subtype: 'mission.outcome',
      summary: 'Verified manager run.',
      source: 'mission_outcome',
      verified_by: 'verifier',
      evidence_ref: [{ type: 'note', ref: 'proof://manager-alpha' }],
      entity_keys: ['mission_outcome'],
      entity_aliases: [],
    }],
    policy_path: 'deterministic.recent_mission.v1',
    query_profile: 'balanced',
    retrieval_mode: 'fts_only',
    confidence_band: 'high',
    followup_actions: ['Use the verified mission before stale notes.'],
    trace_id: 'trace_manager_test',
    selected_memories: [],
    retrieval_bundle: null,
    ...overrides,
  };
}

function makeContextBundle(overrides: Partial<MissionContextBundle> = {}): MissionContextBundle {
  return {
    mission: null,
    history: [],
    working_memory: [],
    durable_memory: [],
    planning_hints: ['Preserve the proof chain.', 'Keep summaries concise.'],
    preferred_format: 'Concise status, evidence, next action.',
    verification_state: null,
    verification_artifacts: [],
    manager_bundle: null,
    ...overrides,
  };
}

class FakeBrainAdapter implements BrainAdapter {
  readonly calls = {
    ensureAvailable: 0,
    consult: [] as Array<{ query: string }>,
    learn: [] as LearnRequest[],
    context: [] as Array<{ mission_id?: string | null; domain?: string | null; query?: string | null }>,
    saveOutcome: [] as StrictMissionOutcomeInput[],
    saveFailure: [] as FailureInput[],
    startVerification: [] as VerificationStartInput[],
    completeVerification: [] as VerificationCompleteInput[],
  };
  readonly consultResponse: ConsultResponse;
  readonly contextResponse: MissionContextBundle;
  startedByAdapter = false;

  constructor(options: {
    consultResponse?: ConsultResponse;
    contextResponse?: MissionContextBundle;
    startedByAdapter?: boolean;
  } = {}) {
    this.consultResponse = options.consultResponse ?? makeConsultResponse();
    this.contextResponse = options.contextResponse ?? makeContextBundle();
    this.startedByAdapter = options.startedByAdapter ?? false;
  }

  async ensureAvailable(): Promise<BrainHealthResponse> {
    this.calls.ensureAvailable += 1;
    return {
      status: 'ok',
      db_path: 'fake.db',
      seeded: true,
      onboarded: true,
    };
  }

  wasStartedByAdapter(): boolean {
    return this.startedByAdapter;
  }

  async consult(request: { query: string }): Promise<ConsultResponse> {
    this.calls.consult.push(request);
    return this.consultResponse;
  }

  async learn(request: LearnRequest): Promise<LearnResult> {
    this.calls.learn.push(request);
    return {
      accepted: true,
      action: 'created',
      reason: 'stored chat memory',
      memory_id: 'mem_chat_learn',
      memory_type: request.mode === 'persona' ? 'Persona' : 'WorkingMemory',
      status: 'active',
    };
  }

  async context(params: { mission_id?: string | null; domain?: string | null; query?: string | null }): Promise<MissionContextBundle> {
    this.calls.context.push(params);
    return this.contextResponse;
  }

  async saveOutcome(input: StrictMissionOutcomeInput): Promise<{
    mission: { id: string; status: string };
    learn_result: { accepted: boolean; memory_id: string | null };
    proof_state: CompletionProofState | null;
  }> {
    this.calls.saveOutcome.push(input);
    return {
      mission: { id: input.mission_id, status: input.status },
      learn_result: { accepted: true, memory_id: 'mem_outcome' },
      proof_state: null,
    };
  }

  async saveFailure(input: FailureInput): Promise<LearnResult> {
    this.calls.saveFailure.push(input);
    return {
      accepted: true,
      action: 'created',
      reason: 'stored failure lesson',
      memory_id: 'mem_failure',
      memory_type: 'FailureMemory',
      status: 'active',
    };
  }

  async startVerification(input: VerificationStartInput): Promise<CompletionProofState> {
    this.calls.startVerification.push(input);
    return {
      mission_id: input.mission_id,
      status: 'awaiting_verification',
      verification_run_id: 'verify_fake',
      evidence_count: 0,
      checks_passed: 0,
      checks_total: input.checks?.length ?? 0,
    };
  }

  async completeVerification(input: VerificationCompleteInput): Promise<CompletionProofState> {
    this.calls.completeVerification.push(input);
    return {
      mission_id: input.mission_id ?? 'unknown',
      status: input.status,
      verification_run_id: 'verify_fake',
      evidence_count: input.evidence.length,
      checks_passed: input.verification_checks.filter((check) => check.passed).length,
      checks_total: input.verification_checks.length,
    };
  }

  async dispose(): Promise<void> {}
}

class FakeWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;
  readonly requests: ExecutionRequest[] = [];

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(request: ExecutionRequest): Promise<WorkerExecutionResult> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeVerifierAdapter implements VerifierAdapter {
  readonly requests: Array<{ request: ExecutionRequest; result: WorkerExecutionResult }> = [];
  readonly response: VerificationRequest;

  constructor(response: VerificationRequest) {
    this.response = response;
  }

  async review(request: ExecutionRequest, workerResult: WorkerExecutionResult): Promise<VerificationRequest> {
    this.requests.push({ request, result: workerResult });
    return this.response;
  }
}

class FakeReasoner implements ManagerReasoner {
  readonly result: ManagerTriageResult | null;
  calls = 0;

  constructor(result: ManagerTriageResult | null) {
    this.result = result;
  }

  async triage(): Promise<ManagerTriageResult | null> {
    this.calls += 1;
    return this.result;
  }
}

class FakeChatResponder implements ChatResponder {
  readonly result: string | null;
  calls = 0;

  constructor(result: string | null) {
    this.result = result;
  }

  async answer(): Promise<string | null> {
    this.calls += 1;
    return this.result;
  }
}

describe('manager alpha unit flow', () => {
  test('intent routing auto-selects claude or codex and respects override', () => {
    expect(routeIntent(makeInput('Analyze the current mission plan.')).selected_worker).toBe('claude');
    expect(routeIntent(makeInput('Implement a new Bun test for this repo.')).selected_worker).toBe('codex');
    expect(routeIntent(makeInput('Run `bun --version` locally and summarize the result.')).selected_worker).toBe('shell');
    expect(routeIntent(makeInput('I want a Thai stock scanner system that matches how I invest.')).selected_worker).toBe('claude');
    expect(routeIntent(makeInput(THAI_TODAY_QUESTION)).kind).toBe('chat');
    expect(routeIntent(makeInput(THAI_MONDAY_FRAGMENT)).kind).toBe('chat');
    expect(routeIntent(makeInput('Implement a new Bun test for this repo.', { worker_preference: 'claude' })).selected_worker).toBe('claude');
  });

  test('goal ambiguity detector blocks underspecified execution goals', () => {
    const input = makeInput('Fix it');
    const decision = routeIntent(input);
    const ambiguity = detectGoalAmbiguity(input, decision);

    expect(decision.kind).toBe('task');
    expect(ambiguity.is_ambiguous).toBe(true);
    expect(ambiguity.missing_clarifications).toContain('target_scope');
    expect(ambiguity.missing_clarifications).toContain('success_criteria');
  });

  test('chat path consults the brain but does not execute a worker or write mission state', async () => {
    const brain = new FakeBrainAdapter();
    const runtime = new ManagerRuntime({ brain, workers: {} });

    try {
      const result = await runtime.run({
        goal: 'Why does the owner prefer concise status updates?',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('chat');
      expect(result.worker_result).toBeNull();
      expect(result.verification_result).toBeNull();
      expect(result.runtime_bundle).toBeNull();
      expect(result.brain_writes).toHaveLength(0);
      expect(result.owner_response.length).toBeGreaterThan(0);
      expect(brain.calls.consult).toHaveLength(1);
      expect(brain.calls.saveOutcome).toHaveLength(0);
      expect(result.mission_graph.nodes.some((node) => node.id === 'final_response')).toBe(true);
    } finally {
      await runtime.dispose();
    }
  });

  test('simple chat questions are classified by the AI reasoner first and can return a direct answer', async () => {
    const brain = new FakeBrainAdapter();
    const reasoner = new FakeReasoner({
      kind: 'chat',
      reason: 'The user is asking a direct factual question.',
      direct_answer: '\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e04\u0e37\u0e2d \u0e21\u0e35\u0e19\u0e32\u0e04\u0e21 2569',
    });
    const chatResponder = new FakeChatResponder(null);
    const runtime = new ManagerRuntime({
      brain,
      reasoner,
      chatResponder,
    });

    try {
      const result = await runtime.run({
        goal: THAI_MONTH_QUESTION,
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('chat');
      expect(result.owner_response).toContain('\u0e21\u0e35\u0e19\u0e32\u0e04\u0e21');
      expect(result.worker_result).toBeNull();
      expect(reasoner.calls).toBe(1);
      expect(chatResponder.calls).toBe(0);
    } finally {
      await runtime.dispose();
    }
  });

  test('generic chat questions fall through from the AI reasoner to the AI chat responder when needed', async () => {
    const brain = new FakeBrainAdapter();
    const reasoner = new FakeReasoner({
      kind: 'chat',
      reason: 'The message is a normal chat question.',
      direct_answer: null,
    });
    const chatResponder = new FakeChatResponder('\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c\u0e2a\u0e35\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e07');
    const runtime = new ManagerRuntime({
      brain,
      reasoner,
      chatResponder,
    });

    try {
      const result = await runtime.run({
        goal: THAI_MONDAY_COLOR_QUESTION,
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('chat');
      expect(result.owner_response).toContain('\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e07');
      expect(reasoner.calls).toBe(1);
      expect(chatResponder.calls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  test('memory-sensitive chat bypasses direct-answer shortcuts and uses the brain-aware chat responder', async () => {
    const brain = new FakeBrainAdapter();
    const reasoner = new FakeReasoner({
      kind: 'chat',
      reason: 'The message is a normal chat question.',
      direct_answer: 'I do not know your name.',
    });
    const chatResponder = new FakeChatResponder('Your name is Beam.');
    const runtime = new ManagerRuntime({
      brain,
      reasoner,
      chatResponder,
    });

    try {
      const result = await runtime.run({
        goal: 'What is my name?',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('chat');
      expect(result.owner_response).toBe('Your name is Beam.');
      expect(reasoner.calls).toBe(1);
      expect(chatResponder.calls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  test('memory-write chat bypasses direct-answer shortcuts and uses the brain-aware chat responder', async () => {
    const brain = new FakeBrainAdapter();
    const reasoner = new FakeReasoner({
      kind: 'chat',
      reason: 'The message is a normal chat question.',
      direct_answer: 'Okay, I will remember that.',
    });
    const chatResponder = new FakeChatResponder('Saved. Your name is Beam.');
    const runtime = new ManagerRuntime({
      brain,
      reasoner,
      chatResponder,
    });

    try {
      const result = await runtime.run({
        goal: 'Please remember that my name is Beam.',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('chat');
      expect(result.owner_response).toBe('Saved. Your name is Beam.');
      expect(reasoner.calls).toBe(1);
      expect(chatResponder.calls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  test('external reasoner is still used for concrete executable missions', async () => {
    const brain = new FakeBrainAdapter();
    const reasoner = new FakeReasoner({
      kind: 'mission',
      reason: 'This goal needs a verified system outcome.',
      direct_answer: null,
    });
    const worker = new FakeWorkerAdapter('claude', {
      summary: 'Produced an owner-facing Thai stock scanner system plan aligned to the VI persona.',
      status: 'success',
      artifacts: [{
        type: 'note',
        ref: 'worker://claude/stock-scanner-plan',
        description: 'Owner-facing stock-scanner system plan with VI criteria.',
      }],
      proposed_checks: [],
      raw_output: 'Owner-facing VI stock scanner system plan.',
    });
    const runtime = new ManagerRuntime({
      brain,
      reasoner,
      workers: { claude: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('mission');
      expect(reasoner.calls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  test('mission brief carries citations, trace, preferred format, and planning hints', async () => {
    const brain = new FakeBrainAdapter({
      consultResponse: makeConsultResponse(),
      contextResponse: makeContextBundle({
        preferred_format: 'Bullet summary with proof chain.',
        planning_hints: ['Reuse the last verified mission.', 'Do not bypass verification.'],
      }),
    });
    const runtime = new ManagerRuntime({ brain, workers: {} });

    try {
      const result = await runtime.run({
        goal: 'Plan the next mission using the latest mission proof.',
        dry_run: true,
        output_mode: 'json',
      });

      expect(result.mission_brief.brain_trace_id).toBe('trace_manager_test');
      expect(result.mission_brief.brain_citations).toHaveLength(1);
      expect(result.mission_brief.preferred_format).toContain('proof chain');
      expect(result.mission_brief.planning_hints).toContain('Reuse the last verified mission.');
      expect(result.mission_brief.success_criteria.some((item) => item.includes('Do not claim done'))).toBe(true);
      expect(result.mission_brief.mission_definition_id).toContain('mission_definition_');
      expect(result.mission_brief.acceptance_profile_id).toContain('acceptance_');
      expect(result.mission_brief.report_contract_id).toContain('report_contract_');
      expect(result.mission_brief.input_adapter_decisions.length).toBeGreaterThan(0);
      expect(result.mission_brief.playbook.id).toContain('analysis-reporting-mission');
      expect(result.mission_brief.playbook.verifier_checklist.length).toBeGreaterThan(0);
      expect(result.mission_brief_validation.is_complete).toBe(true);
      expect(result.mission_brief_validation.completeness_score).toBe(100);
      expect(result.mission_brief.mission_graph.playbook_id).toBe(result.mission_brief.playbook.id);
      expect(result.mission_graph.nodes.map((node) => node.id)).toEqual([
        'context_review',
        'data_selection',
        'primary_work',
        'verification_gate',
        'final_report',
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  test('actual manager-led stock mission derives VI criteria from memory and completes without a demo shortcut', async () => {
    const brain = new FakeBrainAdapter({
      consultResponse: makeConsultResponse({
        citations: [
          {
            memory_id: 'mem_owner_vi',
            title: 'Owner persona',
            memory_type: 'Persona',
            memory_scope: 'owner',
            memory_layer: 'principle',
            memory_subtype: 'persona.investor_style',
            summary: 'The owner is a Thai-equities VI investor who prefers durable moat, free cash flow, high ROE, low debt, and margin of safety.',
            source: 'onboarding',
            verified_by: 'user',
            evidence_ref: [{ type: 'note', ref: 'onboarding://persona' }],
            entity_keys: ['owner_investor_style'],
            entity_aliases: ['value investor', 'vi'],
          },
          {
            memory_id: 'mem_vi_procedure',
            title: 'Thai equities VI screening playbook',
            memory_type: 'Procedures',
            memory_scope: 'cross_mission',
            memory_layer: 'pattern',
            memory_subtype: 'procedure.planning',
            summary: 'For a Thai-equities scanner, prioritize durable moat, earnings consistency, free cash flow quality, ROE, low debt, and valuation discount.',
            source: 'phase5-proof',
            verified_by: 'user',
            evidence_ref: [{ type: 'note', ref: 'phase5://vi-screening-playbook' }],
            entity_keys: ['owner_investor_style', 'scanner_criteria'],
            entity_aliases: ['vi'],
          },
        ],
        followup_actions: [
          'Carry the VI criteria into the stock-scanner plan.',
          'Keep the final answer owner-facing and proof-backed.',
        ],
        trace_id: 'trace_actual_stock_manager',
      }),
      contextResponse: makeContextBundle({
        preferred_format: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
        planning_hints: [
          'Recall the owner investment persona before deciding screening criteria.',
          'Return an owner-facing stock-scanner system plan, not a demo script.',
        ],
      }),
    });
    const worker = new FakeWorkerAdapter('claude', {
      summary: 'Produced an owner-facing Thai stock scanner system plan aligned to the VI persona.',
      status: 'success',
      artifacts: [{
        type: 'note',
        ref: 'worker://claude/stock-scanner-plan',
        description: 'Owner-facing stock-scanner system plan with VI criteria.',
      }],
      proposed_checks: [],
      raw_output: 'Owner-facing VI stock scanner system plan.',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { claude: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('mission');
      expect(result.decision.selected_worker).toBe('claude');
      expect(result.mission_brief.mission_kind).toBe('thai_equities_manager_led_scanner');
      expect(result.mission_brief.manager_derivation?.owner_archetype).toBe('value_investor');
      expect(result.mission_brief.manager_derivation?.screening_criteria).toEqual(expect.arrayContaining([
        'durable moat',
        'free cash flow quality',
        'high return on equity',
        'low debt discipline',
        'margin of safety',
      ]));
      expect(result.mission_brief.success_criteria.some((item) => item.includes('Reflect owner-derived criterion'))).toBe(true);
      expect(result.mission_brief.execution_plan.some((step) => step.includes('Infer owner-specific criteria from memory'))).toBe(true);
      expect(worker.requests[0]?.prompt).toContain('Manager derivation: archetype=value_investor');
      expect(worker.requests[0]?.shell_command).toBeNull();
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.artifacts.some((artifact) => artifact.uri.startsWith('input-adapter://'))).toBe(true);
      expect(brain.calls.consult).toHaveLength(2);
    } finally {
      await runtime.dispose();
    }
  });

  test('actual manager-led stock mission still proceeds when persona derivation is thin but memory is grounded', async () => {
    const brain = new FakeBrainAdapter({
      consultResponse: makeConsultResponse({
        citations: [
          {
            memory_id: 'mem_owner_preferences',
            title: 'Preferred report format',
            memory_type: 'Preferences',
            memory_scope: 'owner',
            memory_layer: 'principle',
            memory_subtype: 'preference.report_format',
            summary: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
            source: 'onboarding',
            verified_by: 'user',
            evidence_ref: [{ type: 'note', ref: 'onboarding://report-format' }],
            entity_keys: ['preferred_report_format'],
            entity_aliases: ['report format'],
          },
        ],
        followup_actions: [
          'Keep the final answer owner-facing and grounded in memory.',
        ],
        trace_id: 'trace_actual_stock_manager_thin',
      }),
      contextResponse: makeContextBundle({
        preferred_format: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
        planning_hints: [
          'Recall the owner memory that exists, then continue without hidden human steps.',
        ],
      }),
    });
    const worker = new FakeWorkerAdapter('claude', {
      summary: 'Produced a grounded owner-facing Thai stock scanner system plan from the available memory.',
      status: 'success',
      artifacts: [{
        type: 'note',
        ref: 'worker://claude/stock-scanner-plan-thin',
        description: 'Owner-facing stock-scanner system plan from thin persona memory.',
      }],
      proposed_checks: [],
      raw_output: 'Owner-facing grounded stock scanner system plan.',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { claude: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'I want a Thai stock scanner system that matches how I invest.',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('mission');
      expect(result.decision.blocked_reason).toBeNull();
      expect(result.mission_brief_validation.is_complete).toBe(true);
      expect(result.mission_brief.manager_derivation).not.toBeNull();
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(worker.requests).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  });

  test('ambiguous execution goals are blocked before worker dispatch and ask for clarification', async () => {
    const brain = new FakeBrainAdapter();
    const worker = new FakeWorkerAdapter('codex', {
      summary: 'Should not run.',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://codex/should-not-run' }],
      proposed_checks: [{ name: 'should-not-run', passed: true }],
      raw_output: '{}',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { codex: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'Fix it',
        output_mode: 'json',
      });

      expect(result.goal_ambiguity.is_ambiguous).toBe(true);
      expect(result.decision.should_execute).toBe(false);
      expect(result.decision.blocked_reason).toContain('ambiguous');
      expect(result.runtime_bundle?.session.status).toBe('aborted');
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'runtime_session_finalized')).toBe(true);
      expect(result.worker_result).toBeNull();
      expect(result.brain_writes).toHaveLength(0);
      expect(worker.requests).toHaveLength(0);
    } finally {
      await runtime.dispose();
    }
  });

  test('success flow saves outcome, starts verification, and completes with proof', async () => {
    const brain = new FakeBrainAdapter();
    const worker = new FakeWorkerAdapter('codex', {
      summary: 'Implemented the requested manager path.',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://codex/success', description: 'Structured worker result.' }],
      proposed_checks: [{ name: 'worker-produced-proof', passed: true }],
      raw_output: '{}',
    });
    const verifier = new FakeVerifierAdapter({
      mission_id: 'mission_fixed',
      summary: 'Verifier accepted the worker result.',
      evidence: [{ type: 'note', ref: 'worker://codex/success', description: 'Structured worker result.' }],
      verification_checks: [{ name: 'worker-produced-proof', passed: true }],
      status: 'verified_complete',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { codex: worker },
      verifier,
    });

    try {
      const result = await runtime.run({
        goal: 'Implement a manager runtime for this repo.',
        mission_id: 'mission_fixed',
        output_mode: 'json',
      });

      expect(result.decision.kind).toBe('mission');
      expect(result.worker_result?.status).toBe('success');
      expect(result.verification_result?.status).toBe('verified_complete');
      expect(result.brain_writes.map((entry) => entry.action)).toEqual([
        'save_outcome',
        'start_verification',
        'complete_verification',
      ]);
      expect(brain.calls.saveOutcome[0]?.domain).toBe('best-brain');
      expect(brain.calls.completeVerification[0]?.status).toBe('verified_complete');
      expect(worker.requests).toHaveLength(1);
      expect(worker.requests[0]?.task_id).toBe('primary_work');
      expect(worker.requests[0]?.playbook_id).toBe(result.mission_brief.playbook.id);
      expect(worker.requests[0]?.context_citations).toHaveLength(result.mission_brief.brain_citations.length);
      expect(result.runtime_bundle?.session.status).toBe('completed');
      expect(result.runtime_bundle?.session.mission_definition_id).toBe(result.mission_brief.mission_definition_id);
      expect(result.runtime_bundle?.session.report_contract_id).toBe(result.mission_brief.report_contract_id);
      expect(result.runtime_bundle?.session.final_report_artifact_id).not.toBeNull();
      expect(result.runtime_bundle?.processes).toHaveLength(1);
      expect(result.runtime_bundle?.worker_tasks).toHaveLength(2);
      expect(result.runtime_bundle?.checkpoints).toHaveLength(2);
      expect(result.runtime_bundle?.artifacts.some((artifact) => artifact.kind === 'stdout')).toBe(true);
      expect(result.runtime_bundle?.artifacts.some((artifact) => artifact.uri.startsWith('report://'))).toBe(true);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'worker_dispatched')).toBe(true);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'final_report_emitted')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'codex' && task.status === 'success')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'success')).toBe(true);
      expect(result.mission_graph.nodes.find((node) => node.id === 'primary_work')?.status).toBe('completed');
      expect(result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status).toBe('completed');
      expect(result.mission_graph.nodes.find((node) => node.id === 'final_report')?.status).toBe('completed');
    } finally {
      await runtime.dispose();
    }
  });

  test('failed verification writes a failure lesson and keeps the mission retryable', async () => {
    const brain = new FakeBrainAdapter();
    const worker = new FakeWorkerAdapter('claude', {
      summary: 'The worker could not produce a passing proof chain.',
      status: 'needs_retry',
      artifacts: [{ type: 'note', ref: 'worker://claude/retry', description: 'Needs another pass.' }],
      proposed_checks: [{ name: 'proof-ready', passed: false, detail: 'Evidence was incomplete.' }],
      raw_output: '{}',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { claude: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'Plan and verify the follow-up mission.',
        worker_preference: 'claude',
        mission_id: 'mission_retryable',
        output_mode: 'json',
      });

      expect(result.worker_result?.status).toBe('needs_retry');
      expect(result.verification_result?.status).toBe('verification_failed');
      expect(result.retryable).toBe(true);
      expect(result.brain_writes.some((entry) => entry.action === 'save_failure')).toBe(true);
      expect(brain.calls.completeVerification[0]?.status).toBe('verification_failed');
      expect(brain.calls.saveFailure).toHaveLength(1);
      expect(result.runtime_bundle?.session.status).toBe('failed');
      expect(result.runtime_bundle?.session.final_report_artifact_id).not.toBeNull();
      expect(result.runtime_bundle?.worker_tasks).toHaveLength(2);
      expect(result.runtime_bundle?.checkpoints).toHaveLength(2);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'checkpoint_restored')).toBe(true);
      expect(result.runtime_bundle?.events.some((event) => event.event_type === 'final_report_emitted')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'claude' && task.status === 'needs_retry')).toBe(true);
      expect(result.runtime_bundle?.worker_tasks.some((task) => task.worker === 'verifier' && task.status === 'needs_retry')).toBe(true);
      expect(result.mission_graph.nodes.find((node) => node.id === 'verification_gate')?.status).toBe('failed');
    } finally {
      await runtime.dispose();
    }
  });

  test('playbook verifier checklist blocks implementation missions that lack required file evidence', async () => {
    const brain = new FakeBrainAdapter();
    const worker = new FakeWorkerAdapter('codex', {
      summary: 'Implemented the change but only returned a note.',
      status: 'success',
      artifacts: [{ type: 'note', ref: 'worker://codex/note-only', description: 'No file artifact was returned.' }],
      proposed_checks: [{ name: 'worker-produced-note', passed: true }],
      raw_output: '{}',
    });
    const runtime = new ManagerRuntime({
      brain,
      workers: { codex: worker },
    });

    try {
      const result = await runtime.run({
        goal: 'Implement a repo change for this project.',
        worker_preference: 'codex',
        mission_id: 'mission_playbook_file_required',
        output_mode: 'json',
      });

      expect(result.mission_brief.playbook.mission_kind).toBe('repo_change_mission');
      expect(result.verification_result?.status).toBe('verification_failed');
      expect(result.brain_writes.some((entry) => entry.action === 'save_failure')).toBe(true);
      expect(brain.calls.completeVerification[0]?.verification_checks.some((check) => check.name === 'Code or test artifact exists' && check.passed === false)).toBe(true);
    } finally {
      await runtime.dispose();
    }
  });
});

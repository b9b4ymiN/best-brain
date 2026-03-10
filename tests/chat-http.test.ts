import { describe, expect, test } from 'bun:test';
import { ChatService } from '../src/chat/service.ts';
import type { WorkerAdapter } from '../src/manager/adapters/types.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { ChatResponder } from '../src/manager/chat-responder.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import type { ExecutionRequest, WorkerExecutionResult } from '../src/manager/types.ts';
import { createApp } from '../src/http/app.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { runOnboarding } from '../src/services/onboarding.ts';
import { createTestBrain } from './helpers.ts';

const THAI_TODAY_QUESTION = '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e27\u0e31\u0e19\u0e2d\u0e30\u0e44\u0e23';
const THAI_MONDAY_FRAGMENT = '\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c';
const THAI_MONTH_QUESTION = '\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e44\u0e23';
const THAI_STOCK_SYSTEM_GOAL = '\u0e2d\u0e22\u0e32\u0e01\u0e44\u0e14\u0e49\u0e23\u0e30\u0e1a\u0e1a\u0e2a\u0e41\u0e01\u0e19\u0e2b\u0e38\u0e49\u0e19\u0e17\u0e35\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e1a\u0e41\u0e19\u0e27\u0e25\u0e07\u0e17\u0e38\u0e19\u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19';
const THAI_TODAY_PREFIX = '\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e04\u0e37\u0e2d';
const THAI_CLARIFY_PREFIX = '\u0e0a\u0e48\u0e27\u0e22\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21';
const THAI_MONTH_PREFIX = '\u0e40\u0e14\u0e37\u0e2d\u0e19\u0e19\u0e35\u0e49\u0e04\u0e37\u0e2d';

class StaticWorkerAdapter implements WorkerAdapter {
  readonly name: ExecutionRequest['selected_worker'];
  readonly result: WorkerExecutionResult;

  constructor(name: ExecutionRequest['selected_worker'], result: WorkerExecutionResult) {
    this.name = name;
    this.result = result;
  }

  async execute(_request: ExecutionRequest): Promise<WorkerExecutionResult> {
    return this.result;
  }
}

class StaticChatResponder implements ChatResponder {
  readonly answerText: string | null;

  constructor(answerText: string | null) {
    this.answerText = answerText;
  }

  async answer(): Promise<string | null> {
    return this.answerText;
  }
}

describe('chat HTTP', () => {
  test('answers a simple Thai chat question directly without escalating to a mission', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'chat-owner' });
    let server: ReturnType<typeof Bun.serve>;
    const managerFactory = () => new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      chatResponder: new StaticChatResponder('วันนี้คือ วันอังคาร 10 มีนาคม 2569'),
    });
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory,
    });
    const chat = new ChatService({
      managerFactory,
      controlRoom,
    });
    const app = createApp(brain, { chat, controlRoom });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;

      const pageResponse = await fetch(`${baseUrl}/`);
      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain('best-brain chat');

      const response = await fetch(`${baseUrl}/chat/api/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: THAI_TODAY_QUESTION,
        }),
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        decision_kind: string;
        answer: string;
        mission_id: string | null;
        control_room_path: string | null;
      };
      expect(payload.decision_kind).toBe('chat');
      expect(payload.answer).toContain(THAI_TODAY_PREFIX);
      expect(payload.answer).toContain('2569');
      expect(payload.mission_id).toBeNull();
      expect(payload.control_room_path).toBeNull();
    } finally {
      server.stop(true);
      cleanup();
    }
  });

  test('asks for clarification on short Thai chat fragments instead of dumping memory retrieval', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'chat-owner' });
    let server: ReturnType<typeof Bun.serve>;
    const managerFactory = () => new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
    });
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory,
    });
    const chat = new ChatService({
      managerFactory,
      controlRoom,
    });
    const app = createApp(brain, { chat, controlRoom });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const response = await fetch(`${baseUrl}/chat/api/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: THAI_MONDAY_FRAGMENT,
        }),
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        decision_kind: string;
        answer: string;
        mission_id: string | null;
      };
      expect(payload.decision_kind).toBe('chat');
      expect(payload.answer).toContain(THAI_CLARIFY_PREFIX);
      expect(payload.answer).not.toContain('[MissionMemory]');
      expect(payload.mission_id).toBeNull();
    } finally {
      server.stop(true);
      cleanup();
    }
  });

  test('answers a simple Thai month question directly', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'chat-owner' });
    let server: ReturnType<typeof Bun.serve>;
    const managerFactory = () => new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      chatResponder: new StaticChatResponder('เดือนนี้คือ มีนาคม 2569'),
    });
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory,
    });
    const chat = new ChatService({
      managerFactory,
      controlRoom,
    });
    const app = createApp(brain, { chat, controlRoom });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const response = await fetch(`${baseUrl}/chat/api/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: THAI_MONTH_QUESTION,
        }),
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        decision_kind: string;
        answer: string;
        mission_id: string | null;
      };
      expect(payload.decision_kind).toBe('chat');
      expect(payload.answer).toContain(THAI_MONTH_PREFIX);
      expect(payload.answer).toContain('\u0e21\u0e35\u0e19\u0e32\u0e04\u0e21');
      expect(payload.mission_id).toBeNull();
    } finally {
      server.stop(true);
      cleanup();
    }
  });

  test('escalates a stock-scanner goal from chat into a persisted mission automatically', async () => {
    const { brain, cleanup } = await createTestBrain({ seedDefaults: true, owner: 'chat-owner' });
    await runOnboarding(brain, {
      ownerPersona: 'The owner is a Thai-equities VI investor who prefers moat, earnings consistency, free cash flow, high ROE, low debt, and margin of safety.',
      preferredReportFormat: 'Objective, owner profile, screening criteria, system plan, evidence, risks, next action.',
      communicationStyle: 'Direct and factual.',
      qualityBar: 'Only complete the mission when the final owner-facing plan is grounded in memory and verification passes.',
      planningPlaybook: 'Recall the owner persona first, derive the screening criteria, choose the data source, prepare the scanner system plan, then verify.',
    });

    let server: ReturnType<typeof Bun.serve>;
    const managerFactory = () => new ManagerRuntime({
      brain: new BrainHttpAdapter({
        baseUrl: `http://127.0.0.1:${server.port}`,
        autoStart: false,
      }),
      workers: {
        claude: new StaticWorkerAdapter('claude', {
          summary: 'Produced a verified owner-facing Thai stock scanner system plan.',
          status: 'success',
          artifacts: [
            { type: 'note', ref: 'worker://chat-http/stock-plan', description: 'VI-aligned stock-scanner system plan.' },
          ],
          proposed_checks: [{
            name: 'owner-plan-complete',
            passed: true,
            detail: 'The owner-facing stock scanner system plan is complete.',
          }],
          raw_output: 'owner-facing-stock-plan',
          invocation: null,
          process_output: null,
        }),
      },
    });
    const controlRoom = new ControlRoomService({
      dataDir: brain.config.dataDir,
      managerFactory,
    });
    const chat = new ChatService({
      managerFactory,
      controlRoom,
    });
    const app = createApp(brain, { chat, controlRoom });
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: app.fetch,
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;
      const response = await fetch(`${baseUrl}/chat/api/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: THAI_STOCK_SYSTEM_GOAL,
        }),
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as {
        decision_kind: string;
        mission_id: string | null;
        mission_status: string | null;
        control_room_path: string | null;
        answer: string;
      };
      expect(payload.decision_kind).toBe('mission');
      expect(payload.mission_id).not.toBeNull();
      expect(payload.mission_status).toBe('verified_complete');
      expect(payload.control_room_path).toContain('/control-room?mission_id=');
      expect(payload.answer).toContain('Produced a verified owner-facing Thai stock scanner system plan.');

      const missionId = payload.mission_id as string;
      const detailResponse = await fetch(`${baseUrl}/control-room/api/missions/${missionId}`);
      expect(detailResponse.status).toBe(200);
    } finally {
      server.stop(true);
      cleanup();
    }
  });
});

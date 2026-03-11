import { Hono } from 'hono';
import { renderChatPage } from '../chat/page.ts';
import type { ChatService } from '../chat/service.ts';
import type { ChatMessageRequest } from '../chat/types.ts';
import type { BestBrain } from '../services/brain.ts';
import { renderControlRoomPage } from '../control-room/page.ts';
import type { ControlRoomService } from '../control-room/service.ts';
import {
  CONTROL_ROOM_ACTIONS,
  type ControlRoomActionRequest,
  type ControlRoomHistoryFilter,
  type ControlRoomLaunchRequest,
} from '../control-room/types.ts';
import {
  validateConsultRequest,
  validateContextInput,
  validateFailureInput,
  validateLearnRequestInput,
  validateMissionOutcomeInput,
  validateVerificationCompleteInput,
  validateVerificationStartInput,
} from '../validation.ts';

async function readJsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new Error('request body must be valid JSON');
  }
}

function validateControlRoomLaunchRequest(input: unknown): ControlRoomLaunchRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('control-room launch request must be an object');
  }
  const payload = input as Record<string, unknown>;

  const goal = typeof payload.goal === 'string' ? payload.goal.trim() : '';
  if (!goal) {
    throw new Error('control-room goal is required');
  }

  return {
    goal,
    dry_run: payload.dry_run === true,
    no_execute: payload.no_execute === true,
  };
}

function validateControlRoomActionRequest(input: unknown): ControlRoomActionRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('control-room action request must be an object');
  }
  const payload = input as Record<string, unknown>;
  const action = typeof payload.action === 'string' ? payload.action : '';
  if (!CONTROL_ROOM_ACTIONS.includes(action as (typeof CONTROL_ROOM_ACTIONS)[number])) {
    throw new Error('control-room action is invalid');
  }
  return {
    action: action as ControlRoomActionRequest['action'],
    note: typeof payload.note === 'string' ? payload.note.trim() : undefined,
  };
}

function validateControlRoomHistoryFilter(input: Record<string, string | undefined>): ControlRoomHistoryFilter {
  const status = input.status?.trim() || 'all';
  const missionKind = input.mission_kind?.trim() || 'all';
  const dateFrom = input.date_from?.trim() || null;
  const dateTo = input.date_to?.trim() || null;

  return {
    status: status as ControlRoomHistoryFilter['status'],
    mission_kind: missionKind,
    date_from: dateFrom,
    date_to: dateTo,
  };
}

function validateChatMessageRequest(input: unknown): ChatMessageRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('chat request must be an object');
  }
  const payload = input as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    throw new Error('chat message is required');
  }

  return {
    message,
  };
}

export interface AppServices {
  chat?: ChatService | null;
  controlRoom?: ControlRoomService | null;
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export function createApp(brain: BestBrain, services: AppServices = {}): Hono {
  const app = new Hono();

  if (services.chat) {
    app.get('/', (c) => c.html(renderChatPage(), 200, NO_STORE_HEADERS));
    app.get('/chat', (c) => c.html(renderChatPage(), 200, NO_STORE_HEADERS));
    app.post('/chat/api/message/run', async (c) => {
      const body = validateChatMessageRequest(await readJsonBody(c));
      return c.json(services.chat!.startMessageRun(body), 200, NO_STORE_HEADERS);
    });
    app.get('/chat/api/runs/:id', (c) => {
      const snapshot = services.chat!.getRunSnapshot(c.req.param('id'));
      if (!snapshot) {
        return c.json({ error: 'chat run not found' }, 404, NO_STORE_HEADERS);
      }
      return c.json(snapshot, 200, NO_STORE_HEADERS);
    });
    app.post('/chat/api/message', async (c) => {
      const body = validateChatMessageRequest(await readJsonBody(c));
      return c.json(await services.chat!.sendMessage(body), 200, NO_STORE_HEADERS);
    });
    app.post('/chat/api/message/stream', async (c) => {
      const body = validateChatMessageRequest(await readJsonBody(c));
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          const safeEnqueue = (payload: unknown): void => {
            if (closed) {
              return;
            }
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          try {
            await services.chat!.streamMessage(body, async (event) => {
              safeEnqueue(event);
            });
          } catch (error) {
            safeEnqueue({
              type: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            closed = true;
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          'Content-Type': 'application/x-ndjson; charset=utf-8',
        },
      });
    });
  }

  app.get('/health', (c) => c.json(brain.health()));

  app.post('/brain/consult', async (c) => {
    const body = validateConsultRequest(await readJsonBody(c));
    return c.json(await brain.consult(body));
  });

  app.post('/brain/learn', async (c) => {
    const body = validateLearnRequestInput(await readJsonBody(c));
    return c.json(await brain.learn(body));
  });

  app.get('/brain/context', async (c) => {
    const params = validateContextInput({
      mission_id: c.req.query('mission_id'),
      domain: c.req.query('domain'),
      query: c.req.query('query'),
    });
    return c.json(await brain.getContext(params));
  });

  app.get('/brain/memory-quality', (c) => c.json(brain.getMemoryQualityMetrics()));

  app.post('/missions/:id/outcome', async (c) => {
    const body = validateMissionOutcomeInput(await readJsonBody(c), c.req.param('id'));
    return c.json(await brain.saveMissionOutcome(body));
  });

  app.post('/failures', async (c) => {
    const body = validateFailureInput(await readJsonBody(c));
    return c.json(await brain.saveFailure(body));
  });

  app.post('/verification/start', async (c) => {
    const body = validateVerificationStartInput(await readJsonBody(c));
    return c.json(await brain.startVerification(body));
  });

  app.post('/verification/complete', async (c) => {
    const body = validateVerificationCompleteInput(await readJsonBody(c));
    return c.json(await brain.completeVerification(body));
  });

  app.get('/preferences/format', (c) => c.json({ format: brain.getPreferredFormat() }));

  if (services.controlRoom) {
    app.get('/control-room', (c) => c.html(renderControlRoomPage()));
    app.get('/control-room/api/overview', (c) => c.json(services.controlRoom!.listDashboard()));
    app.get('/control-room/api/history', (c) => {
      const filters = validateControlRoomHistoryFilter({
        status: c.req.query('status'),
        mission_kind: c.req.query('mission_kind'),
        date_from: c.req.query('date_from'),
        date_to: c.req.query('date_to'),
      });
      return c.json(services.controlRoom!.listHistory(filters));
    });
    app.post('/control-room/api/launch', async (c) => {
      const body = validateControlRoomLaunchRequest(await readJsonBody(c));
      return c.json(await services.controlRoom!.launchMission(body));
    });
    app.get('/control-room/api/missions/:id', (c) => {
      const view = services.controlRoom!.getMissionView(c.req.param('id'));
      if (!view) {
        return c.json({ error: 'control-room mission not found' }, 404);
      }
      return c.json(view);
    });
    app.post('/control-room/api/missions/:id/actions', async (c) => {
      const body = validateControlRoomActionRequest(await readJsonBody(c));
      return c.json(await services.controlRoom!.runAction(c.req.param('id'), body));
    });
  }

  app.onError((error, c) => c.json({ error: error.message }, 400));

  return app;
}

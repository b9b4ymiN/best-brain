import { Hono } from 'hono';
import type { BestBrain } from '../services/brain.ts';
import { renderControlRoomPage } from '../control-room/page.ts';
import type { ControlRoomService } from '../control-room/service.ts';
import {
  CONTROL_ROOM_ACTIONS,
  CONTROL_ROOM_MODES,
  type ControlRoomActionRequest,
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

  const mode = typeof payload.mode === 'string' && CONTROL_ROOM_MODES.includes(payload.mode as (typeof CONTROL_ROOM_MODES)[number])
    ? payload.mode as ControlRoomLaunchRequest['mode']
    : 'auto';
  const workerPreference = typeof payload.worker_preference === 'string'
    ? payload.worker_preference
    : 'auto';
  if (!['auto', 'claude', 'codex', 'shell', 'browser', 'mail', 'verifier'].includes(workerPreference)) {
    throw new Error('control-room worker_preference is invalid');
  }

  return {
    goal,
    mode,
    worker_preference: workerPreference as ControlRoomLaunchRequest['worker_preference'],
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

export interface AppServices {
  controlRoom?: ControlRoomService | null;
}

export function createApp(brain: BestBrain, services: AppServices = {}): Hono {
  const app = new Hono();

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

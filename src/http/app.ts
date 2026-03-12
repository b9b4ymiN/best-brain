import { Hono } from 'hono';
import { renderChatPage } from '../chat/page.ts';
import type { ChatService } from '../chat/service.ts';
import type { ChatMessageRequest } from '../chat/types.ts';
import { MANAGER_WORKER_PREFERENCES } from '../manager/types.ts';
import type { BestBrain } from '../services/brain.ts';
import { renderControlRoomPage } from '../control-room/page.ts';
import type { ControlRoomService } from '../control-room/service.ts';
import type { MissionScheduler } from '../runtime/scheduler.ts';
import type { AutonomousTaskQueue } from '../runtime/task-queue.ts';
import {
  CONTROL_ROOM_ACTIONS,
  type ControlRoomAutonomyPolicyUpdateRequest,
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
import type { ScheduleCadence, ScheduleWorkerPreference } from '../runtime/types.ts';

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
  const workerPreferenceRaw = typeof payload.worker_preference === 'string'
    ? payload.worker_preference.trim()
    : '';
  if (workerPreferenceRaw && !MANAGER_WORKER_PREFERENCES.includes(workerPreferenceRaw as typeof MANAGER_WORKER_PREFERENCES[number])) {
    throw new Error('control-room worker_preference is invalid');
  }

  return {
    goal,
    dry_run: payload.dry_run === true,
    no_execute: payload.no_execute === true,
    worker_preference: workerPreferenceRaw
      ? workerPreferenceRaw as ControlRoomLaunchRequest['worker_preference']
      : undefined,
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

function validateControlRoomAutonomyPolicyUpdateRequest(input: unknown): ControlRoomAutonomyPolicyUpdateRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('control-room autonomy policy request must be an object');
  }
  const payload = input as Record<string, unknown>;
  const update: ControlRoomAutonomyPolicyUpdateRequest = {};

  if (payload.default_level != null) {
    if (
      payload.default_level !== 'supervised'
      && payload.default_level !== 'semi_autonomous'
      && payload.default_level !== 'autonomous'
    ) {
      throw new Error('control-room autonomy default_level is invalid');
    }
    update.default_level = payload.default_level;
  }

  if (payload.routine_min_verified_runs != null) {
    const value = Number(payload.routine_min_verified_runs);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('control-room autonomy routine_min_verified_runs must be >= 0');
    }
    update.routine_min_verified_runs = Math.floor(value);
  }

  if (payload.mission_kind_levels != null) {
    if (typeof payload.mission_kind_levels !== 'object' || Array.isArray(payload.mission_kind_levels)) {
      throw new Error('control-room autonomy mission_kind_levels must be an object');
    }
    const entries = Object.entries(payload.mission_kind_levels as Record<string, unknown>);
    const normalized: Record<string, 'supervised' | 'semi_autonomous' | 'autonomous'> = {};
    for (const [missionKind, rawLevel] of entries) {
      const key = missionKind.trim();
      if (!key) {
        continue;
      }
      if (rawLevel !== 'supervised' && rawLevel !== 'semi_autonomous' && rawLevel !== 'autonomous') {
        throw new Error(`control-room autonomy level is invalid for mission kind ${key}`);
      }
      normalized[key] = rawLevel;
    }
    update.mission_kind_levels = normalized;
  }

  if (
    update.default_level == null
    && update.routine_min_verified_runs == null
    && update.mission_kind_levels == null
  ) {
    throw new Error('control-room autonomy update must include at least one field');
  }

  return update;
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

function validateScheduleCadence(input: unknown): ScheduleCadence {
  if (!input || typeof input !== 'object') {
    throw new Error('scheduler cadence must be an object');
  }
  const payload = input as Record<string, unknown>;
  const kind = typeof payload.kind === 'string' ? payload.kind.trim() : '';
  if (kind === 'daily') {
    const time = typeof payload.time_hhmm === 'string' ? payload.time_hhmm.trim() : '';
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(time)) {
      throw new Error('scheduler daily cadence requires time_hhmm in HH:mm format');
    }
    const timezone = typeof payload.timezone === 'string' && payload.timezone.trim().length > 0
      ? payload.timezone.trim()
      : 'local';
    return {
      kind: 'daily',
      time_hhmm: time,
      timezone,
    };
  }
  if (kind === 'interval') {
    const everyMinutes = Number(payload.every_minutes);
    if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) {
      throw new Error('scheduler interval cadence requires every_minutes > 0');
    }
    return {
      kind: 'interval',
      every_minutes: Math.floor(everyMinutes),
    };
  }
  throw new Error('scheduler cadence kind is invalid');
}

function validateSchedulerCreateRequest(input: unknown): {
  name: string;
  goal: string;
  cadence: ScheduleCadence;
  worker_preference?: ScheduleWorkerPreference;
  start_immediately?: boolean;
} {
  if (!input || typeof input !== 'object') {
    throw new Error('scheduler create request must be an object');
  }
  const payload = input as Record<string, unknown>;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const goal = typeof payload.goal === 'string' ? payload.goal.trim() : '';
  if (!name) {
    throw new Error('scheduler name is required');
  }
  if (!goal) {
    throw new Error('scheduler goal is required');
  }
  const workerPreferenceRaw = typeof payload.worker_preference === 'string'
    ? payload.worker_preference.trim()
    : '';
  if (workerPreferenceRaw && !MANAGER_WORKER_PREFERENCES.includes(workerPreferenceRaw as typeof MANAGER_WORKER_PREFERENCES[number])) {
    throw new Error('scheduler worker_preference is invalid');
  }

  return {
    name,
    goal,
    cadence: validateScheduleCadence(payload.cadence),
    worker_preference: workerPreferenceRaw
      ? workerPreferenceRaw as ScheduleWorkerPreference
      : undefined,
    start_immediately: payload.start_immediately === true,
  };
}

function validateTaskQueueEnqueueRequest(input: unknown): {
  parent_mission_id?: string | null;
  goal: string;
  priority: 'urgent' | 'scheduled' | 'background';
  source: string;
  worker_preference?: ScheduleWorkerPreference;
  queued_by?: string;
  max_attempts?: number;
} {
  if (!input || typeof input !== 'object') {
    throw new Error('task queue enqueue request must be an object');
  }
  const payload = input as Record<string, unknown>;
  const goal = typeof payload.goal === 'string' ? payload.goal.trim() : '';
  if (!goal) {
    throw new Error('task queue goal is required');
  }
  const priorityRaw = typeof payload.priority === 'string' ? payload.priority.trim() : 'background';
  if (!['urgent', 'scheduled', 'background'].includes(priorityRaw)) {
    throw new Error('task queue priority is invalid');
  }
  const source = typeof payload.source === 'string' && payload.source.trim().length > 0
    ? payload.source.trim()
    : 'manual_enqueue';
  const workerPreferenceRaw = typeof payload.worker_preference === 'string'
    ? payload.worker_preference.trim()
    : '';
  if (workerPreferenceRaw && !MANAGER_WORKER_PREFERENCES.includes(workerPreferenceRaw as typeof MANAGER_WORKER_PREFERENCES[number])) {
    throw new Error('task queue worker_preference is invalid');
  }
  const maxAttempts = payload.max_attempts == null ? undefined : Number(payload.max_attempts);
  if (maxAttempts != null && (!Number.isFinite(maxAttempts) || maxAttempts <= 0)) {
    throw new Error('task queue max_attempts must be > 0');
  }

  return {
    parent_mission_id: typeof payload.parent_mission_id === 'string' && payload.parent_mission_id.trim().length > 0
      ? payload.parent_mission_id.trim()
      : null,
    goal,
    priority: priorityRaw as 'urgent' | 'scheduled' | 'background',
    source,
    worker_preference: workerPreferenceRaw
      ? workerPreferenceRaw as ScheduleWorkerPreference
      : undefined,
    queued_by: typeof payload.queued_by === 'string' && payload.queued_by.trim().length > 0
      ? payload.queued_by.trim()
      : undefined,
    max_attempts: maxAttempts == null ? undefined : Math.floor(maxAttempts),
  };
}

export interface AppServices {
  chat?: ChatService | null;
  controlRoom?: ControlRoomService | null;
  scheduler?: MissionScheduler | null;
  taskQueue?: AutonomousTaskQueue | null;
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
    app.get('/control-room/api/system-health', (c) => {
      const overview = services.controlRoom!.listDashboard();
      return c.json({
        system_health: overview.system_health,
        recent_alerts: overview.recent_alerts,
      });
    });
    app.get('/control-room/api/autonomy-policy', (c) => c.json({
      policy: services.controlRoom!.getAutonomyPolicy(),
    }));
    app.post('/control-room/api/autonomy-policy', async (c) => {
      const body = validateControlRoomAutonomyPolicyUpdateRequest(await readJsonBody(c));
      return c.json({
        policy: services.controlRoom!.updateAutonomyPolicy(body),
      });
    });
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

  if (services.scheduler) {
    app.get('/operator/schedules', (c) => c.json({
      schedules: services.scheduler!.listSchedules(),
    }, 200, NO_STORE_HEADERS));
    app.post('/operator/schedules', async (c) => {
      const body = validateSchedulerCreateRequest(await readJsonBody(c));
      return c.json({
        schedule: services.scheduler!.createSchedule(body),
      }, 200, NO_STORE_HEADERS);
    });
    app.post('/operator/schedules/:id/pause', (c) => c.json({
      schedule: services.scheduler!.pauseSchedule(c.req.param('id')),
    }, 200, NO_STORE_HEADERS));
    app.post('/operator/schedules/:id/resume', (c) => c.json({
      schedule: services.scheduler!.resumeSchedule(c.req.param('id')),
    }, 200, NO_STORE_HEADERS));
    app.post('/operator/schedules/:id/run-now', async (c) => c.json({
      run: await services.scheduler!.runNow(c.req.param('id')),
    }, 200, NO_STORE_HEADERS));
    app.post('/operator/scheduler/tick', async (c) => {
      const payload = await readJsonBody(c);
      const limitRaw = payload && typeof payload === 'object'
        ? Number((payload as Record<string, unknown>).limit ?? 3)
        : 3;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 3;
      return c.json({
        report: await services.scheduler!.tick(limit),
      }, 200, NO_STORE_HEADERS);
    });
  }

  if (services.taskQueue) {
    app.get('/operator/queue', (c) => c.json({
      items: services.taskQueue!.listItems(),
    }, 200, NO_STORE_HEADERS));
    app.post('/operator/queue/enqueue', async (c) => {
      const body = validateTaskQueueEnqueueRequest(await readJsonBody(c));
      return c.json({
        item: services.taskQueue!.enqueue(body),
      }, 200, NO_STORE_HEADERS);
    });
    app.post('/operator/queue/tick', async (c) => {
      const payload = await readJsonBody(c);
      const limitRaw = payload && typeof payload === 'object'
        ? Number((payload as Record<string, unknown>).limit ?? 3)
        : 3;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 3;
      return c.json({
        report: await services.taskQueue!.tick(limit),
      }, 200, NO_STORE_HEADERS);
    });
    app.post('/operator/queue/:id/cancel', async (c) => {
      const payload = await readJsonBody(c);
      const reason = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).reason === 'string'
        ? ((payload as Record<string, unknown>).reason as string).trim()
        : null;
      return c.json({
        item: services.taskQueue!.cancel(c.req.param('id'), reason),
      }, 200, NO_STORE_HEADERS);
    });
  }

  app.onError((error, c) => c.json({ error: error.message }, 400));

  return app;
}

import { Hono } from 'hono';
import type { BestBrain } from '../services/brain.ts';
import type {
  ConsultRequest,
  FailureInput,
  LearnRequest,
  MissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from '../types.ts';

export function createApp(brain: BestBrain): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json(brain.health()));

  app.post('/brain/consult', async (c) => {
    const body = await c.req.json<ConsultRequest>();
    return c.json(await brain.consult(body));
  });

  app.post('/brain/learn', async (c) => {
    const body = await c.req.json<LearnRequest>();
    return c.json(await brain.learn(body));
  });

  app.get('/brain/context', async (c) => {
    return c.json(await brain.getContext({
      mission_id: c.req.query('mission_id'),
      domain: c.req.query('domain'),
      query: c.req.query('query'),
    }));
  });

  app.post('/missions/:id/outcome', async (c) => {
    const body = await c.req.json<Omit<MissionOutcomeInput, 'mission_id'>>();
    return c.json(await brain.saveMissionOutcome({
      ...body,
      mission_id: c.req.param('id'),
    }));
  });

  app.post('/failures', async (c) => {
    const body = await c.req.json<FailureInput>();
    return c.json(await brain.saveFailure(body));
  });

  app.post('/verification/start', async (c) => {
    const body = await c.req.json<VerificationStartInput>();
    return c.json(await brain.startVerification(body));
  });

  app.post('/verification/complete', async (c) => {
    const body = await c.req.json<VerificationCompleteInput>();
    return c.json(await brain.completeVerification(body));
  });

  app.get('/preferences/format', (c) => c.json({ format: brain.getPreferredFormat() }));

  app.onError((error, c) => c.json({ error: error.message }, 400));

  return app;
}

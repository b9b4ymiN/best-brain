import { Hono } from 'hono';
import type { BestBrain } from '../services/brain.ts';
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

export function createApp(brain: BestBrain): Hono {
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

  app.onError((error, c) => c.json({ error: error.message }, 400));

  return app;
}

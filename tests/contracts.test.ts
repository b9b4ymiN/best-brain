import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { CONTRACT_SEMANTICS, HTTP_V1_ENDPOINTS, MCP_V1_TOOLS } from '../src/contracts.ts';
import { createTestBrain } from './helpers.ts';

describe('transport contracts', () => {
  test('freezes expected endpoint and tool names', () => {
    expect(HTTP_V1_ENDPOINTS).toEqual([
      '/health',
      '/brain/consult',
      '/brain/learn',
      '/brain/context',
      '/missions/:id/outcome',
      '/failures',
      '/verification/start',
      '/verification/complete',
      '/preferences/format',
    ]);
    expect(MCP_V1_TOOLS).toEqual([
      'brain_consult',
      'brain_learn',
      'brain_context',
      'brain_save_outcome',
      'brain_save_failure',
      'brain_verify',
    ]);
  });

  test('learn policy rejection remains a 200 response with accepted=false', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const app = createApp(brain);
      const response = await app.request('/brain/learn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'persona',
          title: 'Unauthorized persona change',
          content: 'This must stay a policy rejection.',
        }),
      });

      expect(response.status).toBe(CONTRACT_SEMANTICS.learnPolicyRejectStatusCode);
      const payload = await response.json() as { accepted: boolean; action: string };
      expect(payload.accepted).toBe(false);
      expect(payload.action).toBe('rejected');
    } finally {
      cleanup();
    }
  });

  test('malformed input returns a 400 error payload', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const app = createApp(brain);
      const response = await app.request('/brain/consult', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(CONTRACT_SEMANTICS.malformedRequestStatusCode);
      expect(await response.json()).toEqual({ error: 'query is required' });
    } finally {
      cleanup();
    }
  });

  test('invalid verification transition returns a 400 error payload', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const app = createApp(brain);
      const response = await app.request('/verification/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mission_id: 'missing-mission' }),
      });

      expect(response.status).toBe(CONTRACT_SEMANTICS.invalidTransitionStatusCode);
      expect(await response.json()).toEqual({ error: 'Mission not found: missing-mission' });
    } finally {
      cleanup();
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/http/app.ts';
import { CONTRACT_SEMANTICS, HTTP_V1_ENDPOINTS, MCP_V1_TOOLS } from '../src/contracts.ts';
import { validateMissionOutcomeStrictInput } from '../src/validation.ts';
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

  test('consult responses include first-class citations for manager callers', async () => {
    const { brain, cleanup } = await createTestBrain();

    try {
      const app = createApp(brain);
      const response = await app.request('/brain/consult', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'What report format does the owner prefer?' }),
      });

      expect(response.status).toBe(200);
      const payload = await response.json() as {
        memory_ids: string[];
        citations: Array<{ memory_id: string; title: string; source: string }>;
        trace_id: string;
      };
      expect(payload.citations.length).toBe(payload.memory_ids.length);
      expect(payload.citations.every((citation) => citation.title.length > 0 && citation.source.length > 0)).toBe(true);
      expect(payload.trace_id.startsWith('trace_')).toBe(true);
    } finally {
      cleanup();
    }
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

  test('strict mission outcome profile stays additive-only and enforces manager-facing proof fields', () => {
    const payload = validateMissionOutcomeStrictInput({
      mission_id: 'manager-mission',
      objective: 'Write strict manager example',
      result_summary: 'Strict validation passes with explicit fields.',
      evidence: [{ type: 'note', ref: 'proof://manager' }],
      verification_checks: [{ name: 'proof', passed: true }],
      status: 'in_progress',
      domain: 'best-brain',
    });

    expect(payload.status).toBe('in_progress');
    expect(payload.domain).toBe('best-brain');
    expect(() => validateMissionOutcomeStrictInput({
      mission_id: 'manager-mission',
      objective: 'Invalid strict example',
      result_summary: 'Missing proof details',
      evidence: [],
      verification_checks: [{ name: 'proof', passed: true }],
      status: 'in_progress',
      domain: 'best-brain',
    })).toThrow('strict mission outcome requires at least one evidence artifact');
    expect(() => validateMissionOutcomeStrictInput({
      mission_id: 'manager-mission',
      objective: 'Duplicate check names',
      result_summary: 'Duplicate checks should fail strict validation.',
      evidence: [{ type: 'note', ref: 'proof://manager' }],
      verification_checks: [
        { name: 'proof', passed: true },
        { name: 'proof', passed: true },
      ],
      status: 'awaiting_verification',
      domain: 'best-brain',
    })).toThrow('verification check names must be unique');
  });
});

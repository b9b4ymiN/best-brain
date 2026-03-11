import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, test } from 'bun:test';
import { runBrowserWorkerTask } from '../src/workers/browser.ts';
import { runMailWorkerTask } from '../src/workers/mail.ts';

const TEMP_ROOT = path.resolve(process.cwd(), 'artifacts', 'test-browser-mail');

afterEach(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe('browser worker', () => {
  test('fetches a page, writes a snapshot artifact, and emits checks', async () => {
    const result = await runBrowserWorkerTask({
      mission_id: 'mission_browser_test',
      task_id: 'primary_work',
      prompt: 'Goal: Open https://example.com and summarize the page.',
      cwd: TEMP_ROOT,
      fetch_impl: async () => new Response(
        '<html><head><title>Example Domain</title></head><body><main>Hello browser worker.</main></body></html>',
        { status: 200 },
      ),
    });

    expect(result.status).toBe('success');
    expect(result.checks.some((check) => check.name === 'browser-http-success' && check.passed)).toBe(true);
    const snapshotArtifact = result.artifacts.find((artifact) => artifact.type === 'file');
    expect(snapshotArtifact).toBeDefined();
    expect(snapshotArtifact?.ref.endsWith('.html')).toBe(true);
    expect(fs.existsSync(snapshotArtifact!.ref)).toBe(true);
  });
});

describe('mail worker', () => {
  test('creates a draft artifact in draft-only mode', async () => {
    const result = await runMailWorkerTask({
      mission_id: 'mission_mail_test',
      task_id: 'primary_work',
      prompt: 'Goal: Draft email to owner@example.local subject: Daily update body: Scanner completed.',
      cwd: TEMP_ROOT,
    });

    expect(result.status).toBe('success');
    const draftArtifact = result.artifacts.find((artifact) => artifact.type === 'file');
    expect(draftArtifact).toBeDefined();
    expect(draftArtifact?.ref.endsWith('.json')).toBe(true);
    expect(fs.existsSync(draftArtifact!.ref)).toBe(true);
    expect(result.checks.some((check) => check.name === 'mail-send-not-executed' && check.passed)).toBe(true);
  });

  test('blocks direct send requests by policy', async () => {
    const result = await runMailWorkerTask({
      mission_id: 'mission_mail_test_send',
      task_id: 'primary_work',
      prompt: 'Goal: Send an email to owner@example.local right now.',
      cwd: TEMP_ROOT,
    });

    expect(result.status).toBe('needs_retry');
    expect(result.checks.some((check) => check.name === 'mail-send-approved' && check.passed === false)).toBe(true);
  });
});

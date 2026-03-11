import fs from 'fs';
import path from 'path';
import type { VerificationArtifact, VerificationCheck } from '../types.ts';

export type BrowserFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface BrowserWorkerRunInput {
  mission_id: string;
  task_id: string;
  prompt: string;
  cwd: string;
  default_url?: string;
  timeout_ms?: number;
  allowed_domains?: string[];
  fetch_impl?: BrowserFetch;
  now?: () => number;
}

export interface BrowserWorkerRunResult {
  summary: string;
  status: 'success' | 'needs_retry' | 'failed';
  artifacts: VerificationArtifact[];
  checks: VerificationCheck[];
  raw_output: string;
  invocation: {
    command: string;
    args: string[];
    cwd: string;
    exit_code: number;
    timed_out: boolean;
    started_at: number;
    completed_at: number;
    transport: 'manager_owned';
  };
  process_output: {
    stdout: string;
    stderr: string;
  };
}

function extractGoalText(prompt: string): string {
  const goalLine = prompt
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('goal: '));
  if (goalLine) {
    return goalLine.replace(/^goal:\s*/i, '').trim();
  }
  return prompt;
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)\]}>"']+/i);
  if (!match?.[0]) {
    return null;
  }
  return match[0].replace(/[.,;:!?]+$/, '');
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

function toPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max = 280): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^\*\./, '');
}

function domainAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return true;
  }
  const normalizedHost = normalizeDomain(hostname);
  return allowedDomains.some((domain) => {
    const normalized = normalizeDomain(domain);
    return normalizedHost === normalized || normalizedHost.endsWith(`.${normalized}`);
  });
}

export async function runBrowserWorkerTask(input: BrowserWorkerRunInput): Promise<BrowserWorkerRunResult> {
  const now = input.now ?? (() => Date.now());
  const fetchImpl: BrowserFetch = input.fetch_impl ?? fetch;
  const startedAt = now();
  const goalText = extractGoalText(input.prompt);
  const fallbackUrl = input.default_url?.trim() || 'https://example.com/';
  const targetUrl = extractFirstUrl(goalText) ?? fallbackUrl;
  const allowedDomains = (input.allowed_domains ?? []).map(normalizeDomain).filter(Boolean);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    const completedAt = now();
    return {
      summary: `Browser worker could not parse a valid URL from the request: ${targetUrl}`,
      status: 'failed',
      artifacts: [{
        type: 'note',
        ref: `worker://browser/invalid-url/${input.mission_id}`,
        description: `Invalid URL: ${targetUrl}`,
      }],
      checks: [{
        name: 'browser-target-url-valid',
        passed: false,
        detail: `Invalid URL: ${targetUrl}`,
      }],
      raw_output: '',
      invocation: {
        command: 'fetch',
        args: [targetUrl],
        cwd: input.cwd,
        exit_code: 1,
        timed_out: false,
        started_at: startedAt,
        completed_at: completedAt,
        transport: 'manager_owned',
      },
      process_output: {
        stdout: '',
        stderr: `Invalid URL: ${targetUrl}`,
      },
    };
  }

  if (!domainAllowed(parsedUrl.hostname, allowedDomains)) {
    const completedAt = now();
    return {
      summary: `Browser worker blocked domain ${parsedUrl.hostname}; it is not in the allowed domain list.`,
      status: 'failed',
      artifacts: [{
        type: 'note',
        ref: `worker://browser/domain-blocked/${input.mission_id}`,
        description: `Blocked domain: ${parsedUrl.hostname}`,
      }],
      checks: [{
        name: 'browser-domain-allowed',
        passed: false,
        detail: `Blocked domain: ${parsedUrl.hostname}`,
      }],
      raw_output: '',
      invocation: {
        command: 'fetch',
        args: [parsedUrl.toString()],
        cwd: input.cwd,
        exit_code: 1,
        timed_out: false,
        started_at: startedAt,
        completed_at: completedAt,
        transport: 'manager_owned',
      },
      process_output: {
        stdout: '',
        stderr: `Domain blocked: ${parsedUrl.hostname}`,
      },
    };
  }

  const controller = new AbortController();
  const timeoutMs = input.timeout_ms ?? 20000;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(parsedUrl.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    const html = await response.text();
    const title = extractHtmlTitle(html);
    const plainText = toPlainText(html);
    const excerpt = truncate(plainText, 320);
    const snapshotDir = path.resolve(input.cwd, 'artifacts', 'browser');
    fs.mkdirSync(snapshotDir, { recursive: true });
    const snapshotPath = path.resolve(snapshotDir, `${input.mission_id}_${input.task_id}.html`);
    fs.writeFileSync(snapshotPath, html);
    const completedAt = now();
    const ok = response.ok;
    const summary = ok
      ? `Browser fetched ${parsedUrl.toString()} (${response.status})${title ? ` - ${title}` : ''}`
      : `Browser fetch failed with HTTP ${response.status} for ${parsedUrl.toString()}`;

    return {
      summary,
      status: ok ? 'success' : 'failed',
      artifacts: [
        {
          type: 'url',
          ref: parsedUrl.toString(),
          description: title ? `Page title: ${title}` : 'Fetched page URL.',
        },
        {
          type: 'file',
          ref: snapshotPath,
          description: 'Saved HTML snapshot for verification.',
        },
        {
          type: 'note',
          ref: `worker://browser/summary/${input.mission_id}`,
          description: excerpt || 'No readable text extracted from the page.',
        },
      ],
      checks: [
        {
          name: 'browser-http-success',
          passed: ok,
          detail: `HTTP status: ${response.status}`,
        },
        {
          name: 'browser-title-extracted',
          passed: title != null && title.length > 0,
          detail: title ? `Title: ${title}` : 'No <title> element found.',
        },
        {
          name: 'browser-content-extracted',
          passed: plainText.length > 0,
          detail: plainText.length > 0 ? `Extracted ${plainText.length} text chars.` : 'No plain-text content extracted.',
        },
      ],
      raw_output: html,
      invocation: {
        command: 'fetch',
        args: [parsedUrl.toString()],
        cwd: input.cwd,
        exit_code: ok ? 0 : 1,
        timed_out: false,
        started_at: startedAt,
        completed_at: completedAt,
        transport: 'manager_owned',
      },
      process_output: {
        stdout: excerpt,
        stderr: ok ? '' : `HTTP ${response.status}`,
      },
    };
  } catch (error) {
    const completedAt = now();
    const timedOut = error instanceof Error && error.name === 'AbortError';
    const detail = error instanceof Error ? error.message : String(error);
    return {
      summary: timedOut
        ? `Browser request timed out after ${timeoutMs}ms.`
        : `Browser worker could not fetch ${parsedUrl.toString()}: ${detail}`,
      status: 'failed',
      artifacts: [{
        type: 'note',
        ref: `worker://browser/fetch-error/${input.mission_id}`,
        description: detail,
      }],
      checks: [{
        name: 'browser-http-success',
        passed: false,
        detail: timedOut ? `Timed out after ${timeoutMs}ms.` : detail,
      }],
      raw_output: '',
      invocation: {
        command: 'fetch',
        args: [parsedUrl.toString()],
        cwd: input.cwd,
        exit_code: 1,
        timed_out: timedOut,
        started_at: startedAt,
        completed_at: completedAt,
        transport: 'manager_owned',
      },
      process_output: {
        stdout: '',
        stderr: detail,
      },
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

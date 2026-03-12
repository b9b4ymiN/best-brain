import { DEFAULT_PORT } from '../src/config.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { ScheduleWorkerPreference, TaskQueuePriority } from '../src/runtime/types.ts';

type Command = 'list' | 'enqueue' | 'tick' | 'cancel';

interface ParsedArgs {
  command: Command;
  id: string | null;
  goal: string | null;
  priority: TaskQueuePriority;
  source: string;
  parentMissionId: string | null;
  workerPreference: ScheduleWorkerPreference;
  maxAttempts: number | null;
  limit: number | null;
  reason: string | null;
}

function usage(): never {
  throw new Error([
    'Usage:',
    '  bun scripts/queue.ts list',
    '  bun scripts/queue.ts enqueue --goal="<goal>" [--priority=urgent|scheduled|background] [--source=<source>] [--parent-mission-id=<id>] [--worker=auto|claude|codex|shell|browser|mail] [--max-attempts=N]',
    '  bun scripts/queue.ts tick [--limit=N]',
    '  bun scripts/queue.ts cancel --id=<queue_item_id> [--reason=<text>]',
  ].join('\n'));
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be > 0`);
  }
  return Math.floor(parsed);
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command | undefined;
  if (!command || !['list', 'enqueue', 'tick', 'cancel'].includes(command)) {
    usage();
  }

  const id = argv.find((arg) => arg.startsWith('--id='))?.slice('--id='.length) ?? null;
  const goal = argv.find((arg) => arg.startsWith('--goal='))?.slice('--goal='.length) ?? null;
  const priorityRaw = argv.find((arg) => arg.startsWith('--priority='))?.slice('--priority='.length) ?? 'background';
  if (!['urgent', 'scheduled', 'background'].includes(priorityRaw)) {
    throw new Error(`unsupported --priority value: ${priorityRaw}`);
  }
  const source = argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length) ?? 'manual_enqueue';
  const parentMissionId = argv.find((arg) => arg.startsWith('--parent-mission-id='))?.slice('--parent-mission-id='.length) ?? null;
  const workerRaw = argv.find((arg) => arg.startsWith('--worker='))?.slice('--worker='.length) ?? 'auto';
  if (!['auto', 'claude', 'codex', 'shell', 'browser', 'mail'].includes(workerRaw)) {
    throw new Error(`unsupported --worker value: ${workerRaw}`);
  }
  const maxAttemptsRaw = argv.find((arg) => arg.startsWith('--max-attempts='))?.slice('--max-attempts='.length) ?? null;
  const maxAttempts = maxAttemptsRaw == null ? null : parsePositiveInt(maxAttemptsRaw, '--max-attempts');
  const limitRaw = argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length) ?? null;
  const limit = limitRaw == null ? null : parsePositiveInt(limitRaw, '--limit');
  const reason = argv.find((arg) => arg.startsWith('--reason='))?.slice('--reason='.length) ?? null;

  return {
    command,
    id,
    goal,
    priority: priorityRaw as TaskQueuePriority,
    source,
    parentMissionId,
    workerPreference: workerRaw as ScheduleWorkerPreference,
    maxAttempts,
    limit,
    reason,
  };
}

function resolveBaseUrl(): string {
  const explicit = process.env.BEST_BRAIN_MANAGER_BASE_URL;
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const port = Number(process.env.BEST_BRAIN_PORT || DEFAULT_PORT);
  return `http://127.0.0.1:${port}`;
}

async function request(baseUrl: string, path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return payload;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = resolveBaseUrl();
const adapter = new BrainHttpAdapter({
  baseUrl,
  autoStart: true,
  stopSpawnedServerOnDispose: true,
});

try {
  await adapter.ensureAvailable();

  let result: unknown;
  switch (args.command) {
    case 'list':
      result = await request(baseUrl, '/operator/queue', { method: 'GET' });
      break;
    case 'enqueue':
      if (!args.goal) {
        usage();
      }
      result = await request(baseUrl, '/operator/queue/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parent_mission_id: args.parentMissionId,
          goal: args.goal,
          priority: args.priority,
          source: args.source,
          worker_preference: args.workerPreference,
          queued_by: 'operator',
          max_attempts: args.maxAttempts ?? undefined,
        }),
      });
      break;
    case 'tick':
      result = await request(baseUrl, '/operator/queue/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: args.limit ?? 3 }),
      });
      break;
    case 'cancel':
      if (!args.id) {
        usage();
      }
      result = await request(baseUrl, `/operator/queue/${encodeURIComponent(args.id)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: args.reason }),
      });
      break;
    default:
      usage();
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await adapter.dispose();
}

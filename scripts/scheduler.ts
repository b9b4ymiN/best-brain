import { DEFAULT_PORT } from '../src/config.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import type { ScheduleCadence, ScheduleWorkerPreference } from '../src/runtime/types.ts';

type Command = 'list' | 'create' | 'pause' | 'resume' | 'run-now' | 'tick';

interface ParsedArgs {
  command: Command;
  id: string | null;
  name: string | null;
  goal: string | null;
  cadence: ScheduleCadence | null;
  workerPreference: ScheduleWorkerPreference;
  startImmediately: boolean;
  limit: number | null;
}

function usage(): never {
  throw new Error([
    'Usage:',
    '  bun scripts/scheduler.ts list',
    '  bun scripts/scheduler.ts create --name="<name>" --goal="<goal>" [--daily=HH:mm | --every-minutes=N] [--worker=auto|claude|codex|shell|browser|mail] [--start-now]',
    '  bun scripts/scheduler.ts pause --id=<schedule_id>',
    '  bun scripts/scheduler.ts resume --id=<schedule_id>',
    '  bun scripts/scheduler.ts run-now --id=<schedule_id>',
    '  bun scripts/scheduler.ts tick [--limit=N]',
  ].join('\n'));
}

function parseCadence(args: string[]): ScheduleCadence | null {
  const daily = args.find((arg) => arg.startsWith('--daily='))?.slice('--daily='.length) ?? null;
  const intervalRaw = args.find((arg) => arg.startsWith('--every-minutes='))?.slice('--every-minutes='.length) ?? null;

  if (daily && intervalRaw) {
    throw new Error('choose only one cadence: --daily or --every-minutes');
  }
  if (daily) {
    return {
      kind: 'daily',
      time_hhmm: daily,
      timezone: 'local',
    };
  }
  if (intervalRaw) {
    const minutes = Number(intervalRaw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('--every-minutes must be > 0');
    }
    return {
      kind: 'interval',
      every_minutes: Math.floor(minutes),
    };
  }
  return null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command | undefined;
  if (!command || !['list', 'create', 'pause', 'resume', 'run-now', 'tick'].includes(command)) {
    usage();
  }

  const id = argv.find((arg) => arg.startsWith('--id='))?.slice('--id='.length) ?? null;
  const name = argv.find((arg) => arg.startsWith('--name='))?.slice('--name='.length) ?? null;
  const goal = argv.find((arg) => arg.startsWith('--goal='))?.slice('--goal='.length) ?? null;
  const workerRaw = argv.find((arg) => arg.startsWith('--worker='))?.slice('--worker='.length) ?? 'auto';
  const workerPreference = ['auto', 'claude', 'codex', 'shell', 'browser', 'mail'].includes(workerRaw)
    ? workerRaw as ScheduleWorkerPreference
    : (() => {
      throw new Error(`unsupported worker preference: ${workerRaw}`);
    })();
  const startImmediately = argv.includes('--start-now');
  const limitRaw = argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length) ?? null;
  const limit = limitRaw == null
    ? null
    : (() => {
      const value = Number(limitRaw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--limit must be > 0');
      }
      return Math.floor(value);
    })();

  const cadence = parseCadence(argv);
  if (command === 'create' && !cadence) {
    return {
      command,
      id,
      name,
      goal,
      cadence: {
        kind: 'daily',
        time_hhmm: '09:00',
        timezone: 'local',
      },
      workerPreference,
      startImmediately,
      limit,
    };
  }

  return {
    command,
    id,
    name,
    goal,
    cadence,
    workerPreference,
    startImmediately,
    limit,
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

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? `HTTP ${response.status}`;
    throw new Error(message);
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
      result = await request(baseUrl, '/operator/schedules', { method: 'GET' });
      break;
    case 'create':
      if (!args.name || !args.goal || !args.cadence) {
        usage();
      }
      result = await request(baseUrl, '/operator/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: args.name,
          goal: args.goal,
          cadence: args.cadence,
          worker_preference: args.workerPreference,
          start_immediately: args.startImmediately,
        }),
      });
      break;
    case 'pause':
      if (!args.id) {
        usage();
      }
      result = await request(baseUrl, `/operator/schedules/${encodeURIComponent(args.id)}/pause`, {
        method: 'POST',
      });
      break;
    case 'resume':
      if (!args.id) {
        usage();
      }
      result = await request(baseUrl, `/operator/schedules/${encodeURIComponent(args.id)}/resume`, {
        method: 'POST',
      });
      break;
    case 'run-now':
      if (!args.id) {
        usage();
      }
      result = await request(baseUrl, `/operator/schedules/${encodeURIComponent(args.id)}/run-now`, {
        method: 'POST',
      });
      break;
    case 'tick':
      result = await request(baseUrl, '/operator/scheduler/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: args.limit ?? 3 }),
      });
      break;
    default:
      usage();
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await adapter.dispose();
}

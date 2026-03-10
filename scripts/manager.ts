import { ManagerRuntime } from '../src/manager/runtime.ts';
import { LocalCliChatResponder } from '../src/manager/chat-responder.ts';
import { LocalCliManagerReasoner } from '../src/manager/reasoner.ts';

function parseArgs(argv: string[]): {
  goal: string;
  worker_preference: 'auto' | 'claude' | 'codex' | 'shell';
  mission_id: string | null;
  output_mode: 'human' | 'json';
  dry_run: boolean;
  no_execute: boolean;
} {
  let workerPreference: 'auto' | 'claude' | 'codex' | 'shell' = 'auto';
  let missionId: string | null = null;
  let outputMode: 'human' | 'json' = 'human';
  let dryRun = false;
  let noExecute = false;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';

    if (arg.startsWith('--worker=')) {
      const value = arg.slice('--worker='.length);
      if (value === 'auto' || value === 'claude' || value === 'codex' || value === 'shell') {
        workerPreference = value;
        continue;
      }
      throw new Error(`Unsupported worker preference: ${value}`);
    }

    if (arg.startsWith('--mission-id=')) {
      missionId = arg.slice('--mission-id='.length) || null;
      continue;
    }

    if (arg === '--json') {
      outputMode = 'json';
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--no-execute') {
      noExecute = true;
      continue;
    }

    positional.push(arg);
  }

  const goal = positional.join(' ').trim();
  if (!goal) {
    throw new Error('Usage: bun run manager -- "<goal>" [--worker=auto|claude|codex|shell] [--mission-id=<id>] [--json] [--dry-run] [--no-execute]');
  }

  return {
    goal,
    worker_preference: workerPreference,
    mission_id: missionId,
    output_mode: outputMode,
    dry_run: dryRun,
    no_execute: noExecute,
  };
}

const runtime = new ManagerRuntime({
  reasoner: new LocalCliManagerReasoner(),
  chatResponder: new LocalCliChatResponder({
    executionCwd: process.cwd(),
    mcpServerEnv: {
      BEST_BRAIN_DATA_DIR: process.env.BEST_BRAIN_DATA_DIR,
      BEST_BRAIN_DB_PATH: process.env.BEST_BRAIN_DB_PATH,
      BEST_BRAIN_OWNER: process.env.BEST_BRAIN_OWNER,
    },
  }),
});

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await runtime.run({
    goal: args.goal,
    worker_preference: args.worker_preference,
    mission_id: args.mission_id,
    output_mode: args.output_mode,
    dry_run: args.dry_run,
    no_execute: args.no_execute,
  });

  if (args.output_mode === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.final_message);
  }
} finally {
  await runtime.dispose();
}

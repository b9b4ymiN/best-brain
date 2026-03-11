import { ChatService } from './chat/service.ts';
import { ControlRoomService } from './control-room/service.ts';
import { BestBrain } from './services/brain.ts';
import { createApp } from './http/app.ts';
import { BrainHttpAdapter } from './manager/adapters/brain-http.ts';
import { LocalCliChatResponder } from './manager/chat-responder.ts';
import { LocalCliManagerReasoner } from './manager/reasoner.ts';
import { ManagerRuntime } from './manager/runtime.ts';
import { MissionScheduler } from './runtime/scheduler.ts';
import type { ScheduledMissionRecord } from './runtime/types.ts';

const brain = await BestBrain.open();
let server: ReturnType<typeof Bun.serve>;
const managerFactory = () => new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
  reasoner: new LocalCliManagerReasoner(),
  chatResponder: new LocalCliChatResponder({
    executionCwd: process.cwd(),
    mcpServerEnv: {
      BEST_BRAIN_DATA_DIR: brain.config.dataDir,
      BEST_BRAIN_DB_PATH: brain.config.dbPath,
      BEST_BRAIN_OWNER: brain.config.owner,
    },
  }),
});
const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory,
  memoryQualityProvider: () => brain.getMemoryQualityMetrics(),
});
const chat = new ChatService({
  managerFactory,
  controlRoom,
});
const scheduler = new MissionScheduler({
  store: brain.store,
  runMission: async (schedule: ScheduledMissionRecord) => {
    const view = await controlRoom.launchMission({
      goal: schedule.goal,
      dry_run: false,
      no_execute: false,
      worker_preference: schedule.worker_preference,
    });
    return {
      mission_id: view.mission_id,
      status: view.status === 'verified_complete'
        ? 'verified_complete'
        : view.status === 'verification_failed'
          ? 'verification_failed'
          : view.status === 'rejected'
            ? 'rejected'
            : 'failed',
      final_message: view.verdict?.summary
        ?? `Mission finished with status ${view.status}.`,
    };
  },
  logger: (message, data) => {
    console.log(`[scheduler] ${message}`, data ? JSON.stringify(data) : '');
  },
});
const app = createApp(brain, { chat, controlRoom, scheduler });

server = Bun.serve({
  port: brain.config.port,
  fetch: app.fetch,
});

scheduler.startPolling(Number(process.env.BEST_BRAIN_SCHEDULER_INTERVAL_MS || 30_000));

console.log(`best-brain HTTP server listening on http://localhost:${server.port}`);

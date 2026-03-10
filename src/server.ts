import { ChatService } from './chat/service.ts';
import { ControlRoomService } from './control-room/service.ts';
import { BestBrain } from './services/brain.ts';
import { createApp } from './http/app.ts';
import { BrainHttpAdapter } from './manager/adapters/brain-http.ts';
import { ManagerRuntime } from './manager/runtime.ts';

const brain = await BestBrain.open();
let server: ReturnType<typeof Bun.serve>;
const managerFactory = () => new ManagerRuntime({
  brain: new BrainHttpAdapter({
    baseUrl: `http://127.0.0.1:${server.port}`,
    autoStart: false,
  }),
});
const controlRoom = new ControlRoomService({
  dataDir: brain.config.dataDir,
  managerFactory,
});
const chat = new ChatService({
  managerFactory,
  controlRoom,
});
const app = createApp(brain, { chat, controlRoom });

server = Bun.serve({
  port: brain.config.port,
  fetch: app.fetch,
});

console.log(`best-brain HTTP server listening on http://localhost:${server.port}`);

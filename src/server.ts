import { BestBrain } from './services/brain.ts';
import { createApp } from './http/app.ts';

const brain = await BestBrain.open();
const app = createApp(brain);

const server = Bun.serve({
  port: brain.config.port,
  fetch: app.fetch,
});

console.log(`best-brain HTTP server listening on http://localhost:${server.port}`);

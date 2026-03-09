import { runMcpSmoke } from '../src/mcp/smoke.ts';

const result = await runMcpSmoke({
  cwd: process.cwd(),
  debug: process.env.BEST_BRAIN_MCP_DEBUG === '1',
});

console.log(JSON.stringify(result, null, 2));

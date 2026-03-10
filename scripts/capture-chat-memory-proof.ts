import fs from 'fs';
import os from 'os';
import path from 'path';
import { ChatService } from '../src/chat/service.ts';
import { ControlRoomService } from '../src/control-room/service.ts';
import { createApp } from '../src/http/app.ts';
import { BrainHttpAdapter } from '../src/manager/adapters/brain-http.ts';
import { LocalCliChatResponder } from '../src/manager/chat-responder.ts';
import { LocalCliManagerReasoner } from '../src/manager/reasoner.ts';
import { ManagerRuntime } from '../src/manager/runtime.ts';
import { BestBrain } from '../src/services/brain.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-chat-memory-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'chat-memory-proof',
  dataDir,
  dbPath,
  port: 0,
  seedDefaults: true,
});

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
});
const chat = new ChatService({
  managerFactory,
  controlRoom,
});
const app = createApp(brain, { chat, controlRoom });

server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: app.fetch,
});

async function sendMessage(message: string) {
  const response = await fetch(`http://127.0.0.1:${server.port}/chat/api/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return await response.json() as {
    user_message: string;
    answer: string;
    decision_kind: string;
    blocked_reason: string | null;
    trace_id: string;
  };
}

async function recallWithRetry(message: string, expectedFragment: string) {
  const attempts: Array<{ attempt: number; answer: string; matched: boolean }> = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await sendMessage(message);
    const matched = result.answer.toLowerCase().includes(expectedFragment.toLowerCase());
    attempts.push({
      attempt,
      answer: result.answer,
      matched,
    });
    if (matched) {
      return {
        result,
        attempts,
      };
    }
    await Bun.sleep(1000);
  }

  return {
    result: await sendMessage(message),
    attempts,
  };
}

try {
  const remember = await sendMessage('Please remember that my name is Beam.');
  const recall = await recallWithRetry('What is my name?', 'beam');
  const storedMemory = brain.store
    .listMemories()
    .find((memory) => memory.source === 'chat://mcp-memory-write' && /beam/i.test(memory.content));
  const brainConsult = await brain.consult({
    query: 'What is the owner name?',
    domain: 'best-brain',
    limit: 10,
  });
  const personaCitation = brainConsult.citations.find((citation) => citation.memory_type === 'Persona' && /beam/i.test(citation.summary));
  const payload = {
    generated_at: new Date().toISOString(),
    remember_via_chat_pass: remember.decision_kind === 'chat'
      && /beam/i.test(remember.answer)
      && remember.blocked_reason == null,
    recall_via_chat_pass: recall.result.decision_kind === 'chat'
      && /beam/i.test(recall.result.answer)
      && recall.result.blocked_reason == null,
    brain_memory_written_via_mcp: storedMemory?.source === 'chat://mcp-memory-write'
      && storedMemory.verified_by === 'user',
    brain_memory_readable: personaCitation?.summary?.toLowerCase().includes('beam') ?? false,
    remember,
    recall,
    stored_memory: storedMemory ?? null,
    brain_consult: {
      trace_id: brainConsult.trace_id,
      answer: brainConsult.answer,
      persona_citation: personaCitation ?? null,
    },
  };

  const outputPath = path.resolve(process.cwd(), 'artifacts/chat-memory-proof.latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ output_path: outputPath, payload }, null, 2));
} finally {
  server.stop(true);
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // ignore temp cleanup errors
  }
}

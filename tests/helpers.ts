import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';

export async function createTestBrain() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-'));
  const dbPath = path.join(dataDir, 'best-brain.db');
  const brain = await BestBrain.open({
    owner: 'test-owner',
    dataDir,
    dbPath,
    port: 0,
  });

  return {
    brain,
    cleanup: () => {
      brain.close();
      try {
        fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can keep SQLite WAL files open briefly; leaking a temp dir is acceptable in tests.
      }
    },
  };
}

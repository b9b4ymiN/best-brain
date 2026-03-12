import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { OperatorSafetyController } from '../src/runtime/safety.ts';

describe('operator safety controller', () => {
  test('persists emergency-stop state and resumes cleanly', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-safety-'));
    let now = 1_700_000_000_000;
    try {
      const controller = new OperatorSafetyController({
        dataDir,
        now: () => now,
      });
      expect(controller.getState().emergency_stop).toBe(false);
      expect(controller.isExecutionAllowed()).toBe(true);

      now += 1_000;
      const stopped = controller.activate('Operator testing emergency stop.', 'test_operator');
      expect(stopped.emergency_stop).toBe(true);
      expect(stopped.reason).toBe('Operator testing emergency stop.');
      expect(stopped.updated_by).toBe('test_operator');
      expect(controller.isExecutionAllowed()).toBe(false);

      const reloaded = new OperatorSafetyController({
        dataDir,
        now: () => now + 500,
      });
      expect(reloaded.getState().emergency_stop).toBe(true);
      expect(reloaded.getState().reason).toBe('Operator testing emergency stop.');

      now += 2_000;
      const resumed = reloaded.resume('Operator resumed execution.', 'test_operator');
      expect(resumed.emergency_stop).toBe(false);
      expect(resumed.reason).toBe('Operator resumed execution.');
      expect(reloaded.isExecutionAllowed()).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

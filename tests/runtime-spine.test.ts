import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, test } from 'bun:test';
import { LocalRuntimeSpine } from '../src/runtime/spine.ts';

describe('runtime spine', () => {
  test('writes checkpoint snapshots and can restore to a prior runtime state', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-runtime-test-'));
    const runtime = new LocalRuntimeSpine();

    try {
      runtime.openSession({
        missionId: 'mission_runtime_restore',
        workspaceRoot,
        owner: 'runtime-test',
      });
      runtime.recordEvent({
        task_id: 'context_review',
        event_type: 'mission_seeded',
        actor: 'manager',
        detail: 'Prepared mission state before checkpoint.',
        data: {},
      });
      const checkpoint = runtime.createCheckpoint({
        label: 'before-mutation',
        artifact_ids: [],
        restore_supported: true,
      });
      runtime.recordEvent({
        task_id: 'primary_work',
        event_type: 'post_checkpoint_mutation',
        actor: 'manager',
        detail: 'Mutation after checkpoint that should disappear on restore.',
        data: {},
      });

      const restored = runtime.restoreCheckpoint(checkpoint.id);

      expect(checkpoint.snapshot_path).not.toBeNull();
      expect(checkpoint.snapshot_path && fs.existsSync(checkpoint.snapshot_path)).toBe(true);
      expect(restored.session.status).toBe('active');
      expect(restored.events.some((event) => event.event_type === 'post_checkpoint_mutation')).toBe(false);
      expect(restored.events.some((event) => event.event_type === 'checkpoint_restored')).toBe(true);
    } finally {
      try {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup issues.
      }
    }
  });
});

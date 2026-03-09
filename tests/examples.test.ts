import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'bun:test';

describe('manager example library', () => {
  test('ships parseable manager-facing examples with citations and artifact registry data', () => {
    const examplesDir = path.resolve(process.cwd(), 'docs/examples/manager');
    const consultResponse = JSON.parse(fs.readFileSync(path.join(examplesDir, 'consult-response.json'), 'utf8')) as {
      citations: Array<{ memory_id: string }>;
      memory_ids: string[];
    };
    const strictMissionOutcome = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-outcome-input.strict.json'), 'utf8')) as {
      status: string;
      domain: string;
      evidence: unknown[];
      verification_checks: unknown[];
    };
    const contextBundle = JSON.parse(fs.readFileSync(path.join(examplesDir, 'mission-context-bundle.json'), 'utf8')) as {
      verification_artifacts: unknown[];
      verification_state: { status: string } | null;
    };
    const proofState = JSON.parse(fs.readFileSync(path.join(examplesDir, 'completion-proof-state.json'), 'utf8')) as {
      status: string;
      evidence_count: number;
    };
    const verificationStart = JSON.parse(fs.readFileSync(path.join(examplesDir, 'verification-start.json'), 'utf8')) as {
      response: { status: string };
    };
    const verificationComplete = JSON.parse(fs.readFileSync(path.join(examplesDir, 'verification-complete.json'), 'utf8')) as {
      response: { status: string; evidence_count: number };
    };
    const registry = JSON.parse(fs.readFileSync(path.join(examplesDir, 'verification-artifact-registry.json'), 'utf8')) as {
      orphan_count: number;
      artifacts: Array<{ source_kind: string }>;
    };

    expect(consultResponse.citations.length).toBe(consultResponse.memory_ids.length);
    expect(strictMissionOutcome.status).toBe('in_progress');
    expect(strictMissionOutcome.domain.length).toBeGreaterThan(0);
    expect(strictMissionOutcome.evidence.length).toBeGreaterThan(0);
    expect(strictMissionOutcome.verification_checks.length).toBeGreaterThan(0);
    expect(Array.isArray(contextBundle.verification_artifacts)).toBe(true);
    expect(contextBundle.verification_state?.status).toBe('verified_complete');
    expect(proofState.evidence_count).toBeGreaterThan(0);
    expect(verificationStart.response.status).toBe('awaiting_verification');
    expect(verificationComplete.response.status).toBe('verified_complete');
    expect(verificationComplete.response.evidence_count).toBeGreaterThan(0);
    expect(registry.orphan_count).toBe(0);
    expect(registry.artifacts.some((artifact) => artifact.source_kind === 'verification_complete')).toBe(true);
  });
});

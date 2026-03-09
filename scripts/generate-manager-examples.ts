import fs from 'fs';
import os from 'os';
import path from 'path';
import { BestBrain } from '../src/services/brain.ts';
import { getOnboardingDefaults, runOnboarding } from '../src/services/onboarding.ts';

const outputDir = path.resolve(process.cwd(), 'docs/examples/manager');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'best-brain-examples-'));
const dbPath = path.join(dataDir, 'best-brain.db');
const brain = await BestBrain.open({
  owner: 'example-owner',
  dataDir,
  dbPath,
  port: 0,
});

try {
  await runOnboarding(brain, getOnboardingDefaults(brain));

  const missionOutcomeInput = {
    mission_id: 'manager-example-mission',
    objective: 'Demonstrate manager-facing brain contracts',
    result_summary: 'The mission produced a grounded consult response and a verified outcome.',
    evidence: [{ type: 'note' as const, ref: 'example://mission-proof', description: 'Example proof note' }],
    verification_checks: [{ name: 'example-check', passed: true, detail: 'Example verification passed' }],
    status: 'in_progress' as const,
    domain: 'best-brain',
  };

  const consultResponse = await brain.consult({
    query: 'What report format does the owner prefer?',
    domain: 'best-brain',
  });
  await brain.saveMissionOutcome(missionOutcomeInput);
  await brain.startVerification({
    mission_id: missionOutcomeInput.mission_id,
    requested_by: 'manager-example',
    checks: missionOutcomeInput.verification_checks,
  });
  const completionProofState = await brain.completeVerification({
    mission_id: missionOutcomeInput.mission_id,
    status: 'verified_complete',
    summary: 'Example mission passed verification.',
    evidence: missionOutcomeInput.evidence,
    verification_checks: missionOutcomeInput.verification_checks,
  });
  const missionContextBundle = await brain.getContext({
    mission_id: missionOutcomeInput.mission_id,
    query: 'latest mission context',
    domain: 'best-brain',
  });
  const verificationArtifactRegistry = brain.getVerificationArtifactRegistry(missionOutcomeInput.mission_id);
  const learnReject = await brain.learn({
    mode: 'persona',
    title: 'Unauthorized persona edit',
    content: 'This remains a policy rejection example.',
  });

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'consult-response.json'), JSON.stringify(consultResponse, null, 2));
  fs.writeFileSync(path.join(outputDir, 'mission-outcome-input.json'), JSON.stringify(missionOutcomeInput, null, 2));
  fs.writeFileSync(path.join(outputDir, 'mission-context-bundle.json'), JSON.stringify(missionContextBundle, null, 2));
  fs.writeFileSync(path.join(outputDir, 'completion-proof-state.json'), JSON.stringify(completionProofState, null, 2));
  fs.writeFileSync(path.join(outputDir, 'verification-artifact-registry.json'), JSON.stringify(verificationArtifactRegistry, null, 2));
  fs.writeFileSync(path.join(outputDir, 'learn-reject.json'), JSON.stringify(learnReject, null, 2));

  console.log(JSON.stringify({
    output_dir: outputDir,
    files: [
      'consult-response.json',
      'mission-outcome-input.json',
      'mission-context-bundle.json',
      'completion-proof-state.json',
      'verification-artifact-registry.json',
      'learn-reject.json',
    ],
  }, null, 2));
} finally {
  brain.close();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Windows can keep SQLite WAL files open briefly.
  }
}

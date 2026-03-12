import fs from 'fs';
import path from 'path';
import { buildProgramScorecard } from '../src/program/scorecard.ts';

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function fileContainsAll(filePath: string, patterns: string[]): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
  return patterns.every((pattern) => content.includes(pattern.toLowerCase()));
}

const cwd = process.cwd();
const artifactsDir = path.resolve(cwd, 'artifacts');
const outputPath = path.join(artifactsDir, 'program-scorecard.latest.json');
const consultEval = readJson<{
  summary: {
    routing_accuracy: number;
    top_k_relevance: number;
    citation_completeness: number;
    trace_presence: number;
    mission_proof_pass_rate: number;
    orphan_evidence_count: number;
    manual_medians: {
      usefulness: number;
      groundedness: number;
      persona_alignment: number;
      actionability: number;
    };
  };
}>(path.join(artifactsDir, 'consult-eval.latest.json'));
const seedComparison = readJson<{
  summary: {
    empty_hit_rate: number;
    seeded_hit_rate: number;
    seeded_context_coverage: number;
    seeded_gain: number;
  };
}>(path.join(artifactsDir, 'seed-comparison.latest.json'));
const bootstrapSmoke = readJson<{
  startup: {
    first_run_db_init_success: boolean;
    startup_time_ms: number;
  };
}>(path.join(artifactsDir, 'bootstrap-smoke.latest.json'));
const managerProof = readJson<{
  thin_manager_pass: boolean;
  claude_primary_pass: boolean;
  codex_primary_pass: boolean;
  runs?: {
    codex_primary?: {
      output_excerpt?: string;
    };
  };
  shell_primary_pass?: boolean;
  mission_brief_completeness?: number;
  goal_ambiguity_detection?: boolean;
  false_complete_count?: number;
  blocked_with_correct_reason_rate?: number;
  worker_invocation_pass_rate?: number;
  artifact_lineage_completeness?: number;
  verifier_worker_path?: boolean;
  runtime_session_capture?: boolean;
  checkpoint_capture?: boolean;
  checkpoint_restore_capture?: boolean;
  checkpoint_restore_breadth?: number;
}>(path.join(artifactsDir, 'manager-proof.latest.json'));
const provingHarness = readJson<{
  summary: {
    proving_mission_definition_valid: boolean;
    supported_definition_count: number;
    generic_acceptance_harness_pass_rate: number;
    blocked_reason_accuracy: number;
    report_contract_completeness: number;
    adapter_selection_correctness: number;
    mission_demo_without_hidden_steps: boolean;
  };
}>(path.join(artifactsDir, 'proving-harness.latest.json'));
const phase4Proof = readJson<{
  success_run_pass: boolean;
  blocked_with_correct_reason: boolean;
  retryable_verification_failed: boolean;
  final_report_artifact_present: boolean;
  market_data_evidence_present: boolean;
  latest_verified_mission_reused: boolean;
}>(path.join(artifactsDir, 'phase4-proof.latest.json'));
const phase5ActualProof = readJson<{
  single_goal_manager_led_pass: boolean;
  persona_memory_applied: boolean;
  manager_generated_plan: boolean;
  worker_control_end_to_end: boolean;
  no_demo_shortcut_path: boolean;
}>(path.join(artifactsDir, 'phase5-actual.latest.json'));
const phase6RepeatabilityProof = readJson<{
  payload: {
    repeated_run_count: number;
    repeatable_verified_complete_rate: number;
    memory_reuse_citation_rate: number;
    retry_recovery_rate: number;
    blocked_with_correct_reason_rate: number;
    false_complete_count: number;
    no_hidden_human_steps: boolean;
  };
}>(path.join(artifactsDir, 'phase6-repeatability.latest.json'));
const controlRoomProof = readJson<{
  payload: {
    control_room_launch_pass: boolean;
    mission_console_visibility_completeness: number;
    control_room_retry_pass: boolean;
    control_room_review_audit_pass: boolean;
    kernel_rail_bypass_detected: boolean;
  };
}>(path.join(artifactsDir, 'control-room-proof.latest.json'));
const phase11OperatorProof = readJson<{
  payload: {
    scheduled_run_count: number;
    scheduled_verified_complete_rate: number;
    consecutive_daily_runs: boolean;
    autonomy_gating_correct: boolean;
    no_manual_intervention_steps: boolean;
  };
}>(path.join(artifactsDir, 'phase11-operator.latest.json'));
const bootstrapProofDir = path.join(artifactsDir, 'bootstrap-proofs');

type BootstrapTarget = 'windows' | 'macos' | 'linux';

function normalizeBootstrapTarget(value: string): BootstrapTarget | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'windows' || normalized === 'win32') {
    return 'windows';
  }
  if (normalized === 'macos' || normalized === 'darwin' || normalized === 'mac') {
    return 'macos';
  }
  if (normalized === 'linux') {
    return 'linux';
  }
  return null;
}

function collectCapturedBootstrapProofs(proofDir: string): BootstrapTarget[] {
  const captured = new Set<BootstrapTarget>();
  if (!fs.existsSync(proofDir)) {
    return [];
  }

  for (const entry of fs.readdirSync(proofDir)) {
    if (!entry.endsWith('.json')) {
      continue;
    }

    const stem = path.basename(entry, '.json');
    const fromStem = normalizeBootstrapTarget(stem);
    if (fromStem != null) {
      captured.add(fromStem);
      continue;
    }

    const fullPath = path.join(proofDir, entry);
    try {
      const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { os_label?: string | null };
      const fromPayload = typeof payload.os_label === 'string'
        ? normalizeBootstrapTarget(payload.os_label)
        : null;
      if (fromPayload != null) {
        captured.add(fromPayload);
      }
    } catch {
      // Ignore malformed proof files in scorecard generation.
    }
  }

  return Array.from(captured).sort();
}

const capturedBootstrapProofs = collectCapturedBootstrapProofs(bootstrapProofDir);

const scorecard = buildProgramScorecard({
  generated_at: new Date().toISOString(),
  contract_snapshot: {
    docs_locked: [
      'docs/vision/final-concept.md',
      'docs/architecture/system-overview.md',
      'docs/roadmap/master-plan.md',
      'docs/roadmap/90-day-execution.md',
      'docs/architecture/contracts-freeze.md',
      'docs/metrics/measurement-plan.md',
    ].every((filePath) => fs.existsSync(path.resolve(cwd, filePath))),
    frozen_contracts: {
      brain: fs.existsSync(path.resolve(cwd, 'src/contracts.ts')),
      manager: fs.existsSync(path.resolve(cwd, 'src/manager/types.ts')),
      worker: fs.existsSync(path.resolve(cwd, 'src/workers/types.ts')),
      runtime: fs.existsSync(path.resolve(cwd, 'src/runtime/types.ts')),
      console: fs.existsSync(path.resolve(cwd, 'src/control-room/types.ts')),
      market_data: fs.existsSync(path.resolve(cwd, 'src/market/types.ts')),
    },
    example_libraries_refreshed: fs.existsSync(path.resolve(cwd, 'docs/examples/manager'))
      && fs.existsSync(path.resolve(cwd, 'docs/examples/program')),
    acceptance_run_set_defined: fileContainsAll(
      path.resolve(cwd, 'docs/metrics/measurement-plan.md'),
      ['acceptance run set', 'thai_equities_daily_controlled_acceptance_runs'],
    ),
    no_hidden_human_loop_assumption_locked: fileContainsAll(
      path.resolve(cwd, 'docs/roadmap/90-day-execution.md'),
      ['no hidden human-in-the-loop steps'],
    ),
  },
  consult_eval: consultEval?.summary,
  seed_comparison: seedComparison?.summary,
  bootstrap_smoke: bootstrapSmoke?.startup,
  captured_bootstrap_proofs: capturedBootstrapProofs,
  manager_proof: managerProof
    ? {
        ...managerProof,
        codex_output_excerpt: managerProof.runs?.codex_primary?.output_excerpt,
      }
    : undefined,
  proving_harness: provingHarness?.summary,
  phase4_proof: phase4Proof ?? undefined,
  actual_mission_proof: phase5ActualProof ?? undefined,
  phase6_repeatability_proof: phase6RepeatabilityProof?.payload,
  control_room_proof: controlRoomProof?.payload,
  phase11_operator_proof: phase11OperatorProof?.payload,
});

fs.mkdirSync(artifactsDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(scorecard, null, 2));

console.log(JSON.stringify({
  output_path: outputPath,
  scorecard,
}, null, 2));

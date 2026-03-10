import type { MissionPlaybook } from '../playbooks/types.ts';
import type { ManagerInput, ManagerWorker } from '../manager/types.ts';
import type { MissionContextBundle } from '../types.ts';
import { listThaiEquitiesDemoCandidates, resolveThaiEquitiesDemoScenario } from '../market/demo.ts';
import type {
  InputAdapterDecision,
  InputAdapterDefinition,
  MissionInputSpec,
  MissionReportContract,
  ProvingMissionDefinition,
} from './types.ts';

function buildReportContract(id: string, title: string): MissionReportContract {
  return {
    id,
    title,
    artifact_kind: 'report',
    requires_verification_evidence: true,
    required_sections: [
      'objective',
      'result_summary',
      'evidence_summary',
      'checks_summary',
      'blocked_or_rejected_reason',
      'remaining_risks',
      'next_action',
    ],
  };
}

function buildWorkspaceInput(required: boolean): MissionInputSpec {
  return {
    id: 'workspace_context',
    title: 'Workspace context',
    family: 'local_repo_or_runtime',
    required,
    description: 'Local repo or runtime workspace information needed to execute the mission.',
    accepted_source_kinds: ['workspace_scan', 'runtime_session'],
    max_freshness_ms: null,
    minimum_confidence: 0.5,
  };
}

function buildMarketInput(required: boolean): MissionInputSpec {
  return {
    id: 'live_market_snapshot',
    title: 'Live market snapshot',
    family: 'market_data',
    required,
    description: 'Fresh market data needed for a proving mission that depends on live Thai equities inputs.',
    accepted_source_kinds: ['live_market_feed', 'official_market_source'],
    max_freshness_ms: 2 * 60 * 60 * 1000,
    minimum_confidence: 0.8,
  };
}

function buildGenericMissionDefinition(playbook: MissionPlaybook): ProvingMissionDefinition {
  return {
    id: `mission_definition_${playbook.slug}`,
    slug: playbook.slug,
    title: `Proving mission definition: ${playbook.title}`,
    mission_kind: playbook.mission_kind,
    goal_template: 'Take one user goal, compile a mission brief, execute the general engine, and finish only with proof.',
    required_inputs: [buildWorkspaceInput(playbook.mission_kind !== 'owner_guidance')],
    allowed_workers: playbook.preferred_workers.filter((worker): worker is ManagerWorker => worker !== 'verifier'),
    required_evidence: Array.from(new Set([
      'note',
      ...playbook.verifier_checklist.flatMap((item) => item.artifact_kind ? [item.artifact_kind] : []),
    ])),
    verifier_checklist: playbook.verifier_checklist,
    repair_heuristics: playbook.repair_heuristics,
    report_contract: buildReportContract(`report_contract_${playbook.slug}`, `Owner mission report for ${playbook.title}`),
    acceptance: {
      id: `acceptance_${playbook.slug}`,
      acceptance_scenarios: [
        'success',
        'blocked_with_correct_reason',
        'stale_or_invalid_input_blocked',
        'verification_failed_retryable',
      ],
      success_statuses: ['verified_complete'],
      retryable_statuses: ['verification_failed'],
      blocked_reasons: [
        'ambiguous_goal',
        'missing_required_input',
        'invalid_input',
        'stale_input',
        'no_available_input_adapter',
        'policy_rejection',
      ],
      required_evidence_types: Array.from(new Set([
        'note',
        ...playbook.verifier_checklist.flatMap((item) => item.artifact_kind ? [item.artifact_kind] : []),
      ])),
      required_check_names: playbook.verifier_checklist.map((item) => item.name),
    },
  };
}

function buildStockScannerDefinition(playbook: MissionPlaybook): ProvingMissionDefinition {
  return {
    ...buildGenericMissionDefinition(playbook),
    id: 'mission_definition_thai_equities_daily_scanner',
    slug: 'thai-equities-daily-scanner',
    title: 'First demo / acceptance mission definition: Thai equities daily stock scanner',
    goal_template: 'Run the Thai equities daily stock scanner and produce a verified owner report.',
    required_inputs: [buildMarketInput(true), buildWorkspaceInput(false)],
    report_contract: buildReportContract('report_contract_thai_equities_daily_scanner', 'Owner report for the Thai equities daily stock scanner'),
    acceptance: {
      ...buildGenericMissionDefinition(playbook).acceptance,
      id: 'acceptance_thai_equities_daily_scanner',
      required_evidence_types: Array.from(new Set(['note', 'other'])),
    },
  };
}

function buildActualManagerLedStockScannerDefinition(playbook: MissionPlaybook): ProvingMissionDefinition {
  return {
    ...buildGenericMissionDefinition(playbook),
    id: 'mission_definition_thai_equities_manager_led_scanner',
    slug: 'thai-equities-manager-led-scanner',
    title: 'Actual manager-led mission definition: Thai equities stock scanner',
    goal_template: 'Start from one owner goal, derive VI criteria from memory, and return a verified owner-facing scanner system plan.',
    required_inputs: [buildMarketInput(true), buildWorkspaceInput(false)],
    report_contract: buildReportContract('report_contract_thai_equities_manager_led_scanner', 'Owner report for the actual manager-led Thai equities stock scanner mission'),
    acceptance: {
      ...buildGenericMissionDefinition(playbook).acceptance,
      id: 'acceptance_thai_equities_manager_led_scanner',
      required_evidence_types: Array.from(new Set(['note'])),
      required_check_names: playbook.verifier_checklist.map((item) => item.name),
    },
  };
}

export function resolveProvingMissionDefinition(playbook: MissionPlaybook): ProvingMissionDefinition {
  if (playbook.mission_kind === 'thai_equities_daily_scanner') {
    return buildStockScannerDefinition(playbook);
  }
  if (playbook.mission_kind === 'thai_equities_manager_led_scanner') {
    return buildActualManagerLedStockScannerDefinition(playbook);
  }

  return buildGenericMissionDefinition(playbook);
}

export function buildInputAdapterRegistry(input: ManagerInput, context: MissionContextBundle): InputAdapterDefinition[] {
  const adapters: InputAdapterDefinition[] = [
    {
      id: 'adapter_workspace_scan',
      title: 'Workspace scan',
      family: 'local_repo_or_runtime',
      source_kind: 'workspace_scan',
      available: true,
      freshness_ms: null,
      confidence: 0.9,
      blocking_reason: null,
      provides_inputs: ['workspace_context'],
      notes: [`cwd=${input.cwd}`],
    },
    {
      id: 'adapter_runtime_history',
      title: 'Runtime history snapshot',
      family: 'local_repo_or_runtime',
      source_kind: 'runtime_session',
      available: context.history.length > 0 || context.mission != null,
      freshness_ms: null,
      confidence: context.history.length > 0 || context.mission != null ? 0.7 : 0.4,
      blocking_reason: context.history.length > 0 || context.mission != null ? null : 'missing_required_input',
      provides_inputs: ['workspace_context'],
      notes: ['Derived from existing mission context and history.'],
    },
  ];

  const normalizedGoal = input.goal.toLowerCase();
  const isThaiEquitiesGoal = normalizedGoal.includes('thai')
    && (normalizedGoal.includes('equities') || normalizedGoal.includes('stock') || normalizedGoal.includes('stocks') || normalizedGoal.includes('set'))
    && (normalizedGoal.includes('scanner') || normalizedGoal.includes('scan'));

  if (isThaiEquitiesGoal) {
    const scenario = resolveThaiEquitiesDemoScenario(input.goal);
    adapters.push(
      ...listThaiEquitiesDemoCandidates(scenario).map((candidate) => ({
        id: candidate.id,
        title: candidate.id.replace(/_/g, ' '),
        family: 'market_data' as const,
        source_kind: candidate.source_kind === 'public_web_feed' ? 'live_market_feed' : 'official_market_source',
        available: candidate.available,
        freshness_ms: candidate.freshness_ms,
        confidence: candidate.confidence,
        blocking_reason: candidate.available ? null : ('no_available_input_adapter' as const),
        provides_inputs: ['live_market_snapshot'],
        notes: candidate.notes,
      })),
    );
  }

  return adapters;
}

function candidateMatchesInput(candidate: InputAdapterDefinition, inputSpec: MissionInputSpec): boolean {
  return candidate.family === inputSpec.family
    && candidate.provides_inputs.includes(inputSpec.id)
    && inputSpec.accepted_source_kinds.includes(candidate.source_kind);
}

export function selectInputAdapters(
  requiredInputs: MissionInputSpec[],
  registry: InputAdapterDefinition[],
): InputAdapterDecision[] {
  return requiredInputs.map((inputSpec) => {
    const candidates = registry
      .filter((candidate) => candidateMatchesInput(candidate, inputSpec))
      .sort((left, right) => right.confidence - left.confidence);
    const considered = candidates.map((candidate) => ({
      id: candidate.id,
      family: candidate.family,
      source_kind: candidate.source_kind,
      available: candidate.available,
      freshness_ms: candidate.freshness_ms,
      confidence: candidate.confidence,
      blocking_reason: candidate.blocking_reason,
    }));

    if (!inputSpec.required) {
      return {
        input_id: inputSpec.id,
        family: inputSpec.family,
        decision: candidates.length > 0 ? 'selected' : 'not_required',
        selected_adapter_id: candidates[0]?.id ?? null,
        reason: candidates.length > 0
          ? `Optional input ${inputSpec.id} can use ${candidates[0]?.id}.`
          : `Optional input ${inputSpec.id} was not required for this run.`,
        blocked_reason: null,
        considered,
      } satisfies InputAdapterDecision;
    }

    const selected = candidates.find((candidate) => {
      if (!candidate.available) {
        return false;
      }
      if (inputSpec.max_freshness_ms != null && candidate.freshness_ms != null && candidate.freshness_ms > inputSpec.max_freshness_ms) {
        return false;
      }
      if (inputSpec.minimum_confidence != null && candidate.confidence < inputSpec.minimum_confidence) {
        return false;
      }
      return true;
    });

    if (!selected) {
      const staleCandidate = candidates.find((candidate) => candidate.available && candidate.freshness_ms != null && inputSpec.max_freshness_ms != null && candidate.freshness_ms > inputSpec.max_freshness_ms);
      const blockedReason = staleCandidate
        ? 'stale_input'
        : candidates.length === 0
          ? 'no_available_input_adapter'
          : candidates.some((candidate) => candidate.available)
            ? 'invalid_input'
            : (candidates[0]?.blocking_reason ?? 'missing_required_input');
      return {
        input_id: inputSpec.id,
        family: inputSpec.family,
        decision: 'blocked',
        selected_adapter_id: null,
        reason: `Required input ${inputSpec.id} is blocked: ${blockedReason}.`,
        blocked_reason: blockedReason,
        considered,
      } satisfies InputAdapterDecision;
    }

    return {
      input_id: inputSpec.id,
      family: inputSpec.family,
      decision: 'selected',
      selected_adapter_id: selected.id,
      reason: `Selected ${selected.id} for required input ${inputSpec.id}.`,
      blocked_reason: null,
      considered,
    } satisfies InputAdapterDecision;
  });
}

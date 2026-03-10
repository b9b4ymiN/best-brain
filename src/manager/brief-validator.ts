import type { MissionBrief, MissionBriefValidation } from './types.ts';

interface ValidationCheck {
  field: string;
  passed: boolean;
}

function hasVerificationLanguage(brief: MissionBrief): boolean {
  return [...brief.success_criteria, ...brief.constraints, ...brief.execution_plan]
    .some((value) => value.toLowerCase().includes('verification') || value.toLowerCase().includes('proof'));
}

export function validateMissionBrief(brief: MissionBrief): MissionBriefValidation {
  const checks: ValidationCheck[] = [
    { field: 'goal', passed: brief.goal.trim().length > 0 },
    { field: 'mission_kind', passed: brief.mission_kind.trim().length > 0 },
    { field: 'mission_definition_id', passed: brief.mission_definition_id.trim().length > 0 },
    { field: 'acceptance_profile_id', passed: brief.acceptance_profile_id.trim().length > 0 },
    { field: 'report_contract_id', passed: brief.report_contract_id.trim().length > 0 },
    { field: 'selected_worker', passed: brief.kind === 'chat' || brief.selected_worker != null },
    { field: 'success_criteria', passed: brief.success_criteria.length >= 3 },
    { field: 'constraints', passed: brief.constraints.length >= 2 },
    { field: 'preferred_format', passed: brief.preferred_format.trim().length > 0 },
    { field: 'planning_hints', passed: brief.planning_hints.length >= 1 },
    { field: 'brain_citations', passed: brief.brain_citations.length >= 1 },
    { field: 'brain_trace_id', passed: brief.brain_trace_id.trim().length > 0 },
    { field: 'playbook', passed: brief.playbook.id.trim().length > 0 && brief.playbook.verifier_checklist.length >= 1 },
    { field: 'mission_definition', passed: brief.mission_definition.id === brief.mission_definition_id },
    { field: 'report_contract', passed: brief.report_contract.id === brief.report_contract_id && brief.report_contract.required_sections.length >= 5 },
    {
      field: 'input_adapter_decisions',
      passed: brief.mission_definition.required_inputs.every((inputSpec) => {
        const decision = brief.input_adapter_decisions.find((candidate) => candidate.input_id === inputSpec.id);
        return decision != null && (inputSpec.required ? decision.decision !== 'not_required' : true);
      }),
    },
    { field: 'mission_graph', passed: brief.mission_graph.nodes.length >= 2 && brief.mission_graph.playbook_id === brief.playbook.id },
    { field: 'execution_plan', passed: brief.execution_plan.length >= (brief.kind === 'chat' ? 1 : 3) },
    {
      field: 'manager_derivation',
      passed: brief.mission_kind !== 'thai_equities_manager_led_scanner'
        || (
          brief.manager_derivation != null
          && brief.manager_derivation.owner_archetype !== 'unknown'
          && brief.manager_derivation.screening_criteria.length >= 3
          && brief.manager_derivation.derived_from_memory_ids.length >= 1
        ),
    },
  ];

  const missingFields = checks.filter((check) => !check.passed).map((check) => check.field);
  const warnings: string[] = [];
  if (!hasVerificationLanguage(brief)) {
    warnings.push('brief does not mention proof or verification in the plan rails');
  }
  if (brief.planning_hints.length < 2) {
    warnings.push('brief has thin planning hints and may need more memory support');
  }
  if (brief.input_adapter_decisions.some((decision) => decision.decision === 'blocked')) {
    warnings.push('brief has blocked input adapters and may need clarification or a different source.');
  }
  if (brief.mission_kind === 'thai_equities_manager_led_scanner' && brief.manager_derivation?.owner_archetype === 'unknown') {
    warnings.push('actual stock-scanner mission did not derive a clear owner archetype from memory');
  }

  const completenessScore = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);

  return {
    is_complete: missingFields.length === 0,
    completeness_score: completenessScore,
    missing_fields: missingFields,
    warnings,
  };
}

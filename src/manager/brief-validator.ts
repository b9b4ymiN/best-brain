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
    { field: 'selected_worker', passed: brief.kind === 'chat' || brief.selected_worker != null },
    { field: 'success_criteria', passed: brief.success_criteria.length >= 3 },
    { field: 'constraints', passed: brief.constraints.length >= 2 },
    { field: 'preferred_format', passed: brief.preferred_format.trim().length > 0 },
    { field: 'planning_hints', passed: brief.planning_hints.length >= 1 },
    { field: 'brain_citations', passed: brief.brain_citations.length >= 1 },
    { field: 'brain_trace_id', passed: brief.brain_trace_id.trim().length > 0 },
    { field: 'playbook', passed: brief.playbook.id.trim().length > 0 && brief.playbook.verifier_checklist.length >= 1 },
    { field: 'mission_graph', passed: brief.mission_graph.nodes.length >= 2 && brief.mission_graph.playbook_id === brief.playbook.id },
    { field: 'execution_plan', passed: brief.execution_plan.length >= (brief.kind === 'chat' ? 1 : 3) },
  ];

  const missingFields = checks.filter((check) => !check.passed).map((check) => check.field);
  const warnings: string[] = [];
  if (!hasVerificationLanguage(brief)) {
    warnings.push('brief does not mention proof or verification in the plan rails');
  }
  if (brief.planning_hints.length < 2) {
    warnings.push('brief has thin planning hints and may need more memory support');
  }

  const completenessScore = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);

  return {
    is_complete: missingFields.length === 0,
    completeness_score: completenessScore,
    missing_fields: missingFields,
    warnings,
  };
}

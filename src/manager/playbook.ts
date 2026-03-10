import type { ConsultResponse, MissionContextBundle, VerificationArtifact } from '../types.ts';
import type { MissionPlaybook, VerifierChecklistItem } from '../playbooks/types.ts';
import { slugify } from '../utils/text.ts';
import { tokenize } from '../utils/text.ts';
import type { WorkerId } from '../workers/types.ts';
import type { ManagerDecision, ManagerInput } from './types.ts';

const CODE_HINTS = ['repo', 'code', 'typescript', 'bun', 'test', 'file', 'script', 'server', 'patch', 'implement'];
const REPORT_HINTS = ['report', 'summary', 'summarize', 'analysis', 'review', 'plan'];
const REPO_CHANGE_HINTS = ['repo', 'code', 'file', 'script', 'server', 'typescript', 'patch', 'implement', 'fix'];

function includesAny(goal: string, hints: string[]): boolean {
  const tokens = tokenize(goal);
  return hints.some((hint) => tokens.includes(hint));
}

function toPlaybookSlug(value: string): string {
  return slugify(value.replace(/_/g, ' '));
}

function inferMissionKind(goal: string, decision: ManagerDecision): string {
  if (decision.kind === 'chat') {
    return 'owner_guidance';
  }
  if (decision.selected_worker === 'shell' && goal.includes('`') && !includesAny(goal, REPO_CHANGE_HINTS)) {
    return decision.kind === 'mission' ? 'command_execution_mission' : 'command_execution_task';
  }
  if (includesAny(goal, CODE_HINTS)) {
    return 'repo_change_mission';
  }
  if (includesAny(goal, REPORT_HINTS)) {
    return 'analysis_reporting_mission';
  }
  return decision.kind === 'mission' ? 'general_mission' : 'general_task';
}

function checklistItem(
  id: string,
  name: string,
  required: boolean,
  artifactKind: VerificationArtifact['type'] | null,
  detail: string,
): VerifierChecklistItem {
  return {
    id,
    name,
    required,
    artifact_kind: artifactKind,
    detail,
  };
}

function buildVerifierChecklist(missionKind: string, decision: ManagerDecision): VerifierChecklistItem[] {
  const checklist: VerifierChecklistItem[] = [
    checklistItem(
      'check_note_evidence',
      'Owner-facing note evidence exists',
      true,
      'note',
      'There must be a grounded note/report artifact that the owner can inspect.',
    ),
    checklistItem(
      'check_worker_checks',
      'Worker and manager checks are recorded',
      true,
      null,
      'The run must emit verification checks, not just a summary.',
    ),
  ];

  if (missionKind === 'repo_change_mission') {
    checklist.push(
      checklistItem(
        'check_code_or_test_artifact',
        'Code or test artifact exists',
        true,
        'file',
        'Implementation missions should produce a file artifact that points to the change.',
      ),
    );
  }

  return checklist;
}

export function resolveMissionPlaybook(
  input: ManagerInput,
  consult: ConsultResponse,
  context: MissionContextBundle,
  decision: ManagerDecision,
): MissionPlaybook {
  const missionKind = inferMissionKind(input.goal, decision);
  const preferredWorkers: WorkerId[] = Array.from(new Set([
    missionKind === 'analysis_reporting_mission' || missionKind === 'owner_guidance' ? 'claude' : null,
    missionKind === 'repo_change_mission' ? 'codex' : null,
    missionKind.startsWith('command_execution') ? 'shell' : null,
    decision.selected_worker,
    decision.kind === 'chat' ? null : 'verifier',
  ].filter((value): value is WorkerId => value != null)));

  return {
    id: `playbook_${toPlaybookSlug(missionKind)}`,
    slug: toPlaybookSlug(missionKind),
    title: `Mission playbook: ${missionKind}`,
    scope: missionKind === 'thai_equities_daily_scanner' ? 'domain' : 'mission',
    mission_kind: missionKind,
    preferred_workers: preferredWorkers,
    planning_hints: Array.from(new Set([
      ...context.planning_hints,
      ...consult.followup_actions,
    ])).slice(0, 6),
    report_format: context.preferred_format,
    verifier_checklist: buildVerifierChecklist(missionKind, decision),
    repair_heuristics: [
      {
        id: `repair_${toPlaybookSlug(missionKind)}_collect_more_evidence`,
        trigger: 'verification_failed',
        instruction: 'Gather missing evidence, rerun the relevant step, and do not claim complete until the checklist passes.',
        max_retries: 2,
      },
      {
        id: `repair_${toPlaybookSlug(missionKind)}_clarify_scope`,
        trigger: 'blocked_or_ambiguous',
        instruction: 'Clarify scope, expected output, and proof of done before resuming execution.',
        max_retries: 1,
      },
    ],
  };
}

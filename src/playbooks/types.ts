import type { VerificationArtifact } from '../types.ts';
import type { WorkerId } from '../workers/types.ts';

export const PLAYBOOK_SCOPES = [
  'global',
  'domain',
  'mission',
  'worker',
] as const;

export type PlaybookScope = (typeof PLAYBOOK_SCOPES)[number];

export interface VerifierChecklistItem {
  id: string;
  name: string;
  required: boolean;
  artifact_kind: VerificationArtifact['type'] | null;
  validation_source?: 'artifact' | 'worker_check' | 'input_adapter' | 'any';
  detail: string;
}

export interface RepairHeuristic {
  id: string;
  trigger: string;
  instruction: string;
  max_retries: number;
}

export interface MissionPlaybook {
  id: string;
  slug: string;
  title: string;
  scope: PlaybookScope;
  mission_kind: string;
  preferred_workers: WorkerId[];
  planning_hints: string[];
  report_format: string;
  verifier_checklist: VerifierChecklistItem[];
  repair_heuristics: RepairHeuristic[];
}

import { ONBOARDING_MEMORY_TITLES } from '../contracts.ts';
import type { LearnRequest, LearnResult } from '../types.ts';
import type { BestBrain } from './brain.ts';

export interface OnboardingAnswers {
  ownerPersona: string;
  preferredReportFormat: string;
  communicationStyle: string;
  qualityBar: string;
  planningPlaybook: string;
}

export interface OnboardingResult {
  completed: boolean;
  results: LearnResult[];
}

function onboardingEvidenceRef(kind: string) {
  return [{ type: 'note' as const, ref: `onboarding://${kind}` }];
}

function trimOrFallback(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized || fallback;
}

export function getOnboardingDefaults(brain: BestBrain): OnboardingAnswers {
  const snapshot = brain.getOnboardingSnapshot();
  return {
    ownerPersona: snapshot.persona ?? `${brain.config.owner} expects the system to think like the owner, protect focus, and refuse to claim done without proof.`,
    preferredReportFormat: snapshot.preferred_report_format ?? `${brain.config.owner} prefers concise, high-signal updates with status, proof, and next actions.`,
    communicationStyle: snapshot.communication_style ?? `${brain.config.owner} prefers direct language, explicit tradeoffs, and minimal fluff.`,
    qualityBar: snapshot.quality_bar ?? 'Work is only complete when evidence exists, key checks pass, and the result matches the original mission objective.',
    planningPlaybook: snapshot.planning_playbook ?? 'Clarify the goal, list constraints, define proof of done, execute in reversible steps, and run verification before finalizing.',
  };
}

export function buildOnboardingRequests(brain: BestBrain, answers: OnboardingAnswers): LearnRequest[] {
  const defaults = getOnboardingDefaults(brain);
  return [
    {
      mode: 'persona',
      title: ONBOARDING_MEMORY_TITLES.persona,
      content: trimOrFallback(answers.ownerPersona, defaults.ownerPersona),
      source: 'onboarding',
      owner: brain.config.owner,
      domain: 'best-brain',
      reusable: true,
      tags: ['persona', 'owner', 'onboarding'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: onboardingEvidenceRef('persona'),
    },
    {
      mode: 'preference',
      title: ONBOARDING_MEMORY_TITLES.reportFormat,
      content: trimOrFallback(answers.preferredReportFormat, defaults.preferredReportFormat),
      source: 'onboarding',
      owner: brain.config.owner,
      domain: 'best-brain',
      reusable: true,
      tags: ['preference', 'format', 'onboarding'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: onboardingEvidenceRef('report-format'),
    },
    {
      mode: 'preference',
      title: ONBOARDING_MEMORY_TITLES.communicationStyle,
      content: trimOrFallback(answers.communicationStyle, defaults.communicationStyle),
      source: 'onboarding',
      owner: brain.config.owner,
      domain: 'best-brain',
      reusable: true,
      tags: ['preference', 'communication', 'onboarding'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: onboardingEvidenceRef('communication-style'),
    },
    {
      mode: 'preference',
      title: ONBOARDING_MEMORY_TITLES.qualityBar,
      content: trimOrFallback(answers.qualityBar, defaults.qualityBar),
      source: 'onboarding',
      owner: brain.config.owner,
      domain: 'best-brain',
      reusable: true,
      tags: ['preference', 'quality-bar', 'onboarding'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: onboardingEvidenceRef('quality-bar'),
    },
    {
      mode: 'procedure',
      title: ONBOARDING_MEMORY_TITLES.planningPlaybook,
      content: trimOrFallback(answers.planningPlaybook, defaults.planningPlaybook),
      source: 'onboarding',
      owner: brain.config.owner,
      domain: 'best-brain',
      reusable: true,
      tags: ['procedure', 'planning', 'verification', 'onboarding'],
      confirmed_by_user: true,
      verified_by: 'user',
      evidence_ref: onboardingEvidenceRef('planning-playbook'),
    },
  ];
}

export async function runOnboarding(brain: BestBrain, answers: OnboardingAnswers): Promise<OnboardingResult> {
  const results: LearnResult[] = [];
  for (const request of buildOnboardingRequests(brain, answers)) {
    results.push(await brain.learn(request));
  }

  brain.store.setSetting('onboarding.completed', 'true');

  return {
    completed: true,
    results,
  };
}

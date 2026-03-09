import type { LearnRequest } from '../types.ts';

export interface SeedValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  mode: LearnRequest['mode'];
  title: string;
  message: string;
}

export interface SeedValidationResult {
  valid: boolean;
  total_requests: number;
  errors: SeedValidationIssue[];
  warnings: SeedValidationIssue[];
}

function pushIssue(
  issues: SeedValidationIssue[],
  severity: SeedValidationIssue['severity'],
  code: string,
  request: LearnRequest,
  message: string,
): void {
  issues.push({
    severity,
    code,
    mode: request.mode,
    title: request.title,
    message,
  });
}

export function validateCuratedSeedRequests(requests: LearnRequest[]): SeedValidationResult {
  const errors: SeedValidationIssue[] = [];
  const warnings: SeedValidationIssue[] = [];
  const titleKeys = new Set<string>();

  for (const request of requests) {
    const key = `${request.mode}:${request.title.trim().toLowerCase()}`;
    if (titleKeys.has(key)) {
      pushIssue(errors, 'error', 'duplicate_title', request, 'duplicate title detected within the same learn mode');
    } else {
      titleKeys.add(key);
    }

    if (!request.title.trim()) {
      pushIssue(errors, 'error', 'missing_title', request, 'title is required');
    }
    if (!request.content.trim()) {
      pushIssue(errors, 'error', 'missing_content', request, 'content is required');
    }
    if (!request.source?.trim()) {
      pushIssue(errors, 'error', 'missing_source', request, 'source is required for curated seed data');
    }
    if ((request.mode === 'persona' || request.mode === 'preference') && request.confirmed_by_user !== true) {
      pushIssue(errors, 'error', 'missing_confirmation', request, 'persona and preference seeds require confirmed_by_user=true');
    }
    if ((request.mode === 'persona' || request.mode === 'preference' || request.mode === 'procedure') && !request.verified_by) {
      pushIssue(errors, 'error', 'missing_verified_by', request, 'durable curated seeds must declare verified_by');
    }
    if ((request.evidence_ref?.length ?? 0) === 0) {
      pushIssue(errors, 'error', 'missing_evidence_ref', request, 'curated seeds must declare at least one evidence_ref');
    }
    if ((request.tags?.length ?? 0) === 0) {
      pushIssue(warnings, 'warning', 'missing_tags', request, 'tags are recommended for retrieval weighting and audits');
    }
  }

  return {
    valid: errors.length === 0,
    total_requests: requests.length,
    errors,
    warnings,
  };
}

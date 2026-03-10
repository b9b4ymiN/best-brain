import type {
  ConsultRequest,
  FailureInput,
  LearnRequest,
  MissionOutcomeInput,
  StrictMissionOutcomeInput,
  VerificationCompleteInput,
  VerificationStartInput,
} from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error(`${key} is required`);
  }

  return candidate.trim();
}

function readOptionalString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key];
  if (candidate == null || candidate === '') {
    return null;
  }

  if (typeof candidate !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  return candidate.trim();
}

function readOptionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const candidate = value[key];
  if (candidate == null) {
    return undefined;
  }

  if (typeof candidate !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }

  return candidate;
}

function readArray(value: Record<string, unknown>, key: string, required = false): unknown[] | undefined {
  const candidate = value[key];
  if (candidate == null) {
    if (required) {
      throw new Error(`${key} is required`);
    }

    return undefined;
  }

  if (!Array.isArray(candidate)) {
    throw new Error(`${key} must be an array`);
  }

  return candidate;
}

function readOptionalNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key];
  if (candidate == null) {
    return undefined;
  }

  if (typeof candidate !== 'number' || Number.isNaN(candidate)) {
    throw new Error(`${key} must be a number`);
  }

  return candidate;
}

function assertUniqueStrings(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} must be unique`);
    }
    seen.add(value);
  }
}

function assertObject(value: unknown, name = 'request body'): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }

  return value;
}

export function validateConsultRequest(value: unknown): ConsultRequest {
  const body = assertObject(value);
  return {
    query: readRequiredString(body, 'query'),
    mission_id: readOptionalString(body, 'mission_id'),
    domain: readOptionalString(body, 'domain'),
    limit: readOptionalNumber(body, 'limit'),
    consumer: readOptionalString(body, 'consumer') as ConsultRequest['consumer'] | undefined,
    bundle_profile: readOptionalString(body, 'bundle_profile') as ConsultRequest['bundle_profile'] | undefined,
  };
}

export function validateContextInput(value: unknown): {
  mission_id?: string | null;
  domain?: string | null;
  query?: string | null;
} {
  const body = assertObject(value);
  return {
    mission_id: readOptionalString(body, 'mission_id'),
    domain: readOptionalString(body, 'domain'),
    query: readOptionalString(body, 'query'),
  };
}

export function validateLearnRequestInput(value: unknown): LearnRequest {
  const body = assertObject(value);
  return {
    mode: readRequiredString(body, 'mode') as LearnRequest['mode'],
    title: readRequiredString(body, 'title'),
    content: readRequiredString(body, 'content'),
    source: readOptionalString(body, 'source') ?? undefined,
    confidence: readOptionalNumber(body, 'confidence'),
    owner: readOptionalString(body, 'owner') ?? undefined,
    domain: readOptionalString(body, 'domain'),
    reusable: readOptionalBoolean(body, 'reusable'),
    mission_id: readOptionalString(body, 'mission_id'),
    tags: readArray(body, 'tags') as string[] | undefined,
    supersedes: readOptionalString(body, 'supersedes'),
    verified_by: readOptionalString(body, 'verified_by') as LearnRequest['verified_by'] | undefined,
    evidence_ref: readArray(body, 'evidence_ref') as LearnRequest['evidence_ref'] | undefined,
    confirmed_by_user: readOptionalBoolean(body, 'confirmed_by_user'),
    memory_scope: readOptionalString(body, 'memory_scope') as LearnRequest['memory_scope'] | undefined,
    memory_layer: readOptionalString(body, 'memory_layer') as LearnRequest['memory_layer'] | undefined,
    memory_subtype: readOptionalString(body, 'memory_subtype') ?? undefined,
    entity_keys: readArray(body, 'entity_keys') as LearnRequest['entity_keys'] | undefined,
    entity_aliases: readArray(body, 'entity_aliases') as LearnRequest['entity_aliases'] | undefined,
    written_by: readOptionalString(body, 'written_by') as LearnRequest['written_by'] | undefined,
    owner_scope: readOptionalString(body, 'owner_scope') as LearnRequest['owner_scope'] | undefined,
    retrieval_weight: readOptionalNumber(body, 'retrieval_weight'),
    last_validated_at: readOptionalNumber(body, 'last_validated_at') ?? null,
    valid_until: readOptionalNumber(body, 'valid_until') ?? null,
  };
}

export function validateMissionOutcomeInput(value: unknown, missionId: string): MissionOutcomeInput {
  const body = assertObject(value);
  return {
    mission_id: missionId,
    objective: readRequiredString(body, 'objective'),
    result_summary: readRequiredString(body, 'result_summary'),
    evidence: readArray(body, 'evidence', true) as MissionOutcomeInput['evidence'],
    verification_checks: readArray(body, 'verification_checks', true) as MissionOutcomeInput['verification_checks'],
    status: readOptionalString(body, 'status') as MissionOutcomeInput['status'],
    domain: readOptionalString(body, 'domain'),
    reused_memory_ids: readArray(body, 'reused_memory_ids') as string[] | undefined,
  };
}

export function validateMissionOutcomeToolInput(value: unknown): MissionOutcomeInput {
  const body = assertObject(value);
  return {
    mission_id: readRequiredString(body, 'mission_id'),
    objective: readRequiredString(body, 'objective'),
    result_summary: readRequiredString(body, 'result_summary'),
    evidence: readArray(body, 'evidence', true) as MissionOutcomeInput['evidence'],
    verification_checks: readArray(body, 'verification_checks', true) as MissionOutcomeInput['verification_checks'],
    status: readOptionalString(body, 'status') as MissionOutcomeInput['status'],
    domain: readOptionalString(body, 'domain'),
    reused_memory_ids: readArray(body, 'reused_memory_ids') as string[] | undefined,
  };
}

export function validateMissionOutcomeStrictInput(value: unknown): StrictMissionOutcomeInput {
  const body = assertObject(value);
  const evidence = readArray(body, 'evidence', true) as MissionOutcomeInput['evidence'];
  const verificationChecks = readArray(body, 'verification_checks', true) as MissionOutcomeInput['verification_checks'];
  const status = readRequiredString(body, 'status');
  const domain = readRequiredString(body, 'domain');

  if (evidence.length === 0) {
    throw new Error('strict mission outcome requires at least one evidence artifact');
  }
  if (verificationChecks.length === 0) {
    throw new Error('strict mission outcome requires at least one verification check');
  }
  if (status !== 'in_progress' && status !== 'awaiting_verification') {
    throw new Error('strict mission outcome status must be in_progress or awaiting_verification');
  }

  assertUniqueStrings(
    evidence.map((artifact) => {
      if (!isRecord(artifact)) {
        throw new Error('evidence items must be objects');
      }
      return `${readRequiredString(artifact, 'type')}:${readRequiredString(artifact, 'ref')}`;
    }),
    'evidence refs',
  );
  assertUniqueStrings(
    verificationChecks.map((check) => {
      if (!isRecord(check)) {
        throw new Error('verification_checks items must be objects');
      }
      return readRequiredString(check, 'name');
    }),
    'verification check names',
  );

  return {
    mission_id: readRequiredString(body, 'mission_id'),
    objective: readRequiredString(body, 'objective'),
    result_summary: readRequiredString(body, 'result_summary'),
    evidence,
    verification_checks: verificationChecks,
    status: status as StrictMissionOutcomeInput['status'],
    domain,
    reused_memory_ids: readArray(body, 'reused_memory_ids') as string[] | undefined,
  };
}

export function validateFailureInput(value: unknown): FailureInput {
  const body = assertObject(value);
  return {
    title: readRequiredString(body, 'title'),
    cause: readRequiredString(body, 'cause'),
    lesson: readRequiredString(body, 'lesson'),
    prevention: readRequiredString(body, 'prevention'),
    mission_id: readOptionalString(body, 'mission_id'),
    domain: readOptionalString(body, 'domain'),
    confirmed: readOptionalBoolean(body, 'confirmed'),
    evidence_ref: readArray(body, 'evidence_ref') as FailureInput['evidence_ref'] | undefined,
  };
}

export function validateVerificationStartInput(value: unknown): VerificationStartInput {
  const body = assertObject(value);
  return {
    mission_id: readRequiredString(body, 'mission_id'),
    requested_by: readOptionalString(body, 'requested_by') ?? undefined,
    checks: readArray(body, 'checks') as VerificationStartInput['checks'] | undefined,
  };
}

export function validateVerificationCompleteInput(value: unknown): VerificationCompleteInput {
  const body = assertObject(value);
  const missionId = readOptionalString(body, 'mission_id');
  const verificationRunId = readOptionalString(body, 'verification_run_id');
  if (!missionId && !verificationRunId) {
    throw new Error('mission_id or verification_run_id is required');
  }

  return {
    mission_id: missionId ?? undefined,
    verification_run_id: verificationRunId ?? undefined,
    status: readRequiredString(body, 'status') as VerificationCompleteInput['status'],
    summary: readOptionalString(body, 'summary') ?? undefined,
    evidence: readArray(body, 'evidence', true) as VerificationCompleteInput['evidence'],
    verification_checks: readArray(body, 'verification_checks', true) as VerificationCompleteInput['verification_checks'],
  };
}

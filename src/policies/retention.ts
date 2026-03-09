import type { MemoryType, RetentionProfile } from '../types.ts';
import { addDays } from '../utils/time.ts';

export const RETENTION_PROFILES: Record<MemoryType, RetentionProfile> = {
  Persona: {
    persistence: 'persistent',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: false,
    versioned: true,
  },
  Preferences: {
    persistence: 'persistent',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: false,
    versioned: true,
  },
  Procedures: {
    persistence: 'persistent',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: false,
    versioned: true,
  },
  DomainMemory: {
    persistence: 'persistent',
    reviewEveryDays: 180,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: false,
    versioned: true,
  },
  RepoMemory: {
    persistence: 'semi-persistent',
    reviewEveryDays: null,
    staleAfterDays: 30,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: false,
    versioned: true,
  },
  MissionMemory: {
    persistence: 'semi-persistent',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: 180,
    ttlDays: null,
    recentPriority: true,
    confirmedOnly: false,
    versioned: true,
  },
  FailureMemory: {
    persistence: 'persistent',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: null,
    recentPriority: false,
    confirmedOnly: true,
    versioned: true,
  },
  WorkingMemory: {
    persistence: 'ttl',
    reviewEveryDays: null,
    staleAfterDays: null,
    archiveAfterDays: null,
    ttlDays: 14,
    recentPriority: true,
    confirmedOnly: false,
    versioned: false,
  },
};

export function getRetentionProfile(memoryType: MemoryType): RetentionProfile {
  return RETENTION_PROFILES[memoryType];
}

export function deriveLifecycle(memoryType: MemoryType, timestamp: number): {
  review_due_at: number | null;
  stale_after_at: number | null;
  archive_after_at: number | null;
  expires_at: number | null;
} {
  const profile = getRetentionProfile(memoryType);

  return {
    review_due_at: addDays(timestamp, profile.reviewEveryDays),
    stale_after_at: addDays(timestamp, profile.staleAfterDays),
    archive_after_at: addDays(timestamp, profile.archiveAfterDays),
    expires_at: addDays(timestamp, profile.ttlDays),
  };
}

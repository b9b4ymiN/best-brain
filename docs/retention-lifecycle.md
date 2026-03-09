# Retention Lifecycle

## Policy table

| Memory type | Lifecycle |
| --- | --- |
| `Persona` | persistent |
| `Preferences` | persistent |
| `Procedures` | persistent, versioned |
| `DomainMemory` | persistent, review every 180 days |
| `RepoMemory` | semi-persistent, stale-check after 30 days |
| `MissionMemory` | recent-priority, archive after 180 days |
| `FailureMemory` | persistent only when confirmed |
| `WorkingMemory` | TTL 14 days by default |

## How lifecycle maps to fields

- `review_due_at`: next explicit review checkpoint
- `stale_after_at`: freshness boundary where ranking penalties apply
- `archive_after_at`: point where records are archived
- `expires_at`: point where temporary records expire
- `archived_at`: actual archive timestamp

## Runtime behavior

- maintenance runs during retrieval
- expired `WorkingMemory` moves from `active` to `expired`
- archived `MissionMemory` moves from `active` to `archived`
- archived non-mission memories are excluded from default retrieval
- stale `RepoMemory` is not deleted, but receives ranking penalties and a `stale-check due` exclusion reason in traces

## Design intent

- `WorkingMemory` is cheap and disposable
- `MissionMemory` is prioritized for recent operational recall, not permanent prominence
- `FailureMemory` only becomes durable when confirmed
- durable memory remains inspectable through `memory_versions` even after newer versions supersede old records

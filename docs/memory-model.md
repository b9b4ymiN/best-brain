# Memory Model

## Taxonomy

The v1 brain stores eight memory types:

- `Persona`
- `Preferences`
- `Procedures`
- `DomainMemory`
- `RepoMemory`
- `MissionMemory`
- `FailureMemory`
- `WorkingMemory`

## Durable vs working memory

- `WorkingMemory` is temporary and TTL-based
- `MissionMemory` is durable enough for recent mission recall, then archived
- `Persona`, `Preferences`, `Procedures`, `FailureMemory`, `DomainMemory`, and active `RepoMemory` are durable memory

## Required metadata

Every memory record carries:

- `memory_type`
- `source`
- `confidence`
- `owner`
- `domain`
- `reusable`
- `supersedes`
- `mission_id`
- `tags`
- `status`
- `verified_by`
- `evidence_ref`
- `version`
- `review_due_at`
- `stale_after_at`
- `archive_after_at`
- `expires_at`
- `archived_at`
- `created_at`
- `updated_at`

## Verification metadata

- `verified_by` identifies why a memory is trusted
- supported values: `user`, `test`, `verifier`, `trusted_import`, `system_inference`
- `evidence_ref` points to artifacts that can be checked later, such as test output, file paths, proof notes, or import IDs
- durable proof references are also normalized into the `verification_artifacts` registry for mission-aware lookup

## Versioning and superseding

- every write creates or updates a row in `memory_items`
- every accepted write also records a row in `memory_versions`
- changed durable memories create a successor and mark the older memory as `superseded`
- identical writes can merge into the same memory and increment `version`

## Learn modes

Public learn modes are:

- `persona`
- `preference`
- `procedure`
- `mission_outcome`
- `failure_lesson`
- `working_memory`

Guardrails:

- `persona` and `preference` require `confirmed_by_user=true`
- `failure_lesson` stays `candidate` unless confirmed
- `mission_outcome` stores proof artifacts but does not imply completion until verification passes

## Schema anchors

Primary tables:

- `memory_items`
- `memory_versions`
- `memory_edges`
- `missions`
- `mission_events`
- `verification_runs`
- `verification_artifacts`
- `retrieval_traces`
- `learning_events`

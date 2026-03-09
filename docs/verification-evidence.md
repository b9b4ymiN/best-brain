# Verification Evidence

## Evidence kinds

Supported artifact types in v1:

- `file`
- `test`
- `note`
- `url`
- `import`
- `other`

Each artifact is stored as:

- `type`
- `ref`
- optional `description`

## Verification checks

Each verification check records:

- `name`
- `passed`
- optional `detail`

Checks are stored in `verification_runs.verification_checks`.

## Completion proof rules

`verified_complete` is allowed only when:

- a verification run exists
- at least one evidence artifact exists
- all verification checks passed
- the mission transitions through `awaiting_verification`

## Failure and rejection semantics

- `verification_failed`: retryable verification failure; mission can go back to `in_progress`
- `rejected`: result or mission rejected by policy, scope, or acceptance bar

## Verification side effects

- verification writes to `verification_runs`
- evidence is normalized into the `verification_artifacts` registry
- mission history receives `verification_started`, `verification_completed`, and `reopened` events
- verified mission outcome memory is upgraded with `verified_by=verifier` and merged evidence
- orphan detection is exposed through `VerificationArtifactRegistrySnapshot.orphan_count`

## Minimum proof bar for v1

Every completed mission needs:

- one or more evidence artifacts
- one or more passing verification checks
- a persisted mission outcome
- a completion proof state that reports `verified_complete`
- registry entries that link artifacts back to the mission and, when available, the verification run and outcome memory

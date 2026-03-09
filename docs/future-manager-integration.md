# Future Manager Integration

## Canonical flow

Manager integration for brain v1 should follow this sequence:

1. call `consult` to get grounded context, `citations[]`, and `trace_id`
2. execute work outside the brain
3. call `save mission outcome` with a strict `MissionOutcomeInput` profile
4. call `start verification`
5. call `complete verification`
6. call `get mission context` to read proof state, mission history, and `verification_artifacts[]`

## Strict manager payloads

Manager-facing examples and tests use the strict mission outcome profile:

- `status` is required and must be `in_progress` or `awaiting_verification`
- `domain` is required
- `evidence[]` must be non-empty
- `verification_checks[]` must be non-empty
- evidence refs must be unique within the payload
- verification check names must be unique within the payload

The raw HTTP and MCP transports stay backward-compatible in brain v1. Strict validation is a manager integration rule, not a breaking transport change.

## Canonical example files

Generated examples live in `docs/examples/manager/`:

- `consult-response.json`
- `mission-outcome-input.json`
- `mission-outcome-input.strict.json`
- `mission-context-bundle.json`
- `verification-start.json`
- `verification-complete.json`
- `completion-proof-state.json`
- `verification-artifact-registry.json`
- `learn-reject.json`

## Manager rules

- treat `citations[]` as the manager-visible grounding surface
- treat `trace_id` as the retrieval debug handle
- do not treat `save mission outcome` as proof of completion
- only treat `verified_complete` as done
- when verification fails, resume work and re-enter verification instead of inventing a final answer
- when reading recent mission context, trust the latest verified mission before stale or unverified mission notes

# Transport Contracts

## Freeze policy

Brain v1 freezes current HTTP endpoints and MCP tool names as additive-only contracts. Existing names and required fields must not change.

## HTTP endpoints

- `GET /health`
- `POST /brain/consult`
- `POST /brain/learn`
- `GET /brain/context`
- `POST /missions/:id/outcome`
- `POST /failures`
- `POST /verification/start`
- `POST /verification/complete`
- `GET /preferences/format`

## MCP tools

- `brain_consult`
- `brain_learn`
- `brain_context`
- `brain_save_outcome`
- `brain_save_failure`
- `brain_verify`

## Semantics

- `/brain/learn` policy rejection stays `200` with `LearnResult.accepted=false`
- malformed input or invalid state transitions return `400 { "error": "..." }`
- MCP execution errors return `isError=true` with a short text message

## Required response fields

`ConsultResponse`:

- `answer`
- `memory_ids`
- `policy_path`
- `confidence_band`
- `followup_actions`
- `trace_id`

`LearnResult`:

- `accepted`
- `action`
- `reason`
- `memory_id`
- `memory_type`
- `status`

`MissionContextBundle`:

- `mission`
- `history`
- `working_memory`
- `durable_memory`
- `planning_hints`
- `preferred_format`
- `verification_state`

## Examples

### Consult success

```json
{
  "answer": "Consult intent: preference_lookup.\n- [Preferences] Preferred report format: owner prefers concise, high-signal updates.",
  "memory_ids": ["mem_123"],
  "policy_path": "deterministic.preference_lookup.v1",
  "confidence_band": "high",
  "followup_actions": [
    "Answer in the preferred format.",
    "Only update preferences after confirmation from the owner."
  ],
  "trace_id": "trace_123"
}
```

### Learn policy rejection

```json
{
  "accepted": false,
  "action": "rejected",
  "reason": "persona updates require confirmed_by_user=true",
  "memory_id": null,
  "memory_type": null,
  "status": null
}
```

### Verification start

```json
{
  "mission_id": "mission-1",
  "status": "awaiting_verification",
  "verification_run_id": "vrun_123",
  "evidence_count": 0,
  "checks_passed": 1,
  "checks_total": 1
}
```

### Verification complete

```json
{
  "mission_id": "mission-1",
  "status": "verified_complete",
  "verification_run_id": "vrun_123",
  "evidence_count": 1,
  "checks_passed": 1,
  "checks_total": 1
}
```

### Verification failed retry

```json
{
  "mission_id": "mission-1",
  "status": "verification_failed",
  "verification_run_id": "vrun_123",
  "evidence_count": 0,
  "checks_passed": 0,
  "checks_total": 1
}
```

### Rejected mission case

```json
{
  "error": "Mission not found: missing-mission"
}
```

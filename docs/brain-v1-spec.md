# Brain v1 Spec

## Mission-ready Brain

In `best-brain`, `Mission-ready Brain` means the system can:

- store mission context and mission history
- track verification state and proof artifacts
- return planning hints and preferred report format
- store outcomes and failure lessons
- separate working memory from durable memory
- serve stable HTTP and MCP interfaces to a future manager

It does not plan, dispatch, or review workers on its own in v1.

## Core rules

- local-first runtime and state
- personal brain is the source of truth
- workers are executors, not the main identity
- large work requires a verification loop
- `done` must be proven, not asserted
- persona and preferences only change with explicit confirmation

## Boundaries

Brain v1 is responsible for:

- memory storage and retrieval
- mission context assembly
- mission outcome persistence
- failure lesson persistence
- verification proof state
- stable contracts for HTTP and MCP callers

Brain v1 is not responsible for:

- worker orchestration
- autonomous mission execution
- desktop GUI
- multi-user collaboration
- cloud-first hosting

## Mission state semantics

Allowed mission path:

- `draft -> in_progress -> awaiting_verification -> verified_complete`
- `draft -> in_progress -> awaiting_verification -> verification_failed -> in_progress`
- `draft -> in_progress -> awaiting_verification -> rejected`

State meanings:

- `verification_failed`: verification did not pass, but the mission can continue after fixes
- `rejected`: the mission or result was rejected for policy, scope, or acceptance reasons
- `verified_complete`: evidence exists, checks passed, and the result can be treated as complete

## Non-goals for v1

- no worker orchestration
- no autonomous mission execution
- no desktop GUI
- no vector-first retrieval optimization
- no automatic persona learning from normal chat
- no strict upstream sync discipline with `oracle-v2`
- no multi-user mode
- no cloud-first deployment

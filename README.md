# best-brain

`best-brain` is a local-first mission-ready personal brain. It stores persona, memory, mission context, verification state, and durable lessons in one place. It is not a manager or worker orchestrator yet; it exposes stable HTTP and MCP contracts so a future manager layer can call into the brain.

## What v1 means

`Mission-ready Brain` in this repo means:

- it can store mission context and mission history
- it can track verification state and proof artifacts
- it can return planning hints and preferred report format
- it can store outcomes and failure lessons
- it can separate working memory from durable memory
- it is callable by a future manager, but it is not the manager itself

## Manager alpha

Manager alpha is now available as a CLI-first layer on top of the brain HTTP contract. It is intentionally thin:

- it classifies goals into `chat`, `task`, or `mission`
- it consults the brain over HTTP before acting
- it supports one primary worker at a time: `claude` or `codex`
- it owns the verification gate and proof-chain write-back
- it is not a swarm, browser manager, mail agent, or autonomous daemon

## Layout

- `brain/oracle-core`: vendored `oracle-v2` pinned for internal divergence
- `src`: runtime, schema, policies, eval helpers, services, transports
- `scripts`: onboarding, eval, MCP smoke, Claude smoke, seed helpers
- `tests`: contract, retrieval, onboarding, eval, MCP, and HTTP tests
- `docs`: frozen brain-v1 spec, memory model, retention, verification, transport, exit criteria

## Install and run

```bash
bun install
bun run server
```

The HTTP server defaults to `http://localhost:47888`.

## Operator commands

```bash
bun run typecheck
bun run test
bun run validate:seeds
bun run onboard
bun run eval:consult
bun run eval:consult:bless
bun run eval:seed
bun run examples:manager
bun run smoke:bootstrap
bun run smoke:bootstrap:proof -- --os-label windows
bun run smoke:mcp
bun run smoke:claude
bun run manager -- "Plan the next mission using the latest mission proof."
bun run smoke:manager
bun run smoke:manager:claude
bun run smoke:manager:codex
```

## HTTP contract

Current v1 endpoints:

- `GET /health`
- `POST /brain/consult`
- `POST /brain/learn`
- `GET /brain/context`
- `POST /missions/:id/outcome`
- `POST /failures`
- `POST /verification/start`
- `POST /verification/complete`
- `GET /preferences/format`

Contract semantics:

- policy rejection on `/brain/learn` stays `200` with `accepted=false`
- malformed input and invalid transitions return `400 { "error": "..." }`
- `verified_complete` requires evidence and passing verification checks
- consult responses include first-class `citations[]`
- mission context includes `verification_artifacts[]`

## MCP contract

Tracked project-scoped config lives in [`.mcp.json`](./.mcp.json). Current tool names:

- `brain_consult`
- `brain_learn`
- `brain_context`
- `brain_save_outcome`
- `brain_save_failure`
- `brain_verify`

Tool errors return `isError=true` with a short text message. Set `BEST_BRAIN_MCP_DEBUG=1` to emit debug logs to `stderr`.

## Normal usage

### HTTP flow

1. `bun run server`
2. Call `/brain/consult` for grounded guidance
3. Call `/brain/learn` for structured writes
4. Save mission outcome with `/missions/:id/outcome`
5. Start and complete verification through `/verification/start` and `/verification/complete`
6. Use `/brain/context` to retrieve mission context plus artifact registry entries

### Claude Code flow

Project-scoped MCP is already declared in `.mcp.json`. In this repo, the normal Claude Code path is:

```bash
claude -p --strict-mcp-config --mcp-config .mcp.json --allow-dangerously-skip-permissions --dangerously-skip-permissions --allowedTools mcp__best-brain__brain_consult "Use the best-brain MCP tool brain_consult before you answer."
```

For a deterministic local smoke run, use:

```bash
bun run smoke:claude
```

### Manager alpha flow

The normal manager operator path is:

```bash
bun run manager -- "Implement the next manager proof-chain improvement."
```

Useful flags:

```bash
bun run manager -- "Analyze the repo and suggest the next mission." --worker=claude --json
bun run manager -- "Implement the next verification improvement." --worker=codex --mission-id=mission_manager_alpha
bun run manager -- "Plan the next mission using the latest mission proof." --dry-run --json
bun run manager -- "Review the preferred report format." --no-execute
```

Manager alpha always uses the brain HTTP API as its canonical adapter. It will auto-start the local brain server if `/health` is not available.

For note-only missions, manager alpha can normalize usable freeform worker output into a note artifact plus a verification check. That keeps analysis-style `claude` and `codex` runs verifiable without pretending a file or test artifact exists.

## Manager examples

Generated manager-facing examples live in `docs/examples/manager/`. Refresh them with:

```bash
bun run examples:manager
```

## Docs

- [Brain Spec](./docs/brain-v1-spec.md)
- [Memory Model](./docs/memory-model.md)
- [Retention Lifecycle](./docs/retention-lifecycle.md)
- [Verification Evidence](./docs/verification-evidence.md)
- [Transport Contracts](./docs/transport-contracts.md)
- [V1 Exit Criteria](./docs/v1-exit-criteria.md)
- [Future Manager Integration](./docs/future-manager-integration.md)
- [Vendored oracle-core notes](./docs/vendor-oracle-core.md)

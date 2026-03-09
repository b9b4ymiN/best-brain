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
bun run onboard
bun run eval:consult
bun run smoke:mcp
bun run smoke:claude
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

### Claude Code flow

Project-scoped MCP is already declared in `.mcp.json`. In this repo, the normal Claude Code path is:

```bash
claude -p --strict-mcp-config --mcp-config .mcp.json --allow-dangerously-skip-permissions --dangerously-skip-permissions --allowedTools mcp__best-brain__brain_consult "Use the best-brain MCP tool brain_consult before you answer."
```

For a deterministic local smoke run, use:

```bash
bun run smoke:claude
```

## Docs

- [Brain Spec](./docs/brain-v1-spec.md)
- [Memory Model](./docs/memory-model.md)
- [Retention Lifecycle](./docs/retention-lifecycle.md)
- [Verification Evidence](./docs/verification-evidence.md)
- [Transport Contracts](./docs/transport-contracts.md)
- [V1 Exit Criteria](./docs/v1-exit-criteria.md)
- [Vendored oracle-core notes](./docs/vendor-oracle-core.md)

# best-brain

`best-brain` is a local-first AI work operating system.

Its final concept is:

> think like me, work for me, finish for real

In concrete terms, `best-brain` is meant to become:

- a persona-aware personal brain
- an AI mission manager
- a worker fabric for tools such as Claude Code, Codex, Browser, Shell, and Mail
- a local runtime that can act on the user's machine
- a control surface for inspecting, steering, and approving work

The repo does not implement the whole target system yet. The current state is:

- `Brain v1`: implemented and verified
- `Manager alpha`: implemented as a CLI-first, HTTP-backed manager with one primary worker at a time
- `Worker swarm`, `runtime OS`, and `control room UI`: only partially present or still planned

## Final concept

`best-brain` is not a chatbot, not a thin agent wrapper, and not a generic orchestration tool.

It is intended to be:

- a local AI operating system that embodies the user's persona
- a system that chooses between chat, task, and mission execution paths
- a manager that does not trust worker claims of completion without proof
- a local operator that can read files, run commands, inspect outputs, and close work with evidence

Non-negotiable rules:

- local-first by default
- a single user goal can trigger a full mission flow
- Claude Code and Codex are workers, not the main identity
- personal brain is the source of truth
- large work requires verification loops
- `done` must be proven, not merely asserted

## Current implementation boundary

What exists now:

- brain HTTP and MCP contracts
- persona, preference, mission, failure, and verification memory
- manager alpha with `chat`, `task`, and `mission` routing
- manager beta rails for `MissionBrief` validation, goal ambiguity detection, mission graph compilation, and playbook-guided verification
- one-primary-worker execution with `claude` or `codex`
- proof-chain persistence: outcome, verification start, verification complete, failure lesson

What does not exist yet:

- worker swarm orchestration
- browser worker, mail worker, or full runtime operator layer
- control room web UI
- autonomous multi-step operator mode
- full repair-loop maturity across multiple workers

## Modes

- `Chat Mode`: answer, explain, summarize, brainstorm
- `Task Mode`: bounded work with one or two workers and light verification
- `Mission Mode`: planning, execution, verification, repair, and final proof of done

## Layout

- `brain/oracle-core`: vendored `oracle-v2` pinned for internal divergence
- `src`: current implementation for brain, manager alpha, transports, policies, and eval helpers
- `scripts`: onboarding, eval, manager/operator smokes, MCP/Claude smokes, seed helpers
- `tests`: contract, retrieval, onboarding, eval, MCP, HTTP, and manager tests
- `docs`: project vision, system architecture, roadmap, brain-v1 subsystem specs, and transport contracts

## Install and run

```bash
bun install
bun run server
```

The brain HTTP server defaults to `http://localhost:47888`.

## Current operator commands

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
bun run smoke:manager:ambiguity
bun run proof:manager
bun run examples:program
bun run scorecard:program
```

## Current entrypoints

Brain HTTP:

- `GET /health`
- `POST /brain/consult`
- `POST /brain/learn`
- `GET /brain/context`
- `POST /missions/:id/outcome`
- `POST /failures`
- `POST /verification/start`
- `POST /verification/complete`
- `GET /preferences/format`

Brain MCP:

- `brain_consult`
- `brain_learn`
- `brain_context`
- `brain_save_outcome`
- `brain_save_failure`
- `brain_verify`

Manager CLI:

- `bun run manager -- "<goal>"`

## Normal usage

### Brain HTTP flow

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

Manager alpha now also blocks materially ambiguous execution goals before dispatch. That rail is part of the proof path and can be checked with:

```bash
bun run smoke:manager:ambiguity
```

## Repo direction

The target system architecture has five long-term pillars:

- `Persona Brain`
- `AI Mission Manager`
- `Worker Swarm`
- `Runtime OS`
- `Control Surface`

The current repo is strongest in the first two:

- `Persona Brain`: real implementation
- `Mission Manager`: alpha implementation
- `Worker Swarm`: early adapters only
- `Runtime OS`: still emerging
- `Control Surface`: not built yet

## Program lock

The 90-day program is now frozen around:

- success bar: `Repeatable One-Mission`
- proving mission: `Thai equities daily stock scanner`
- execution style: `general engine + reusable playbooks`
- data strategy: `live-data-first` through adapter selection, not hard-coded source logic
- control surface target: `full mission console`

## Manager examples

Generated manager-facing examples live in `docs/examples/manager/`. Refresh them with:

```bash
bun run examples:manager
```

Generated program-facing examples live in `docs/examples/program/`. Refresh them with:

```bash
bun run examples:program
```

Generate the current program scorecard with:

```bash
bun run scorecard:program
```

## Docs

- [Final Concept](./docs/vision/final-concept.md)
- [System Overview](./docs/architecture/system-overview.md)
- [Master Roadmap](./docs/roadmap/master-plan.md)
- [90-Day Execution](./docs/roadmap/90-day-execution.md)
- [Contracts Freeze](./docs/architecture/contracts-freeze.md)
- [Measurement Plan](./docs/metrics/measurement-plan.md)
- [Brain Spec](./docs/brain-v1-spec.md)
- [Memory Model](./docs/memory-model.md)
- [Retention Lifecycle](./docs/retention-lifecycle.md)
- [Verification Evidence](./docs/verification-evidence.md)
- [Transport Contracts](./docs/transport-contracts.md)
- [V1 Exit Criteria](./docs/v1-exit-criteria.md)
- [Future Manager Integration](./docs/future-manager-integration.md)
- [Vendored oracle-core notes](./docs/vendor-oracle-core.md)

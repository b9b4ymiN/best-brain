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
- `First demo / acceptance mission`: implemented and locally proven with the Thai equities stock-scanner mission
- `Actual manager-led stock mission`: implemented and locally proven from one user goal through persona-memory recall, manager-derived planning, worker control, and proof-driven closeout
- `Repeatable One-Mission`: implemented and locally proven over the acceptance run set
- `First local mission console`: implemented and locally proven on top of real manager/runtime state
- `Worker swarm` and full `runtime OS`: only partially present or still planned

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
- one-primary-worker execution with `claude`, `codex`, or `shell`
- proof-chain persistence: outcome, verification start, verification complete, failure lesson

What does not exist yet:

- worker swarm orchestration
- browser worker, mail worker, or full runtime operator layer
- full control room maturity with live streaming and long-running mission steering
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

Normal browser chat lives at:

```text
http://localhost:47888/
```

## Current operator commands

```bash
bun run typecheck
bun run test
bun run validate:seeds
bun run onboard
bun run eval:consult
bun run eval:chat
bun run eval:consult:bless
bun run eval:seed
bun run examples:manager
bun run smoke:bootstrap
bun run smoke:bootstrap:proof -- --os-label windows
bun run smoke:mcp
bun run smoke:claude
bun run manager -- "Plan the next mission using the latest mission proof."
bun run smoke:manager
bun run smoke:manager:thin
bun run smoke:manager:claude
bun run smoke:manager:codex
bun run smoke:manager:ambiguity
bun run proof:manager
bun run proof:phase4
bun run proof:phase5
bun run proof:phase6
bun run proof:control-room
bun run proof:chat-memory
bun run examples:program
bun run proof:proving
bun run proof:bootstrap:matrix
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

Chat HTTP:

- `POST /chat/api/message`
- `POST /chat/api/message/stream`
- `POST /chat/api/message/run`
- `GET /chat/api/runs/:id`

Brain MCP:

- `brain_consult`
- `brain_learn`
- `brain_context`
- `brain_save_outcome`
- `brain_save_failure`
- `brain_verify`

Manager CLI:

- `bun run manager -- "<goal>"`

Control room:

- `GET /control-room`
- `GET /control-room/api/overview`
- `POST /control-room/api/launch`
- `GET /control-room/api/missions/:id`
- `POST /control-room/api/missions/:id/actions`

## Normal usage

### Brain HTTP flow

1. `bun run server`
2. Call `/brain/consult` for grounded guidance
3. Call `/brain/learn` for structured writes
4. Save mission outcome with `/missions/:id/outcome`
5. Start and complete verification through `/verification/start` and `/verification/complete`
6. Use `/brain/context` to retrieve mission context plus artifact registry entries

### Chat memory proof

To prove the AI can write to the brain through MCP and read it back through normal chat:

```bash
bun run proof:chat-memory
```

This uses the normal chat HTTP path, asks the AI to remember a name, asks the AI to recall it, and then verifies from the brain that the stored memory came from `chat://mcp-memory-write`.

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

Actual manager-led stock mission proof:

```bash
bun run manager -- "I want a Thai stock scanner system that matches how I invest. Figure out the criteria from my memory and return a verified owner-facing system plan." --json
```

Manager alpha always uses the brain HTTP API as its canonical adapter. It will auto-start the local brain server if `/health` is not available.

For note-only missions, manager alpha can normalize usable freeform worker output into a note artifact plus a verification check. That keeps analysis-style `claude` and `codex` runs verifiable without pretending a file or test artifact exists.

Manager alpha now also blocks materially ambiguous execution goals before dispatch. That rail is part of the proof path and can be checked with:

```bash
bun run smoke:manager:ambiguity
```

To verify manager beta multi-pattern mission compilation (repo change, analysis reporting, command execution), run:

```bash
bun run smoke:manager
```

### Control room flow

Run the normal local server:

```bash
bun run server
```

Then open:

```text
http://localhost:47888/control-room
```

The current control room is the first local mission console. It can:

- launch a mission from one goal
- inspect mission graph, timeline, workers, artifacts, verdict, and final report
- retry a mission through the manager path
- record operator approve/reject audit without bypassing kernel rails

For deterministic local proof, use:

```bash
bun run proof:control-room
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
- `Control Surface`: first local mission console exists, but it is still early

## Program lock

The 90-day program is now frozen around:

- success bar: `Repeatable One-Mission`
- first demo / acceptance mission: `Thai equities daily stock scanner`
- actual manager-led mission: `implemented and locally proven from one user goal`
- repeatability over the acceptance run set: `implemented and locally proven`
- first local mission console: `implemented and locally proven`
- next concept-critical phase: `harden the control surface beyond the first local mission console and expand beyond the first mission`
- execution style: `general engine + reusable playbooks`
- data strategy: `live-data-first` through adapter selection, not hard-coded source logic
- control surface target: `full mission console`

Current caveat:

- the controlled stock-scanner demo path is still separate from the actual manager-led path and remains useful as an acceptance harness
- the current concept-critical bar that is already proven locally is: repeat the actual one-goal mission across the acceptance set with stable memory reuse and no false completes
- the next bar is: expose this repeatable mission core through a real control surface and extend the same rails to broader mission types

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

Check cross-platform bootstrap proof coverage:

```bash
bun run proof:bootstrap:matrix
bun run proof:bootstrap:matrix -- --require-all
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

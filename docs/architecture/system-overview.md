# System Overview

## Five core pillars

### 1. Persona Brain

The persona brain answers:

- how the owner prefers to think
- how the owner wants work to be judged
- what format the owner prefers
- what procedures and playbooks should be reused
- what lessons from past missions should change current behavior

Current status:

- implemented as `Brain v1`
- stores persona, preferences, procedures, mission memory, failure memory, and verification state
- exposed through stable HTTP and MCP contracts

### 2. AI Mission Manager

The mission manager answers:

- whether the request is chat, task, or mission work
- what the mission brief should be
- which worker should act next
- whether the result should be retried, rejected, or verified

Current status:

- implemented as `Manager alpha`
- CLI-first
- HTTP-backed against the brain
- one primary worker at a time
- the current stock-scanner proof path is still a demo / acceptance mission, not the final manager-led mission behavior

### 3. Worker Swarm

Workers are the real executors.

Initial worker set:

- `Claude Code Worker`
- `Codex Worker`
- `Shell Worker`
- `Browser Worker`
- `Mail Worker`
- `Verifier Worker`

Current status:

- `Claude` and `Codex` primary worker adapters exist
- verifier behavior exists inside manager alpha
- browser, shell, mail, and richer verifier workers are still roadmap items

### 4. Runtime OS

The runtime OS is the system body.

It should eventually own:

- workspace management
- process management
- files and artifacts
- browser automation
- logs
- checkpoints
- rollback and recovery

Current status:

- local file/process behavior exists in slices
- no dedicated runtime module or operator isolation layer is finished yet

### 5. Control Surface

The control surface is how the owner interacts with the system.

Target surfaces:

- CLI
- web UI / control room
- chat UI
- future external interfaces such as Telegram

Current status:

- CLI paths exist
- no control room UI exists yet

## Routing model

`best-brain` should not force one flow on every request.

### Chat Mode

Use for:

- questions
- explanation
- summarization
- brainstorming

Expected behavior:

- fast response
- no worker swarm unless clearly necessary
- persona brain only when it adds value

### Task Mode

Use for:

- file reading and summary
- small repo inspection
- single command execution and analysis
- reading a page, inbox, or thread and extracting action items

Expected behavior:

- 1 or 2 workers
- minimal planning
- light verification

### Mission Mode

Use for:

- multi-step implementation
- repo repair
- report generation from several steps
- work that should not close until proof exists

Expected behavior:

- mission brief
- planning and task graph
- worker dispatch
- verification and repair loops
- final proof-driven closeout

## High-level flow

```text
[USER]
  |
  v
[CONTROL SURFACE]
  |
  v
[INTENT ROUTER]
  |
  +-- Chat Mode
  +-- Task Mode
  +-- Mission Mode
  |
  v
[MISSION MANAGER]
  |
  +-- consult Persona Brain
  +-- build mission brief
  +-- dispatch workers
  +-- collect artifacts
  +-- verify
  +-- repair or retry
  +-- finalize
  |
  v
[FINAL RESPONSE / REPORT]
```

## Current implementation truth

The repo should be read as:

- `final concept`: full local AI work operating system
- `current implementation`: brain-v1 plus manager alpha, with a proven demo / acceptance mission
- `next concept-critical milestone`: actual manager-led mission flow from one user goal, persona memory, self-generated plan, worker control, and proof-driven final answer
- `next growth path`: expand workers, runtime OS, and control surface without replacing the brain/manager core

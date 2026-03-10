# Master Plan

This document turns the final concept into the current project roadmap.

## Born-to-be target

`best-brain` should eventually let the owner state a goal once and have the system:

1. understand the goal in the owner's style
2. choose chat, task, or mission mode
3. plan the work
4. dispatch the right workers
5. execute on the local machine
6. verify the result
7. repair when verification fails
8. return a final report with proof

## Phase roadmap

### Phase 1 — Foundation

Goal:

- define the project correctly before scaling implementation

Key outputs:

- official final concept
- project-level architecture
- mission, task, state, and event models

Status:

- largely complete

### Phase 2 — Persona Brain

Goal:

- create the personal brain before attempting broad autonomy

Key outputs:

- persona, preference, procedure, mission, and failure memory
- consult, context, and learn interfaces
- verification state and proof chain

Status:

- strong progress
- brain-v1 exists and is verified

### Phase 3 — Mission Manager Core

Goal:

- turn user goals into controlled execution paths

Key outputs:

- intent router
- mission compiler
- planner
- dispatcher
- manager kernel
- review loop
- finalizer

Status:

- in progress through `Manager alpha`
- thin but real end-to-end flow exists

### Phase 4 — Worker Fabric

Goal:

- connect specialist workers under one contract

Key outputs:

- worker contract
- Claude adapter
- Codex adapter
- Shell worker
- Verifier worker

Status:

- partial
- Claude and Codex exist
- verifier behavior exists inside manager alpha
- Shell, Browser, Mail workers are still to be formalized

### Phase 5 — First Mission: Stock Scanner

Goal:

- prove the architecture against a real multi-step mission

Key outputs:

- stock brief intake
- mission planning
- Claude analysis
- Codex implementation
- Shell execution
- verifier review
- final report

Status:

- not started

### Phase 6 — Lightweight Chat

Goal:

- make normal conversation cheap and useful

Key outputs:

- chat mode
- lightweight manager path
- persona-aware response style

Status:

- partially available through manager/brain routing
- not mature as a dedicated chat surface yet

### Phase 7 — Browser + Mail Task Flow

Goal:

- start behaving like a real desktop operator

Key outputs:

- browser worker
- mail worker
- extraction/summarization flow
- extraction completeness verification

Status:

- not started

### Phase 8 — Control Room UI

Goal:

- make the system inspectable and steerable

Key outputs:

- chat panel
- task panel
- mission timeline
- worker status
- artifact view
- verifier view

Status:

- not started

### Phase 9 — Procedural Maturity

Goal:

- let the system improve from experience

Key outputs:

- mission outcomes
- worker performance history
- repair patterns
- successful playbooks
- routing by historical success

Status:

- partial foundations exist in memory and failure learning
- not mature yet

### Phase 10 — Operator Mode

Goal:

- approach the promise: work for me on my computer

Key outputs:

- stronger autonomy
- runtime isolation
- checkpoints and rollback
- confidence scoring
- multi-step local operator behavior

Status:

- not started

## Immediate next priorities

To stay aligned with the final concept, the next recommended order is:

1. harden manager alpha into a reliable mission manager beta
2. formalize worker fabric contracts for shell, verifier, browser, and mail
3. introduce a dedicated runtime layer for processes, artifacts, checkpoints, and rollback
4. prove the full architecture on one end-to-end mission such as the stock scanner
5. add the first control surface beyond CLI

## Measurement discipline to add now

The roadmap should explicitly carry these six controls while manager beta grows:

- `MissionBrief completeness validator`
- `Goal ambiguity detector`
- `Acceptance run set definition`
- `False-complete count`
- `Blocked-with-correct-reason rate`
- `No hidden human-in-the-loop steps` assumption

These are not optional polish items. They are part of how `best-brain` avoids looking successful while still depending on hidden operator rescue or incomplete mission briefs.

## Execution baseline

The concrete 90-day execution breakdown lives in:

- `docs/roadmap/90-day-execution.md`

Program-level score tracking lives in:

- `docs/metrics/measurement-plan.md`
- `artifacts/program-scorecard.latest.json`

## Scope discipline

The following should remain explicit while the project grows:

- brain is the identity anchor
- manager is the control layer
- workers are replaceable executors
- verification is mandatory
- local-first behavior wins over cloud-first convenience

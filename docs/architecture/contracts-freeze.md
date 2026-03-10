# Contracts Freeze

This document freezes the program-level contracts that later phases must build on.

## Frozen contract families

- `Brain`
  - consult
  - context
  - learn
  - mission outcome
  - failure lesson
  - verification
- `Manager`
  - input
  - routing decision
  - mission brief
  - execution request
  - verification request
  - run result
- `Worker`
  - task input
  - task result
  - artifacts
  - checks
  - retry recommendation
- `Runtime`
  - session
  - process run
  - artifact record
  - checkpoint record
  - event record
- `Proving Mission Framework`
  - mission definition
  - mission input spec
  - mission acceptance spec
  - mission report contract
  - input adapter definition
  - input adapter decision
  - acceptance run definition
  - acceptance run result
- `Control Surface`
  - mission launch request
  - mission console view
  - timeline entry
  - worker status card
  - judge verdict view
- `Market Data`
  - adapter candidate
  - selection policy
  - adapter decision

## Rules

- additive-only changes to public contracts
- no mission-specific stock-scanner glue code inside core contracts
- proving mission behavior must come from playbooks, prompts, and adapter policy
- manager and UI must not bypass kernel verification rails
- runtime artifacts and verifier output must stay linkable
- final report artifacts must be emitted only after verification resolves on proving mission runs
- manager beta must ship a `MissionBrief` completeness validator before mission readiness claims are trusted
- manager beta must ship a goal ambiguity detector before ambiguous goals are allowed to compile into missions
- the proving mission must have an explicit acceptance run set: `thai_equities_daily_controlled_acceptance_runs`
- acceptance proofs must assume `no_hidden_human_in_the_loop_steps`
- phase 3 proving-framework rails must not hardcode stock-scanner logic inside manager, kernel, or runtime
- phase 4 demo / acceptance proof does not count as the final mission path by itself
- phase 5 actual mission must start from one user goal, consult persona memory, derive its own criteria and plan, control workers end-to-end, and avoid demo-shortcut execution paths

## Current code anchors

- brain contracts: `src/types.ts`, `src/contracts.ts`
- manager contracts: `src/manager/types.ts`
- proving mission contracts: `src/proving/types.ts`
- worker contracts: `src/workers/types.ts`
- runtime contracts: `src/runtime/types.ts`
- control-room contracts: `src/control-room/types.ts`
- market-data contracts: `src/market/types.ts`

## Example libraries

- manager examples: `docs/examples/manager/`
- program examples: `docs/examples/program/`

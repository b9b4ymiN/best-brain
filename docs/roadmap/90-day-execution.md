# 90-Day Execution Plan

This is the delivery breakdown for the first success bar: `Repeatable One-Mission`.

## Day 0-15: Program Lock

Outputs:

- final concept locked
- system overview locked
- contracts freeze locked
- measurement plan locked
- program scorecard baseline exists
- acceptance run set defined as `thai_equities_daily_controlled_acceptance_runs`
- explicit assumption locked: no hidden human-in-the-loop steps inside acceptance proofs

Exit:

- all five pillars are represented in docs or contracts
- no unresolved ambiguity about success bar or proving mission
- no acceptance claim depends on undocumented manual rescue or operator-only judgment

## Day 16-35: Manager Beta Rails

Outputs:

- manager mission graph primitives
- reusable playbook contract
- stronger routing and mission compilation rails
- decision-safe review and retry model
- MissionBrief completeness validator
- goal ambiguity detector before mission compilation

Exit:

- manager can build a mission graph from one goal
- no illegal completion path exists
- manager can block or request clarification when the goal is materially ambiguous
- mission briefs can be scored for completeness instead of being trusted implicitly

## Day 36-55: Worker Fabric and Runtime Spine

Outputs:

- worker contract formalized
- shell/verifier runtime path formalized
- claude/codex/shell/verifier worker fabric registry active
- session/process/artifact/checkpoint/event contracts active
- manager proof artifact captured locally

Exit:

- one-worker paths are stable
- runtime artifacts and verifier evidence stay linked
- worker invocation metadata is captured across Claude, Codex, and Shell
- checkpoint restore is proven on more than one worker path

## Day 56-75: Proving Mission Framework

Outputs:

- generic proving mission definitions
- reusable mission report contract
- generic input/data adapter selection policy
- acceptance harness for success, blocked, stale-input, and retryable-failure runs
- proof-chain rules that do not depend on stock-specific manager branches

Exit:

- proving mission definitions validate
- generic acceptance harness passes curated runs
- blocked missions fail closed with a correct explicit reason instead of drifting into false completion
- final reports are emitted only after verification path resolves
- no stock-specific logic exists inside manager, kernel, or runtime paths

## Day 76-90: First Demo / Acceptance Mission and Repeatability

Outputs:

- first proving mission: `Thai equities daily stock scanner`
- demo / acceptance proof for success, blocked, retryable, and memory-reuse paths
- repeated proving mission runs
- memory reuse and repair hints visible across runs
- program scorecard updated with real repeated-run evidence
- false-complete count tracked in the scorecard
- blocked-with-correct-reason rate tracked in the scorecard

Exit:

- first proving mission completes end-to-end under controlled runs
- repeated proving mission reaches the success bar
- acceptance run set evidence is strong enough to distinguish real blocked runs from silent failures

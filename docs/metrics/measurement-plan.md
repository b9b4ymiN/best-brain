# Measurement Plan

This document turns the 90-day program into measurable gates.

## North-star metrics

- `Single-goal-to-verified-complete rate`
- `Median time from goal to verified report`
- `Repeat-run success rate for the proving mission`
- `Owner usefulness score`

## Brain metrics

- routing accuracy
- top-k relevance
- citation completeness
- usefulness median
- groundedness median
- persona alignment median
- actionability median
- orphan evidence count

Current local source:

- `artifacts/consult-eval.latest.json`
- `artifacts/seed-comparison.latest.json`

## Manager metrics

- thin manager path pass
- Claude primary worker path pass
- Codex primary worker path pass
- mission brief completeness
- goal ambiguity detector coverage
- illegal completion count
- false-complete count
- blocked-with-correct-reason rate
- verification loop correctness

Interpretation notes:

- `mission brief completeness` must come from a dedicated validator, not from worker self-report.
- `goal ambiguity detector coverage` means the manager can explicitly stop and ask for clarification before it commits to the wrong mission.
- `false-complete count` is stricter than `illegal completion count`; it counts cases that looked complete at first but were later disproved by verification or acceptance review.
- `blocked-with-correct-reason rate` measures whether the system fails closed with the right explanation when progress should stop.

Current local source:

- `artifacts/manager-proof.latest.json`
- manager tests and HTTP integration tests

## Runtime metrics

- first-run DB init success
- bootstrap proof captured per OS
- artifact lineage completeness
- checkpoint recovery success
- data freshness SLA compliance

Current local source:

- `artifacts/bootstrap-smoke.latest.json`
- `artifacts/bootstrap-proofs/*.json`

## Console metrics

- mission timeline completeness
- artifact visibility completeness
- verdict visibility completeness
- operator action latency
- zero direct state mutation outside manager kernel rails

Current local source:

- unavailable until control room exists

## Acceptance run set

The canonical proving-mission acceptance run set is:

- `thai_equities_daily_controlled_acceptance_runs`

Rules:

- it must be named before `Repeatable One-Mission` claims count
- it must include success, blocked, stale-data, and retry-after-failure cases
- it must be runnable without hidden manual rescue steps
- operator approvals and rejects may exist, but every required human touch must be explicit in the run definition and visible in artifacts

## Assumption discipline

The program currently assumes:

- `no_hidden_human_in_the_loop_steps`

This means a claimed success cannot rely on undocumented manual edits, silent terminal interventions, or out-of-band operator fixes between mission steps.

## Scorecard

Use `bun run scorecard:program` to generate:

- `artifacts/program-scorecard.latest.json`

That scorecard is the local baseline for current program readiness. It is expected to show:

- `Phase0_ProgramLock`: pass
- `Phase1_ManagerBeta`: partial
- `Phase2_WorkerFabricRuntimeSpine`: partial
- later phases: fail until implemented

The scorecard should also track these plan-critical signals even before they are fully instrumented:

- `mission_brief_completeness`
- `goal_ambiguity_detector`
- `acceptance_run_set_defined`
- `false_complete_count`
- `blocked_with_correct_reason_rate`
- `no_hidden_human_loop_assumption`

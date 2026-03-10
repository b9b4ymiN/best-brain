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
- Shell primary worker path pass
- mission brief completeness
- goal ambiguity detector coverage
- illegal completion count
- false-complete count
- blocked-with-correct-reason rate
- verification loop correctness
- proving mission definition valid
- generic acceptance harness pass rate
- phase-3 blocked reason accuracy
- report contract completeness
- adapter selection correctness
- mission demo without hidden steps
- actual single-goal mission pass
- actual persona-memory application
- actual manager-generated plan
- actual worker control end-to-end
- actual mission without demo shortcut
- repeatability verified-complete rate
- repeatability memory-reuse citation rate
- repeatability retry-recovery rate
- repeatability blocked-with-correct-reason rate
- repeatability false-complete count
- repeatability no-hidden-human-steps

Interpretation notes:

- `mission brief completeness` must come from a dedicated validator, not from worker self-report.
- `goal ambiguity detector coverage` means the manager can explicitly stop and ask for clarification before it commits to the wrong mission.
- `false-complete count` is stricter than `illegal completion count`; it counts cases that looked complete at first but were later disproved by verification or acceptance review.
- `blocked-with-correct-reason rate` measures whether the system fails closed with the right explanation when progress should stop.

Current local source:

- `artifacts/manager-proof.latest.json`
- `artifacts/proving-harness.latest.json`
- `artifacts/phase4-proof.latest.json`
- `artifacts/phase5-actual.latest.json`
- `artifacts/phase6-repeatability.latest.json`
- manager tests and HTTP integration tests

## Runtime metrics

- first-run DB init success
- bootstrap proof captured per OS
- worker invocation pass rate
- verifier worker path captured
- artifact lineage completeness
- checkpoint recovery success
- checkpoint recovery breadth
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

The canonical first demo / acceptance mission run set is:

- `thai_equities_daily_controlled_acceptance_runs`

Rules:

- it must be named before `Repeatable One-Mission` claims count
- it must include success, blocked, stale-data, and retry-after-failure cases
- it must be runnable without hidden manual rescue steps
- operator approvals and rejects may exist, but every required human touch must be explicit in the run definition and visible in artifacts

Phase 3 also maintains a generic proving-framework harness that must validate:

- success
- blocked-with-correct-reason
- stale-or-invalid-input blocked
- verification-failed then retryable

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
- `Phase2_WorkerFabricRuntimeSpine`: pass
- `Phase3_ProvingMissionFramework`: pass only after the generic proving harness is green
- `Phase4_DemoAcceptanceMission`: pass only after the demo mission proof is green
- `Phase5_ActualManagerLedMission`: pass once one-goal manager-led execution is real and locally proven
- `Phase6_Repeatability`: pass once repeated actual mission runs prove memory reuse, retry recovery, blocked correctness, and zero false completes

The scorecard should also track these plan-critical signals even before they are fully instrumented:

- `mission_brief_completeness`
- `goal_ambiguity_detector`
- `acceptance_run_set_defined`
- `false_complete_count`
- `blocked_with_correct_reason_rate`
- `no_hidden_human_loop_assumption`
- `proving_mission_definition_valid`
- `generic_acceptance_harness_pass_rate`
- `report_contract_completeness`
- `adapter_selection_correctness`
- `mission_demo_without_hidden_steps`
- `actual_manager_single_goal_pass`
- `actual_manager_persona_memory_applied`
- `actual_manager_generated_plan`
- `actual_manager_worker_control`
- `actual_manager_no_demo_shortcut`

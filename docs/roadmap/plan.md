# Plan: best-brain Full Roadmap — Fix Current Issues + Phase 7-11

## TL;DR

best-brain is a local AI work OS with the slogan "Think like me. Work for me. Finish for real." Phases 1-6 are locally proven (Brain v1, Manager alpha, Thai equities scanner proving mission, repeatability, control room liftoff). The core stabilization gate is **Windows-first bootstrap/runtime proof**. macOS/Linux proof capture remains optional portability evidence, not a release gate. This plan first closes the Windows-first gate, then lays out the full Phase 7-11 execution path toward autonomous Operator Mode.

---

## Current Status Summary

### What's Done (Phase 1-6) ✅
- **Brain v1**: 8 memory types, SQLite WAL, FTS, HTTP+MCP transport, frozen contracts
- **Manager Alpha**: Intent routing (100% accuracy), ambiguity detection, mission compiler, brief validator (18 checks), playbook resolution, task graph DAG, repair heuristics
- **Workers**: Claude CLI ✅, Shell CLI ✅, Codex CLI ❌ (failing), Verifier (basic)
- **Proving Framework**: Generic harness, 2 mission definitions (repo change, Thai equities), 100% blocked-reason accuracy
- **Demo + Actual Mission**: Thai equities scanner end-to-end, zero false-completes
- **Repeatability**: 4 runs, 100% verified-complete, 100% memory-reuse citation
- **Control Room**: Dashboard, mission console, operator review structure, full visibility (graph/timeline/workers/artifacts/verdict)
- **Eval**: ConsultEval 8/8 passing, all v1 gates met

### What's Failing ❌
1. **No blocking failures on Windows-first core gates**

### What's Partially Done 🟡
- VerifierAdapter: Framework exists, basic implementation only
- ManagerReasoner: Optional AI triage, depends on Claude/Codex CLI availability
- ChatResponder: Optional brain-aware chat, requires MCP config
- Input Adapters: Registry defined, market data adapter is stub
- Operator Review: UI structure exists, approve/reject business logic minimal
- Checkpoint/Restore: Defined but not fully wired for resumption

---

## PHASE 0: Stabilize Current Failures (Immediate)

### Step 1: Fix Codex Worker Path
- **File**: `src/workers/fabric.ts`, `src/manager/adapters/` (Codex CLI adapter)
- **Status**: Completed on 2026-03-11
- **Action**: Codex adapter hardened for structured/freeform parsing, provider-unavailable detection, and large-output truncation safety
- **Verification**: `bun run smoke:manager:codex` passes; manager proof and scorecard report worker invocation 100%

### Step 2: Cross-Platform Bootstrap
- **File**: `src/smoke/bootstrap.ts`, `src/config.ts` (platform-specific paths)
- **Action**: Keep Windows bootstrap proof as release gate. Run optional macOS/Linux portability smoke in CI/manual when available.
- **Verification**: `bun run smoke:bootstrap` + `bun run smoke:bootstrap:proof -- --os-label windows` are mandatory; macOS/Linux proofs are informational only.

### Step 3: Scorecard Green
- **Action**: Run `bun run scorecard:program` and confirm all metrics pass (38/40 → 40/40)
- **Verification**: `artifacts/program-scorecard.latest.json` shows 0 failures

---

## PHASE 7: Chat Maturity (Manager Beta Rails)

**Goal**: Make chat mode useful for daily conversations — fast, persona-aware, memory-building.

### Step 4: Brain-Aware Chat Default (*depends on Step 1*)
- **Files**: `src/manager/chat-responder.ts`, `src/chat/service.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Make ChatResponder non-optional — always consult brain before answering. Implement fallback chain: Claude MCP → Claude CLI → Codex CLI → direct brain answer
- **Verification**: Chat messages with persona/preference questions return memory-grounded answers with citations

### Step 5: Chat Memory Loop
- **Files**: `src/chat/service.ts`, `src/services/brain.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Auto-learn from chat conversations — extract preference signals, domain knowledge, and working memory from user messages. Use learn mode `working_memory` with 14-day TTL
- **Verification**: Send 3+ chat messages → verify working_memory items created → next consult references them

### Step 6: Chat Quality Eval
- **Files**: `src/eval/` (new chat eval), `scripts/` (new eval runner)
- **Status**: Completed on 2026-03-11
- **Action**: Create `chat-eval.ts` with rubrics: response relevance, persona consistency, memory grounding, latency. Minimum 10 test cases covering: greeting, preference recall, domain Q&A, Thai language, clarification requests
- **Verification**: `bun run eval:chat` passes with ≥85% quality score

### Step 7: Manager Beta — Multi-Pattern Missions (*parallel with Step 4-6*)
- **Files**: `src/manager/mission-compiler.ts`, `src/manager/playbook.ts`, `src/proving/`
- **Status**: Completed on 2026-03-11
- **Action**: Extend mission compiler beyond Thai equities — support `repo_change_mission`, `analysis_reporting_mission`, `command_execution_mission` with proper playbooks, derivation, and verifier checklists
- **Verification**: `bun run smoke:manager` passes for 3 mission kinds (`repo_change_mission`, `analysis_reporting_mission`, `command_execution_mission`); `bun run proof:proving` validates multi-pattern definitions and acceptance runs

### Step 8: Ambiguity Detector Hardening (*parallel with Step 7*)
- **File**: `src/manager/goal-ambiguity.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Add test cases for edge cases: mixed-language goals, multi-objective goals, implicit constraints. Ensure ambiguity detector blocks correctly without over-blocking
- **Verification**: ≥20 ambiguity test cases pass; false-block rate <5%

---

## PHASE 8: Worker Fabric Expansion (Browser + Mail + Dual Workers)

**Goal**: Real desktop operator — browse web, send mail, use multiple workers per mission.

### Step 9: Browser Worker (*depends on Step 1*)
- **Files**: `src/workers/` (new browser adapter), `src/manager/adapters/`
- **Status**: Completed (alpha scope) on 2026-03-11
- **Action**: Implement manager-owned `BrowserWorkerAdapter` with URL fetch, HTML snapshot artifact capture, text/title extraction, and verification checks. Domain allow-list guardrails are supported.
- **Security**: Sandbox browser process, restrict to allowed domains (configurable), no credential storage in memory
- **Verification**: `bun run smoke:manager:browser` passes with real manager proof-chain persistence and browser artifacts.

### Step 10: Mail Worker (*parallel with Step 9*)
- **Files**: `src/workers/` (new mail adapter)
- **Status**: Completed (alpha scope) on 2026-03-11
- **Action**: Implement manager-owned `MailWorkerAdapter` with draft generation, inbox summary, and mailbox search from local artifacts.
- **Security**: Require explicit operator approval before sending. Draft-only mode by default
- **Verification**: `bun run smoke:manager:mail` passes; direct send requests are blocked by draft-only policy.

### Step 11: Dual Worker Dispatch (*depends on Step 9, 10*)
- **Files**: `src/manager/dispatcher.ts`, `src/manager/runtime.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Extend manager runtime to execute multi-worker mission graphs sequentially (non-verifier nodes), carry prior worker outputs into downstream task prompts, and verify against the merged proof chain.
- **Verification**: `bun run smoke:manager:dual` passes on a deterministic Claude→Shell chain and records secondary worker nodes in mission/runtime artifacts.

### Step 12: Worker Health & Retry
- **Files**: `src/workers/fabric.ts`, `src/manager/runtime.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Add transient-failure retry policy in worker fabric (exponential backoff, max 3 attempts per worker) and preserve fallback behavior to alternate workers when the primary remains unavailable.
- **Verification**: Worker-fabric tests now cover transient unavailability retries, fallback remains active for unavailable workers, and no silent failures are accepted.

---

## PHASE 9: Control Room UI (Full Inspection & Steering)

**Goal**: Full visual control surface — mission timeline, live worker status, operator steering.

### Step 13: Mission Timeline View (*depends on Step 7*)
- **Files**: `src/control-room/` (page templates, service)
- **Status**: Completed on 2026-03-11
- **Action**: Build timeline visualization showing mission phases: goal → consult → compile → dispatch → execute → verify → report. Each phase shows duration, status, key data
- **Verification**: `tests/control-room-http.test.ts` validates `phase_timeline` coverage; control-room mission detail now renders phase status + duration for all major phases

### Step 14: Live Worker Status Panel (*parallel with Step 13*)
- **Files**: `src/control-room/service.ts` (extend worker tracking)
- **Status**: Completed on 2026-03-11
- **Action**: Real-time worker status cards: running/idle/failed, current task, last output snippet, artifact count. WebSocket or polling updates
- **Verification**: Worker cards now expose `artifact_count` + `last_summary`; control-room UI polls active mission view and refreshes cards while mission state is `in_progress|awaiting_verification`

### Step 15: Operator Steering Controls (*depends on Step 13*)
- **Files**: `src/control-room/service.ts`, `src/manager/kernel.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Implement full action handling: approve_verdict, reject_verdict, cancel_mission, resume_mission, retry_mission. Approval gates require explicit operator click before mission transitions to verified_complete
- **Verification**: `tests/control-room-http.test.ts` now covers `approve_verdict`, `retry_mission`, `cancel_mission`, and `resume_mission` with persisted operator audit events

### Step 16: Mission History & Comparison
- **Files**: `src/control-room/`, `src/db/` (mission queries)
- **Status**: Completed on 2026-03-11
- **Action**: Mission history panel showing past runs with: success/fail status, duration, key metrics, diff between runs. Filter by mission kind, date range, status
- **Verification**: Added `/control-room/api/history` with status/mission-kind/date filters and per-mission run comparison deltas; UI renders filterable history cards

### Step 17: Chat ↔ Control Room Integration (*depends on Step 4, Step 13*)
- **Files**: `src/chat/service.ts`, `src/control-room/service.ts`
- **Status**: Completed on 2026-03-11
- **Action**: Seamless promotion: chat detects mission-worthy goal → shows "Promote to Mission?" → clicking promotes to control room with pre-filled goal. Control room shows chat history for context
- **Verification**: `tests/chat-http.test.ts` validates promotion suggestion payload for chat-sized planning messages; chat UI now renders `Promote to mission` link and control-room reads prefilled `goal` query

---

## PHASE 10: Procedural Maturity (Learn From Experience)

**Goal**: System learns from past missions — what worked, what failed, how to improve.

### Step 18: Failure Pattern Learning (*depends on Step 7*)
- **Status**: Completed on 2026-03-12
- **Files**: `src/manager/kernel.ts`, `src/manager/runtime.ts`, `src/policies/failure-pattern.ts`
- **Action**: On `verification_failed`, manager classifies deterministic root-cause (`worker_error|invalid_input|ambiguous_goal|verification_gap`) and writes a failure lesson as a candidate memory (`confirmed=false`) for user-confirm gating.
- **Verification (actual)**: `tests/manager.test.ts` verifies failure lesson write-back includes classified root cause and remains retryable; `bun run test` is green.
- **Verification**: Mission fails → failure lesson proposed → user confirms → next similar mission avoids same pattern

### Step 19: Procedure Auto-Generation (*depends on Step 18*)
- **Status**: Completed on 2026-03-12
- **Files**: `src/manager/runtime.ts`, `src/services/brain.ts`, `src/policies/learning.ts`
- **Action**: After >=3 `verified_complete` outcomes for the same mission kind, manager proposes a procedure memory as `status=candidate` (not auto-active), preserving user-confirm gate before promotion.
- **Verification (actual)**: `tests/manager.test.ts` asserts candidate procedure proposal after 3 verified outcomes; candidate items are excluded from default retrieval in `tests/brain.test.ts`.
- **Verification**: 3 repo_change missions succeed → procedure proposed → confirmed → next mission references it

### Step 20: Memory Quality Metrics
- **Status**: Completed on 2026-03-12
- **Files**: `src/db/client.ts`, `src/services/brain.ts`, `src/http/app.ts`, `src/control-room/service.ts`, `src/control-room/page.ts`
- **Action**: Added `GET /brain/memory-quality` and control-room memory-health widget covering active count, staleness ratio, unresolved contradictions, superseded retrieval leakage, and citation usefulness.
- **Verification**: `tests/http.test.ts` validates API shape; `tests/control-room-http.test.ts` validates dashboard memory health payload; `tests/brain.test.ts` validates metric counters.

### Step 21: Cross-Mission Knowledge Transfer (*parallel with Step 20*)
- **Status**: Completed on 2026-03-12
- **Files**: `src/manager/runtime.ts`, `src/policies/learning.ts`, `src/types.ts`, `src/validation.ts`
- **Action**: On verified missions, manager evaluates domain/entity overlap and proposes `domain_memory` transfer candidates (`status=candidate`) for cross-mission reuse with explicit promotion path.
- **Verification (actual)**: `tests/manager.test.ts` validates cross-domain proposal when overlap exists; `bun run test` passes.
- **Verification**: Thai equities insight → proposed as general investment knowledge → user confirms → available in non-Thai contexts

---

## PHASE 11: Operator Mode (Progressive Autonomy)

**Goal**: System can work autonomously on the user's machine — scheduled missions, background tasks, self-initiated work.

### Step 22: Scheduled Mission Execution (*depends on Step 15*)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/runtime/scheduler.ts`, `src/runtime/types.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/http/app.ts`, `src/server.ts`, `scripts/scheduler.ts`
- **Action (actual)**: Added persistent recurring mission scheduler with SQLite-backed schedules, run-lock/idempotency, server-side polling, and operator commands (`create/list/pause/resume/run-now/tick`) over HTTP + CLI. Scheduled runs execute through existing manager/control-room rails (no bypass path).
- **Verification (actual)**: `tests/scheduler.test.ts` + `tests/scheduler-http.test.ts` pass; full suite `bun run test` passes with scheduler routes and execution paths active.
- **Files**: `src/runtime/` (new scheduler), `src/manager/kernel.ts`
- **Action**: Cron-like scheduler for recurring missions (e.g., daily Thai equities scan at 09:00). Operator defines schedule + approval policy (auto-approve if confidence >X, else queue for review)
- **Verification**: Schedule daily mission → runs at configured time → result appears in control room

### Step 23: Autonomous Task Queue (*depends on Step 22*)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/runtime/task-queue.ts`, `src/runtime/types.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/http/app.ts`, `src/server.ts`, `src/control-room/service.ts`, `scripts/queue.ts`
- **Action (actual)**: Added persistent autonomous task queue with SQLite-backed queue items, priority-based claiming (`urgent > scheduled > background`), retry backoff, operator HTTP+CLI controls, queue polling on server startup, and follow-up task enqueue hooks from control-room mission results.
- **Verification (actual)**: `tests/task-queue.test.ts` + `tests/task-queue-http.test.ts` pass; `bun run test` includes queue runtime + route coverage.
- **Files**: `src/runtime/`, `src/manager/`
- **Action**: Background task queue: system identifies pending tasks from mission context, queues them, executes when resources available. Priority system: urgent > scheduled > background
- **Verification**: Mission creates follow-up tasks → tasks execute automatically → results linked to parent mission

### Step 24: Confidence-Based Autonomy Levels
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/policies/autonomy.ts`, `src/control-room/service.ts`, `src/control-room/types.ts`, `src/http/app.ts`, `tests/autonomy-policy.test.ts`, `tests/control-room-autonomy-http.test.ts`
- **Action (actual)**: Added autonomy policy engine with three levels (`supervised`, `semi_autonomous`, `autonomous`), per-mission-kind overrides, routine-vs-novel gating via verified run history, and control-room API endpoints to view/update policy. Mission runs now record autonomy decisions and auto-approval behavior deterministically.
- **Verification (actual)**: `tests/autonomy-policy.test.ts` + `tests/control-room-autonomy-http.test.ts` pass; full suite remains green with policy-enabled control-room flows.
- **Files**: `src/policies/` (new autonomy policy), `src/manager/runtime.ts`
- **Action**: Three autonomy levels: supervised (all approval gates), semi-autonomous (auto-approve routine tasks, gate novel ones), autonomous (execute within policy bounds, alert on exceptions). User configures per mission kind
- **Verification**: Routine mission auto-completes in semi-autonomous mode; novel mission pauses for approval

### Step 25: Self-Monitoring & Alerting (*parallel with Step 24*)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/runtime/health.ts`, `src/db/client.ts`, `src/control-room/service.ts`, `src/control-room/types.ts`, `src/http/app.ts`, `src/server.ts`, `tests/health-monitor.test.ts`, `tests/control-room-health-http.test.ts`
- **Action (actual)**: Added runtime health monitor with 30s polling defaults to track worker availability, memory staleness, mission failure rate (24h window), and data-dir disk usage. Alerts are generated deterministically and surfaced through control-room overview + dedicated system-health endpoint.
- **Verification (actual)**: `tests/health-monitor.test.ts` + `tests/control-room-health-http.test.ts` pass; full test suite remains green with health snapshot + alert payloads.
- **Files**: `src/runtime/` (health monitor)
- **Action**: System monitors own health: worker availability, memory staleness, mission failure rate, disk usage. Alerts user via control room + optional notification when thresholds exceeded
- **Verification**: Simulate worker down → alert appears in control room within 30s

### Step 26: Operator Dashboard (*depends on Step 22-25*)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/control-room/page.ts`, `src/control-room/service.ts`, `src/control-room/types.ts`, `src/http/app.ts`, `tests/control-room-operator-dashboard-http.test.ts`
- **Action (actual)**: Added dedicated operator dashboard surface with active-mission stream, approval queue, autonomy policy summary, system-health/alert context, scheduler snapshot, and task-queue snapshot. Added one-click operator override endpoint that pauses running missions through existing kernel action rails (`cancel_mission`) without bypassing policy.
- **Verification (actual)**: `tests/control-room-operator-dashboard-http.test.ts` passes (dashboard aggregation + override pause), full suite remains green.
- **Files**: `src/control-room/` (operator view)
- **Action**: Dedicated operator view showing: active missions, scheduled tasks, autonomy level per kind, system health, recent alerts, approval queue. One-click override for any running mission
- **Verification**: Full operator dashboard with 3+ active streams visible; override pauses mission correctly

### Phase 11 Acceptance Gate (Scheduled 3-day proof)
- **Status**: Completed on 2026-03-12 (Windows-first harness)
- **Files (actual)**: `scripts/capture-phase11-proof.ts`, `artifacts/phase11-operator.latest.json`, `scripts/generate-program-scorecard.ts`, `src/program/scorecard.ts`
- **Action (actual)**: Added deterministic acceptance harness proving three consecutive daily scheduled mission runs with semi-autonomous gating (first run supervised, routine follow-ups auto-approved), no hidden manual intervention, and operator dashboard stream capture.
- **Verification (actual)**: `bun run proof:phase11` emits `artifacts/phase11-operator.latest.json`; `bun run scorecard:program` consumes phase11 proof metrics.

---

## PHASE 12: Operator Safety Rails (Windows-first)

**Goal**: provide an immediate global safety stop that pauses execution rails without losing observability.

### Step 27: Emergency Stop Gate for Mission Execution
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/runtime/safety.ts`, `src/runtime/scheduler.ts`, `src/runtime/task-queue.ts`, `src/http/app.ts`, `src/server.ts`, `src/control-room/service.ts`, `src/control-room/types.ts`, `src/control-room/page.ts`, `tests/operator-safety.test.ts`, `tests/operator-safety-http.test.ts`
- **Action (actual)**: Added persistent operator safety controller (`emergency_stop`) and wired it into control-room launch, scheduler tick/run-now, and task-queue tick. Added operator safety HTTP endpoints and control-room operator panel controls to stop/resume execution.
- **Verification (actual)**: `tests/operator-safety.test.ts` + `tests/operator-safety-http.test.ts` pass; full suite remains green.
- **Verification**: Activate safety stop -> launch/tick paths return blocked status -> resume -> execution paths run normally.

### Step 28: Windows CLI Spawn Resilience (Claude/Codex missing-path fallback)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/manager/adapters/shared.ts`, `tests/shared-cli.test.ts`
- **Action (actual)**: Hardened missing-command detection to cover Windows/Bun `uv_spawn` ENOENT variants (`code`, `errno`, nested `cause`, and message-only errors). This prevents chat/triage paths from failing the whole run when `claude` or `codex` is not installed or not on PATH.
- **Verification (actual)**: `tests/shared-cli.test.ts` includes ENOENT message/cause cases (`uv_spawn 'claude'`/`'codex'`) and passes.
- **Verification**: On Windows without Claude/Codex in PATH, manager/chat degrades to non-worker fallback instead of surfacing raw spawn errors.

### Step 29: Phase 12 Safety Proof Capture (Windows operator path)
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `scripts/capture-phase12-proof.ts`, `package.json`, `README.md`
- **Action (actual)**: Added deterministic Phase 12 proof harness that runs real HTTP operator paths (`/operator/safety/*`, `/control-room/api/launch`, scheduler tick, queue tick) through blocked and resumed states, then writes a reproducible artifact.
- **Verification (actual)**: `bun run proof:phase12` emits `artifacts/phase12-safety.latest.json` with blocked/resume invariants and produced IDs.
- **Verification**: Safety stop blocks execution rails with `423` while preserving dashboard readability, then resume restores launch/scheduler/queue execution.

---

## PHASE 13: Windows Production Operator Hardening

**Goal**: make Windows operator readiness observable with one-shot, actionable worker diagnostics.

### Step 30: Worker Diagnostics Endpoint + CLI Snapshot
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/runtime/worker-diagnostics.ts`, `src/http/app.ts`, `src/server.ts`, `scripts/run-worker-diagnostics.ts`, `tests/worker-diagnostics.test.ts`, `tests/worker-diagnostics-http.test.ts`, `package.json`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Added deterministic diagnostics service that probes `claude`, `codex`, and `bun` executability (`--version`) and reports manager-owned workers (`browser/mail/verifier`) in one snapshot. Exposed via HTTP and CLI for Windows operations.
- **Verification (actual)**: `GET /operator/workers/diagnostics` returns diagnostics payload; `bun run diagnostics:workers` prints one-shot snapshot; tests validate service aggregation and HTTP route shape.
- **Verification**: operator can instantly distinguish PATH/CLI failures from manager-owned worker availability before launching missions.

### Step 31: Operator Dashboard Diagnostics Integration
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/control-room/types.ts`, `src/control-room/service.ts`, `src/http/app.ts`, `src/control-room/page.ts`, `tests/control-room-operator-dashboard-http.test.ts`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Wired worker diagnostics snapshot into `/control-room/api/operator-dashboard` and rendered it inline in the control-room operator dashboard so readiness is visible in the same operator surface.
- **Verification (actual)**: operator dashboard HTTP test now asserts `worker_diagnostics` payload content; UI renders diagnostics list with availability, mode, version, and latency.
- **Verification**: operator sees active streams + approvals + schedules + queue + worker readiness from one dashboard call.

### Step 32: Operator Recovery Actions from Diagnostics + Alerts
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/control-room/types.ts`, `src/control-room/service.ts`, `src/control-room/page.ts`, `tests/control-room-operator-dashboard-http.test.ts`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Added `recovery_actions[]` in operator dashboard payload and UI rendering, derived deterministically from safety-stop state, unavailable CLI worker diagnostics, and recent health alerts.
- **Verification (actual)**: operator dashboard HTTP test asserts `worker_cli_unavailable` recovery action appears when diagnostics report unavailable codex CLI.
- **Verification**: operator dashboard now returns concrete recovery guidance without opening separate endpoints/logs.

### Step 33: Operator Launch Preflight for Worker Readiness
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/http/app.ts`, `src/control-room/page.ts`, `tests/control-room-preflight-http.test.ts`, `package.json`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Added `POST /control-room/api/operator/preflight` and wired control-room launch flow to call preflight first. Explicit worker launches are blocked when requested CLI worker is unavailable; auto mode returns advisories without blocking.
- **Verification (actual)**: new preflight HTTP test covers unavailable explicit worker blocking, auto advisory behavior, and safety-stop blocking.
- **Verification**: operators get deterministic launch guardrails before execution starts.

### Step 34: Server-side Launch Guard + Plan-only Preflight Semantics
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/http/app.ts`, `src/control-room/page.ts`, `tests/control-room-preflight-http.test.ts`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Refactored control-room preflight evaluation into shared server logic and applied it to both `/control-room/api/operator/preflight` and `/control-room/api/launch` to prevent client bypass. Added `dry_run/no_execute` aware behavior so explicit unavailable CLI workers block only when execution is requested.
- **Verification (actual)**: preflight/launch HTTP tests now cover no-execute advisory behavior plus launch-path blocking when explicit unavailable worker is requested for execution.
- **Verification**: any client path (UI or direct HTTP) receives identical readiness gating before mission execution.

### Step 35: Phase 13 Deterministic Proof Harness
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `scripts/capture-phase13-proof.ts`, `package.json`, `README.md`, `docs/operators/windows-operator-runbook.md`
- **Action (actual)**: Added deterministic proof harness to capture Phase 13 invariants across worker diagnostics, operator dashboard recovery actions, preflight execution blocking, no-execute advisory behavior, and server-side launch guard enforcement.
- **Verification (actual)**: `bun run proof:phase13` emits `artifacts/phase13-operator.latest.json` with invariant flags and launch/preflight status evidence.
- **Verification**: Windows operators can validate readiness + guardrails in one reproducible proof artifact before mission execution.

### Step 36: Program Scorecard Integration for Phase 13
- **Status**: Completed on 2026-03-12 (Windows-first)
- **Files (actual)**: `src/program/scorecard.ts`, `scripts/generate-program-scorecard.ts`, `tests/program-scorecard.test.ts`
- **Action (actual)**: Added Phase 13 hardening metrics to the program scorecard and wired `generate-program-scorecard` to ingest `artifacts/phase13-operator.latest.json` invariants.
- **Verification (actual)**: `bun run scorecard:program` now emits `phase13_*` metrics (diagnostics, dashboard recovery, preflight block/advisory behavior, launch server guard) as pass/fail signals.
- **Verification**: operator hardening status is now tracked in the same scorecard used for program-wide gates.

---

## Verification & Quality Gates (All Phases)

1. **After Phase 0**: `bun run typecheck && bun run test && bun run scorecard:program` — all green, 0 failures
2. **After Phase 7**: `bun run eval:consult && bun run eval:chat` — both pass; 3+ mission kinds proven in harness
3. **After Phase 8**: Browser + Mail smoke tests pass; dual-worker mission completes; worker health handles failures
4. **After Phase 9**: Control room end-to-end: launch → execute → inspect → approve/reject → view history
5. **After Phase 10**: 5+ failure lessons auto-extracted; 1+ procedure auto-generated and confirmed
6. **After Phase 11**: Scheduled mission runs 3 consecutive days without manual intervention; confidence-based gating works

---

## Relevant Files (Key Modification Targets)

### Core
- `src/workers/fabric.ts` — Worker registry, dispatch, health checks (Steps 1, 9-12)
- `src/manager/runtime.ts` — Manager orchestration pipeline (Steps 7, 11, 22-24)
- `src/manager/kernel.ts` — Decision gates, mission lifecycle (Steps 15, 22)
- `src/manager/dispatcher.ts` — Worker dispatch, chaining (Steps 11)
- `src/manager/mission-compiler.ts` — Mission brief generation (Step 7)
- `src/manager/playbook.ts` — Playbook resolution, verifier checklists (Step 7)
- `src/manager/chat-responder.ts` — Brain-aware chat (Step 4)
- `src/manager/goal-ambiguity.ts` — Ambiguity detection (Step 8)

### Services
- `src/services/brain.ts` — Memory storage, consult, learn (Steps 5, 18, 19, 21)
- `src/chat/service.ts` — Chat message handling, promotion (Steps 4, 5, 17)
- `src/control-room/service.ts` — Mission tracking, operator review (Steps 13-17, 26)

### Workers (New)
- `src/workers/browser.ts` — Browser automation worker (Step 9)
- `src/workers/mail.ts` — Email worker (Step 10)

### Policies
- `src/policies/learning.ts` — Learning mode rules (Steps 18, 19)
- `src/policies/memory-v2.ts` — Memory normalization, entity keys (Step 21)
- `src/policies/retention.ts` — Lifecycle and staleness (Step 20)

### Runtime
- `src/runtime/spine.ts` — Session, checkpoint, event tracking (Steps 22, 23, 25)
- `src/runtime/scheduler.ts` — New: cron-like mission scheduler (Step 22)
- `src/runtime/health.ts` — New: system health monitoring (Step 25)
- `src/runtime/worker-diagnostics.ts` — New: one-shot CLI/manager worker diagnostics (Step 30)

### Eval & Proving
- `src/eval/chat-eval.ts` — New: chat quality evaluation (Step 6)
- `src/proving/` — Mission definitions, acceptance harness (Step 7)

### Infrastructure
- `src/config.ts` — Platform paths (Step 2)
- `src/smoke/bootstrap.ts` — Cross-platform bootstrap (Step 2)
- `src/http/app.ts` — HTTP routes for new endpoints

---

## Decisions

- **Phase numbering**: Follows existing project convention (Phase 7-11 from `docs/roadmap/master-plan.md`)
- **Codex fix is highest priority**: Blocking 2 scorecard metrics; must fix before expanding workers
- **Browser worker uses Playwright**: Puppeteer alternative acceptable, but Playwright has better cross-platform support
- **Mail worker is draft-only by default**: No auto-send without explicit operator approval (security requirement)
- **Control Room remains HTML-served**: No SPA framework; progressive enhancement from current Hono-served pages
- **Autonomy requires explicit opt-in**: Default mode is supervised; user must configure semi-autonomous or autonomous per mission kind
- **Contract freeze maintained**: All new features add to existing contracts; no breaking changes to HTTP/MCP interfaces

## Further Considerations

1. **Vector embedding provider**: Current memory model has embedding_status fields but no vector search implementation. Phase 7 chat maturity would benefit from semantic retrieval. Recommend adding a local embedding model (e.g., `@xenova/transformers` for Bun) vs. cloud API vs. defer until needed
2. **Real market data for Thai equities**: Currently using fixtures/stubs. For Phase 8+ daily scanner to be genuinely useful, need actual SET data source. Options: web scraping (Browser worker), API provider (paid), manual CSV import
3. **Multi-user potential**: Current design is single-owner. If multi-user ever needed, memory isolation and auth would need fundamental changes. Recommend keeping single-owner as explicit non-goal per final-concept.md

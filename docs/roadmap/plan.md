# Plan: best-brain Full Roadmap — Fix Current Issues + Phase 7-11

## TL;DR

best-brain is a local AI work OS with the slogan "Think like me. Work for me. Finish for real." Phases 1-6 are locally proven (Brain v1, Manager alpha, Thai equities scanner proving mission, repeatability, control room liftoff). The remaining stabilization gap is **cross-platform bootstrap proof capture (Windows/macOS/Linux)**. This plan first closes that gap, then lays out the full Phase 7-11 execution path toward autonomous Operator Mode.

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
1. **Platform coverage**: Bootstrap proofs only on Windows; macOS/Linux pending

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
- **Action**: Run bootstrap smoke on macOS/Linux (CI or manual), fix path resolution issues (`XDG_DATA_HOME` on Linux, `~/Library/Application Support` on macOS)
- **Verification**: `bun run smoke:bootstrap` passes on all 3 platforms; capture proofs in `artifacts/bootstrap-proofs/`

### Step 3: Scorecard Green
- **Action**: Run `bun run scorecard:program` and confirm all metrics pass (38/40 → 40/40)
- **Verification**: `artifacts/program-scorecard.latest.json` shows 0 failures

---

## PHASE 7: Chat Maturity (Manager Beta Rails)

**Goal**: Make chat mode useful for daily conversations — fast, persona-aware, memory-building.

### Step 4: Brain-Aware Chat Default (*depends on Step 1*)
- **Files**: `src/manager/chat-responder.ts`, `src/chat/service.ts`
- **Action**: Make ChatResponder non-optional — always consult brain before answering. Implement fallback chain: Claude MCP → Claude CLI → Codex CLI → direct brain answer
- **Verification**: Chat messages with persona/preference questions return memory-grounded answers with citations

### Step 5: Chat Memory Loop
- **Files**: `src/chat/service.ts`, `src/services/brain.ts`
- **Action**: Auto-learn from chat conversations — extract preference signals, domain knowledge, and working memory from user messages. Use learn mode `working_memory` with 14-day TTL
- **Verification**: Send 3+ chat messages → verify working_memory items created → next consult references them

### Step 6: Chat Quality Eval
- **Files**: `src/eval/` (new chat eval), `scripts/` (new eval runner)
- **Action**: Create `chat-eval.ts` with rubrics: response relevance, persona consistency, memory grounding, latency. Minimum 10 test cases covering: greeting, preference recall, domain Q&A, Thai language, clarification requests
- **Verification**: `bun run eval:chat` passes with ≥85% quality score

### Step 7: Manager Beta — Multi-Pattern Missions (*parallel with Step 4-6*)
- **Files**: `src/manager/mission-compiler.ts`, `src/manager/playbook.ts`, `src/proving/`
- **Action**: Extend mission compiler beyond Thai equities — support `repo_change_mission`, `analysis_reporting_mission`, `command_execution_mission` with proper playbooks, derivation, and verifier checklists
- **Verification**: `bun run smoke:manager` passes for at least 3 mission kinds; proving harness validates all patterns

### Step 8: Ambiguity Detector Hardening (*parallel with Step 7*)
- **File**: `src/manager/goal-ambiguity.ts`
- **Action**: Add test cases for edge cases: mixed-language goals, multi-objective goals, implicit constraints. Ensure ambiguity detector blocks correctly without over-blocking
- **Verification**: ≥20 ambiguity test cases pass; false-block rate <5%

---

## PHASE 8: Worker Fabric Expansion (Browser + Mail + Dual Workers)

**Goal**: Real desktop operator — browse web, send mail, use multiple workers per mission.

### Step 9: Browser Worker (*depends on Step 1*)
- **Files**: `src/workers/` (new browser adapter), `src/manager/adapters/`
- **Action**: Implement BrowserWorkerAdapter using Puppeteer/Playwright. Capabilities: navigate, screenshot, extract text, fill forms, click. Output: artifacts (screenshots, extracted data) + checks
- **Security**: Sandbox browser process, restrict to allowed domains (configurable), no credential storage in memory
- **Verification**: Smoke test navigates to a public page, captures screenshot, extracts text → artifacts valid

### Step 10: Mail Worker (*parallel with Step 9*)
- **Files**: `src/workers/` (new mail adapter)
- **Action**: Implement MailWorkerAdapter. Capabilities: draft email (not send without approval), read inbox summary, search mail. Use IMAP/SMTP or provider APIs
- **Security**: Require explicit operator approval before sending. Draft-only mode by default
- **Verification**: Smoke test drafts an email → artifact shows draft content → no actual send without approval

### Step 11: Dual Worker Dispatch (*depends on Step 9, 10*)
- **Files**: `src/manager/dispatcher.ts`, `src/manager/runtime.ts`
- **Action**: Extend dispatcher to chain 2+ workers per mission. Task graph nodes can specify different workers. Worker results feed into next task's context
- **Verification**: Mission using Claude (analysis) → Shell (execution) completes end-to-end; task graph shows correct worker assignments

### Step 12: Worker Health & Retry
- **Files**: `src/workers/fabric.ts`, `src/manager/runtime.ts`
- **Action**: Add worker health checks (CLI availability, timeout detection). Implement retry with exponential backoff (max 3 attempts). Fallback to alternative worker if primary unavailable
- **Verification**: Simulate worker failure → retry succeeds or falls back; no silent failure

---

## PHASE 9: Control Room UI (Full Inspection & Steering)

**Goal**: Full visual control surface — mission timeline, live worker status, operator steering.

### Step 13: Mission Timeline View (*depends on Step 7*)
- **Files**: `src/control-room/` (page templates, service)
- **Action**: Build timeline visualization showing mission phases: goal → consult → compile → dispatch → execute → verify → report. Each phase shows duration, status, key data
- **Verification**: Launch a mission → timeline shows all phases with correct transitions

### Step 14: Live Worker Status Panel (*parallel with Step 13*)
- **Files**: `src/control-room/service.ts` (extend worker tracking)
- **Action**: Real-time worker status cards: running/idle/failed, current task, last output snippet, artifact count. WebSocket or polling updates
- **Verification**: During mission execution, worker cards update status in real-time

### Step 15: Operator Steering Controls (*depends on Step 13*)
- **Files**: `src/control-room/service.ts`, `src/manager/kernel.ts`
- **Action**: Implement full action handling: approve_verdict, reject_verdict, cancel_mission, resume_mission, retry_mission. Approval gates require explicit operator click before mission transitions to verified_complete
- **Verification**: Mission reaches awaiting_verification → operator approves via UI → status transitions correctly; reject triggers repair loop

### Step 16: Mission History & Comparison
- **Files**: `src/control-room/`, `src/db/` (mission queries)
- **Action**: Mission history panel showing past runs with: success/fail status, duration, key metrics, diff between runs. Filter by mission kind, date range, status
- **Verification**: After 3+ missions, history panel shows all runs sortable and filterable

### Step 17: Chat ↔ Control Room Integration (*depends on Step 4, Step 13*)
- **Files**: `src/chat/service.ts`, `src/control-room/service.ts`
- **Action**: Seamless promotion: chat detects mission-worthy goal → shows "Promote to Mission?" → clicking promotes to control room with pre-filled goal. Control room shows chat history for context
- **Verification**: Chat conversation → promote → control room shows mission with chat context attached

---

## PHASE 10: Procedural Maturity (Learn From Experience)

**Goal**: System learns from past missions — what worked, what failed, how to improve.

### Step 18: Failure Pattern Learning (*depends on Step 7*)
- **Files**: `src/services/brain.ts`, `src/policies/learning.ts`
- **Action**: After mission failure, auto-extract failure pattern: what went wrong, root cause category (worker_error, invalid_input, ambiguous_goal, verification_gap), suggested mitigation. Store as FailureMemory with `user_confirmed` gate
- **Verification**: Mission fails → failure lesson proposed → user confirms → next similar mission avoids same pattern

### Step 19: Procedure Auto-Generation (*depends on Step 18*)
- **Files**: `src/policies/learning.ts`, `src/seed/`
- **Action**: After 3+ successful missions of same kind, generate Procedure memory: "For [mission_kind], always [steps]". Require user confirmation before promoting to active procedure
- **Verification**: 3 repo_change missions succeed → procedure proposed → confirmed → next mission references it

### Step 20: Memory Quality Metrics
- **Files**: `src/eval/` (extend consult eval)
- **Action**: Track memory quality over time: staleness ratio, contradiction count, superseded but still retrieved count, citation usefulness rating. Dashboard widget showing memory health
- **Verification**: Memory dashboard shows health metrics; stale memories decay correctly per retention policy

### Step 21: Cross-Mission Knowledge Transfer (*parallel with Step 20*)
- **Files**: `src/services/brain.ts`, `src/policies/memory-v2.ts`
- **Action**: When mission in domain A succeeds, check if learnings apply to domain B (via entity_keys and domain overlap). Propose cross-domain DomainMemory items
- **Verification**: Thai equities insight → proposed as general investment knowledge → user confirms → available in non-Thai contexts

---

## PHASE 11: Operator Mode (Progressive Autonomy)

**Goal**: System can work autonomously on the user's machine — scheduled missions, background tasks, self-initiated work.

### Step 22: Scheduled Mission Execution (*depends on Step 15*)
- **Files**: `src/runtime/` (new scheduler), `src/manager/kernel.ts`
- **Action**: Cron-like scheduler for recurring missions (e.g., daily Thai equities scan at 09:00). Operator defines schedule + approval policy (auto-approve if confidence >X, else queue for review)
- **Verification**: Schedule daily mission → runs at configured time → result appears in control room

### Step 23: Autonomous Task Queue (*depends on Step 22*)
- **Files**: `src/runtime/`, `src/manager/`
- **Action**: Background task queue: system identifies pending tasks from mission context, queues them, executes when resources available. Priority system: urgent > scheduled > background
- **Verification**: Mission creates follow-up tasks → tasks execute automatically → results linked to parent mission

### Step 24: Confidence-Based Autonomy Levels
- **Files**: `src/policies/` (new autonomy policy), `src/manager/runtime.ts`
- **Action**: Three autonomy levels: supervised (all approval gates), semi-autonomous (auto-approve routine tasks, gate novel ones), autonomous (execute within policy bounds, alert on exceptions). User configures per mission kind
- **Verification**: Routine mission auto-completes in semi-autonomous mode; novel mission pauses for approval

### Step 25: Self-Monitoring & Alerting (*parallel with Step 24*)
- **Files**: `src/runtime/` (health monitor)
- **Action**: System monitors own health: worker availability, memory staleness, mission failure rate, disk usage. Alerts user via control room + optional notification when thresholds exceeded
- **Verification**: Simulate worker down → alert appears in control room within 30s

### Step 26: Operator Dashboard (*depends on Step 22-25*)
- **Files**: `src/control-room/` (operator view)
- **Action**: Dedicated operator view showing: active missions, scheduled tasks, autonomy level per kind, system health, recent alerts, approval queue. One-click override for any running mission
- **Verification**: Full operator dashboard with 3+ active streams visible; override pauses mission correctly

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

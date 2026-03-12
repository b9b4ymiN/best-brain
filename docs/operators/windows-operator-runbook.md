# Windows Operator Runbook

This runbook is the canonical Windows-first operator path for `best-brain`.

## 1. Bootstrap

```bash
bun install
bun run typecheck
bun run test
```

## 2. Start local brain server

```bash
bun run server
```

Default URL:

```text
http://127.0.0.1:47888
```

## 3. Verify operator safety rails

```bash
curl -s http://127.0.0.1:47888/operator/safety
curl -s -X POST http://127.0.0.1:47888/operator/safety/stop -H "content-type: application/json" -d "{\"reason\":\"windows operator drill\"}"
curl -s -X POST http://127.0.0.1:47888/operator/safety/resume -H "content-type: application/json" -d "{\"reason\":\"windows operator drill complete\"}"
```

Expected behavior:

- control-room launch is blocked while safety stop is active
- scheduler/queue ticks are blocked while safety stop is active
- dashboard/inspection endpoints remain readable
- execution resumes after safety resume

## 4. Run deterministic proof captures

```bash
bun run proof:bootstrap:matrix
bun run proof:phase11
bun run proof:phase12
bun run proof:phase13
```

Expected artifacts:

- `artifacts/bootstrap-smoke.latest.json`
- `artifacts/bootstrap-proof.latest.json`
- `artifacts/phase11-operator.latest.json`
- `artifacts/phase12-safety.latest.json`
- `artifacts/phase13-operator.latest.json`

## 5. Run manager smokes

```bash
bun run smoke:manager:claude
bun run smoke:manager:codex
bun run smoke:manager:shell
bun run smoke:manager:ambiguity
```

## 6. Verify worker diagnostics snapshot

```bash
bun run diagnostics:workers
curl -s http://127.0.0.1:47888/operator/workers/diagnostics
```

Expected behavior:

- `claude`, `codex`, `shell` show CLI availability and probe detail/version
- `browser`, `mail`, `verifier` show `execution_mode=manager_owned`
- control-room operator dashboard mirrors this data in its inline worker diagnostics section
- control-room operator dashboard also shows recovery actions (`recovery_actions`) for blocked safety state, unavailable CLI workers, and active health alerts

## 7. Run launch preflight before manual mission launch

```bash
curl -s -X POST http://127.0.0.1:47888/control-room/api/operator/preflight \
  -H "content-type: application/json" \
  -d "{\"goal\":\"Run a mission\",\"worker_preference\":\"codex\"}"
```

Expected behavior:

- status `423` when safety stop is active
- status `423` when selected worker is unavailable
- status `200` with advisories for `worker_preference=auto`
- status `200` with advisories when `dry_run=true` or `no_execute=true` (plan-only launch)
- `/control-room/api/launch` re-checks preflight server-side, so direct launch calls cannot bypass worker readiness gates

## 8. Troubleshooting (Windows)

If `claude` or `codex` is missing from PATH:

- manager/chat should degrade to worker-unavailable fallback
- raw `uv_spawn ... ENOENT` errors should not leak as final user answers
- fix by installing the CLI or adding it to PATH, then rerun smoke commands

If server port is busy:

- set `BEST_BRAIN_PORT` and restart `bun run server`

If data directory is locked:

- close running server instances
- check `%APPDATA%\\best-brain` for stale lock/process usage

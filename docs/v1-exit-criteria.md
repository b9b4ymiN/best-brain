# V1 Exit Criteria

## Acceptance gates

Brain v1 is considered ready when all of these hold:

- `bun run typecheck` passes
- `bun run test` passes
- `bun run eval:consult` passes v1 thresholds
- `bun run smoke:bootstrap` passes on the current OS
- `bun run smoke:mcp` passes
- `bun run smoke:claude` passes on Windows
- `bun run examples:manager` refreshes the example library without contract drift

## QA thresholds

- intent routing accuracy `>= 90%`
- expected memory in top-5 `>= 85%`
- citation completeness `>= 95%`
- stale or superseded default retrieval leakage `= 0`
- mission proof pass rate `= 100%`
- orphan evidence count `= 0`
- consult usefulness median `>= 4/5`
- groundedness median `>= 4/5`
- persona alignment median `>= 4/5`
- actionability median `>= 4/5`

## Manual smoke matrix

| OS | Command set | Expected result |
| --- | --- | --- |
| Windows | `bun run smoke:bootstrap`, `bun run onboard`, `bun run smoke:mcp`, `bun run smoke:claude` | clean bootstrap passes, onboarding completes, MCP smoke passes, Claude tool call succeeds |
| macOS | `bun run smoke:bootstrap`, `bun run onboard`, `bun run smoke:mcp` | bootstrap and MCP paths pass, app data path resolves to `~/Library/Application Support/best-brain` |
| Linux | `bun run smoke:bootstrap`, `bun run onboard`, `bun run smoke:mcp` | bootstrap and MCP paths pass, app data path resolves to `$XDG_DATA_HOME/best-brain` or `~/.local/share/best-brain` |

## Operator checklist

1. Run `bun install`
2. Run `bun run typecheck`
3. Run `bun run test`
4. Run `bun run onboard`
5. Run `bun run eval:consult`
6. Run `bun run examples:manager`
7. Run `bun run smoke:bootstrap`
8. Run `bun run smoke:mcp`
9. On Windows, run `bun run smoke:claude`

## Artifacts

Expected local artifacts after a healthy run:

- `artifacts/consult-eval.latest.json`
- `artifacts/bootstrap-smoke.latest.json`
- `artifacts/claude-mcp.debug.log` after Claude smoke
- local SQLite database in the OS-native app-data directory unless an override is used

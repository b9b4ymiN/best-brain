# V1 Exit Criteria

## Acceptance gates

Brain v1 is considered ready when all of these hold:

- `bun run typecheck` passes
- `bun run test` passes
- `bun run eval:consult` passes v1 thresholds
- `bun run smoke:mcp` passes
- `bun run smoke:claude` passes on Windows

## QA thresholds

- intent routing accuracy `>= 90%`
- expected memory in top-5 `>= 85%`
- stale or superseded default retrieval leakage `= 0`
- mission proof pass rate `= 100%`
- consult usefulness median `>= 4/5`
- groundedness median `>= 4/5`
- persona alignment median `>= 4/5`
- actionability median `>= 4/5`

## Manual smoke matrix

| OS | Command set | Expected result |
| --- | --- | --- |
| Windows | `bun run server`, `bun run onboard`, `bun run smoke:mcp`, `bun run smoke:claude` | HTTP responds, onboarding completes, MCP smoke passes, Claude tool call succeeds |
| macOS | `bun run server`, `bun run onboard`, `bun run smoke:mcp` | HTTP and MCP paths pass, app data path resolves to `~/Library/Application Support/best-brain` |
| Linux | `bun run server`, `bun run onboard`, `bun run smoke:mcp` | HTTP and MCP paths pass, app data path resolves to `$XDG_DATA_HOME/best-brain` or `~/.local/share/best-brain` |

## Operator checklist

1. Run `bun install`
2. Run `bun run typecheck`
3. Run `bun run test`
4. Run `bun run onboard`
5. Run `bun run eval:consult`
6. Run `bun run smoke:mcp`
7. On Windows, run `bun run smoke:claude`

## Artifacts

Expected local artifacts after a healthy run:

- `artifacts/consult-eval.latest.json`
- `artifacts/claude-mcp.debug.log` after Claude smoke
- local SQLite database in the OS-native app-data directory unless an override is used

# best-brain

`best-brain` is a local-first personal AI operating system core.

It keeps the user's persona, mission context, verification state, and durable memory in one place. It does not orchestrate workers yet; it exposes stable HTTP and MCP interfaces so a future manager layer can call into the brain.

## Current layout

- `brain/oracle-core`: vendored `oracle-v2` source pinned for internal reuse
- `src`: best-brain runtime, schema, policies, transports, and services
- `tests`: Bun tests for schema, retrieval, mission proof, and HTTP flows
- `scripts`: seed and evaluation helpers

## Run

```bash
bun install
bun run server
```

The HTTP server defaults to `http://localhost:47888`.

## Key endpoints

- `POST /brain/consult`
- `POST /brain/learn`
- `GET /brain/context`
- `POST /missions/:id/outcome`
- `POST /failures`
- `POST /verification/start`
- `POST /verification/complete`
- `GET /preferences/format`

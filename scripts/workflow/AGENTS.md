# Dev Workflow Helpers

## Overview

`scripts/workflow/` is the Node-side orchestration library behind `pnpm run dev:desktop`, `pnpm run dev:desktop:remote`, `pnpm run dev:android`, `pnpm run dev:web`, `pnpm run e2e:native`, and SITL tooling. It owns SITL runtime port math, container lifecycle, child-process cleanup, and readiness polling for the local Tauri dev workflows.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Agent remote UI entrypoint | `../remote-ui.mjs` | SITL + Tauri dev + browser bridge workflow |
| Paths / forwarded args | `paths.mjs` | Repository root and CLI passthrough helpers |
| Environment composition | `env.mjs` | Frontend, SITL, Android, web, demo, and remote UI env snippets |
| Frontend command wrappers | `frontend.mjs` | Shared Vite dev and frontend build runners |
| Tauri command wrappers | `tauri.mjs` | Shared Tauri desktop and Android dev runners |
| Port / instance math | `runtime.mjs` | Canonical Node-side runtime model |
| Generic port helpers | `ports.mjs` | Reserved/free TCP port helpers |
| Runtime tests | `runtime.test.mjs` | Runs under `pnpm run test:frontend` |
| Docker SITL lifecycle | `sitl.mjs` | Start/stop helpers |
| Managed SITL sessions | `sitl-session.mjs` | Shared runtime resolution, readiness wait, cleanup, signal handling |
| SITL WebSocket bridge | `sitl-ws.mjs` | WebSocket bridge config, port parsing, bridge lifecycle |
| WASM web outputs | `wasm-web.mjs` | Generated WASM transient-file cleanup helpers |
| Process spawning / cleanup | `process.mjs` | Cleanup stack, managed child processes, process-group termination |
| TCP / HTTP readiness waits | `wait.mjs` | SITL readiness polling and generic wait helpers |

## Core Rules

- `runtime.mjs` is the Node-side source of truth for instance-to-port/container mapping.
- `resolveRequestedRuntime()` uses a pinned instance when env vars are set, otherwise it scans for a free one.
- `runtimeEnv()` is the canonical env serialization passed into child processes.
- `sitl-session.mjs` is the high-level reusable wrapper for scripts that need a managed SITL process.
- Use `runManagedChild()` for long-running child processes that should terminate during cleanup.
- Keep target-specific environment variables in `env.mjs` rather than duplicating `VITE_IRONWING_*` names in entrypoints.
- Keep generated WASM transient-file policy in `wasm-web.mjs`; scripts may call those helpers but should not duplicate file lists.
- `createCleanupRunner()` is a LIFO cleanup stack; register teardown in reverse dependency order.
- `terminateChild()` targets the whole process group on non-Windows. Do not replace it with naive child killing.
- `sitl.mjs` always force-removes any old container before starting a new one.

## Notes

- `scripts/dev.mjs` is the normal native dev entrypoint that composes this folder.
- `scripts/remote-ui.mjs` is the agent remote UI entrypoint; keep it focused on local agent visibility, not automated Playwright coverage.
- `runtime.test.mjs` is included by the frontend Vitest suite through `scripts/**/*.test.mjs`.
- SITL ports and container naming conventions belong here if they change.

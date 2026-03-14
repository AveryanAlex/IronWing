# Dev Workflow Helpers

## Overview

`scripts/workflow/` is the Node-side orchestration library behind `pnpm run dev`. It owns SITL runtime port math, container lifecycle, child-process cleanup, and readiness polling for the local Tauri dev workflow.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Port / instance math | `runtime.mjs` | Canonical Node-side runtime model |
| Runtime tests | `runtime.test.mjs` | Runs under `pnpm test` |
| Docker SITL lifecycle | `sitl.mjs` | Start/stop helpers |
| Process spawning / cleanup | `process.mjs` | Cleanup stack and process-group termination |
| TCP / HTTP readiness waits | `wait.mjs` | SITL readiness polling and generic wait helpers |

## Core Rules

- `runtime.mjs` is the Node-side source of truth for instance-to-port/container mapping.
- `resolveRequestedRuntime()` uses a pinned instance when env vars are set, otherwise it scans for a free one.
- `runtimeEnv()` is the canonical env serialization passed into child processes.
- `createCleanupRunner()` is a LIFO cleanup stack; register teardown in reverse dependency order.
- `terminateChild()` targets the whole process group on non-Windows. Do not replace it with naive child killing.
- `sitl.mjs` always force-removes any old container before starting a new one.

## Notes

- `scripts/dev.mjs` is the entrypoint that composes this folder.
- `runtime.test.mjs` is included by the main Vitest suite through `scripts/**/*.test.mjs`.
- SITL ports and container naming conventions belong here if they change.

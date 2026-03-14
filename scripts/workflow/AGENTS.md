# Dev / E2E Workflow Helpers

## Overview

`scripts/workflow/` is the Node-side orchestration library behind `pnpm run dev` and `pnpm e2e`. It owns runtime port math, SITL lifecycle, child-process cleanup, and readiness polling.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Port / instance math | `runtime.mjs` | Canonical Node-side runtime model |
| Runtime tests | `runtime.test.mjs` | Runs under `pnpm test` |
| Docker SITL lifecycle | `sitl.mjs` | Start/stop helpers |
| Process spawning / cleanup | `process.mjs` | Cleanup stack and process-group termination |
| TCP / HTTP readiness waits | `wait.mjs` | SITL and Remote UI readiness polling |

## Core Rules

- `runtime.mjs` is the Node-side source of truth for instance-to-port/container mapping.
- Keep `runtime.mjs` aligned with `src/lib/e2e-runtime.ts`; they intentionally mirror each other.
- `resolveRequestedRuntime()` uses a pinned instance when env vars are set, otherwise it scans for a free one.
- `runtimeEnv()` is the canonical env serialization passed into child processes.
- `createCleanupRunner()` is a LIFO cleanup stack; register teardown in reverse dependency order.
- `terminateChild()` targets the whole process group on non-Windows. Do not replace it with naive child killing.
- `sitl.mjs` always force-removes any old container before starting a new one.

## Notes

- `scripts/dev.mjs` and `scripts/e2e.mjs` are the entrypoints that compose this folder.
- `runtime.test.mjs` is included by the main Vitest suite through `scripts/**/*.test.mjs`.
- Remote UI, SITL ports, and container naming conventions belong here if they change.

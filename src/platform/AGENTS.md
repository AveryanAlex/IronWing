# Platform IPC Boundary

## Overview

`src/platform/` is the build-time IPC shim that keeps normal Tauri builds and Remote UI E2E builds on the same frontend call surface.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Native IPC surface | `tauri/core.ts`, `tauri/event.ts`, `tauri/http.ts` | Thin re-exports of Tauri APIs |
| Remote UI invoke path | `remote-ui/core.ts`, `remote-ui/socket.ts` | WebSocket request/response layer |
| Remote UI event path | `remote-ui/event.ts` | EventTarget-based listen/unlisten wrapper |
| Boundary enforcement | `import-boundary.test.ts` | Architectural guardrail |

## Rules

- All frontend IPC imports outside this directory must use `@platform/core`, `@platform/event`, or `@platform/http`.
- Do not import `@tauri-apps/api/core` or `@tauri-apps/api/event` directly anywhere else.
- Keep the `tauri/` and `remote-ui/` surfaces compatible: same function names, same argument shapes, same return expectations.
- `vite.config.ts` selects `tauri/` vs `remote-ui/` at build time via `IRONWING_E2E=1`.
- `vitest.config.ts` resolves the aliases to `tauri/` for unit tests.

## Remote UI Notes

- `remote-ui/socket.ts` owns the singleton WebSocket, invoke timeout, keepalive ping, and `pendingInvokes` map.
- `remote-ui/event.ts` wraps an `EventTarget`; listeners dispatch by event name and return an explicit unlisten function.
- Remote UI is for E2E/dev only. Do not treat it as a production browser transport layer.

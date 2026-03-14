# Platform IPC Boundary

## Overview

`src/platform/` is the build-time IPC shim that keeps normal Tauri builds and mocked-browser Playwright builds on the same frontend call surface.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Native IPC surface | `tauri/core.ts`, `tauri/event.ts`, `tauri/http.ts` | Thin re-exports of Tauri APIs |
| Mocked browser IPC surface | `mock/core.ts`, `mock/event.ts`, `mock/http.ts` | Browser-only invoke/event/fetch stubs |
| Mock backend controller | `mock/backend.ts` | Idle startup defaults, command overrides, emitted events |
| Boundary enforcement | `import-boundary.test.ts` | Architectural guardrail |

## Rules

- All frontend IPC imports outside this directory must use `@platform/core`, `@platform/event`, or `@platform/http`.
- Do not import `@tauri-apps/api/core` or `@tauri-apps/api/event` directly anywhere else.
- Keep the `tauri/` and `mock/` surfaces compatible: same function names, same argument shapes, same return expectations.
- `vite.config.ts` selects `tauri/` vs `mock/` at build time via `IRONWING_PLATFORM=mock`.
- `vitest.config.ts` resolves the aliases to `tauri/` for unit tests.

## Mock Platform Notes

- `mock/backend.ts` owns startup defaults plus the browser-global controller exposed as `window.__IRONWING_MOCK_PLATFORM__`.
- Playwright tests should configure mocked behavior at the `@platform/*` boundary, not by patching DOM internals.
- The mock platform is for browser-only Playwright tests. It does not prove real Tauri or Rust integration.

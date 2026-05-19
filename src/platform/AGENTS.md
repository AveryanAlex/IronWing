# Platform IPC Boundary

## Overview

`src/platform/` is the build-time IPC shim that keeps pure web, normal Tauri, agent remote UI, and mocked-browser Playwright builds on the same frontend call surface.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Native IPC surface | `tauri/core.ts`, `tauri/event.ts`, `tauri/http.ts` | Thin re-exports of Tauri APIs |
| Pure web IPC surface | `web/core.ts`, `web/event.ts`, `web/http.ts` | Browser/WASM runtime for raw Vite builds |
| Agent remote UI IPC surface | `remote/core.ts`, `remote/event.ts`, `remote/http.ts` | Browser-facing bridge to a running Tauri app |
| Mocked browser IPC surface | `mock/core.ts`, `mock/event.ts`, `mock/http.ts` | Browser-only invoke/event/fetch stubs |
| Mock backend controller | `mock/backend.ts` | Idle startup defaults, command overrides, emitted events |
| Boundary enforcement | `import-boundary.test.ts` | Architectural guardrail |

## Rules

- All frontend IPC imports outside this directory must use `@platform/core`, `@platform/event`, or `@platform/http`.
- Do not import `@tauri-apps/api/core` or `@tauri-apps/api/event` directly anywhere else.
- Keep the `web/`, `tauri/`, `remote/`, and `mock/` surfaces compatible: same function names, same argument shapes, same return expectations.
- `vite.config.ts` defaults to `web/`, switches to `tauri/` for Tauri CLI hook environments, and accepts explicit `IRONWING_PLATFORM=tauri|web|remote|mock` overrides.
- `vitest.config.ts` resolves the aliases to `tauri/` for unit tests.

## Web Platform Notes

- Raw Vite commands (`pnpm exec vite`, `pnpm exec vite build`) use `web/` and build the Rust WASM bridge through the Vite config.
- The generated `ironwing_wasm.js` and `.wasm` files are transient and ignored; keep `ironwing_wasm.d.ts` checked in unless intentionally regenerating bindings.

## Mock Platform Notes

- `mock/backend.ts` owns startup defaults plus the browser-global controller exposed as `window.__IRONWING_MOCK_PLATFORM__`.
- Playwright tests should configure mocked behavior at the `@platform/*` boundary, not by patching DOM internals.
- The mock platform is for browser-only Playwright tests. It does not prove real Tauri or Rust integration.

## Remote Platform Notes

- `remote/` is for agent-operated browser sessions against a live Tauri shell, not for automated browser E2E.
- `pnpm run dev:desktop:remote` sets `IRONWING_PLATFORM=remote`, starts the Rust bridge, and prints the browser URL.
- Keep `remote/` compatible with the `tauri/` and `mock/` surfaces: `invoke`, `listen`, `openUrl`, and `fetch` must keep the same call shapes.
- The bridge is dev-only and unauthenticated. Do not expose it outside trusted local agent workflows.

# Playwright E2E

## Overview

`e2e/` covers cross-layer flows against the real Tauri app through Remote UI, with the Rust backend talking directly to SITL. These specs validate user-visible behavior, not implementation details.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Playwright config | `../playwright.config.ts` | Serial workers, baseURL from runtime |
| E2E orchestration | `../scripts/e2e.mjs` | Build + SITL + app launch + cleanup |
| Runtime port model | `../src/lib/e2e-runtime.ts`, `../scripts/workflow/runtime.mjs` | Keep the two mirrors aligned |
| Minimal liveness check | `smoke.spec.ts` | Fastest spec to debug harness issues |
| Happy-path connect flow | `sitl-connect.spec.ts` | Most complete spec |
| Validation / cancel negatives | `invalid-udp-bind.spec.ts`, `wrong-port-cancel.spec.ts` | Error handling and cleanup expectations |

## Workflow

- Run with `pnpm e2e` or `pnpm e2e:headed`.
- The runner builds the frontend with `IRONWING_E2E=1`, builds Rust with `custom-protocol,e2e-remote-ui`, starts SITL, launches the app, waits for `/keep_alive`, then runs Playwright.
- `workers: 1` is intentional.
- `E2E_INSTANCE_ID` pins a runtime instance; otherwise the workflow scans for a free one.
- Failure artifacts (trace, screenshot, video) are enabled via Playwright config.

## Spec Conventions

- Test real flows through stable `data-testid` selectors and visible state changes.
- Prefer setup/cleanup that returns the app to Idle before asserting the main scenario.
- Use `resolveE2ERuntime()` for ports and addresses rather than hardcoded values.
- Keep specs focused on user-visible transitions: connect, disconnect, error surfacing, disabled/enabled controls, telemetry arrival.

## Scope Limits

- Remote UI is a test transport, not a production browser architecture.
- The browser talks to the local Rust process via RPC/WebSocket; it does not open MAVLink transports itself.

# Playwright E2E

## Overview

`e2e/` covers browser-only Playwright flows against the production frontend bundle with the `@platform/*` boundary resolved to a mocked browser implementation. These specs validate user-visible behavior with stable mocked backend state, not real Rust or SITL integration.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Playwright config | `../playwright.config.ts` | Local serial workers, CI dual workers, build + preview web server |
| Mock platform | `../src/platform/mock/` | Browser-only invoke/listen/fetch shim |
| Playwright fixture | `fixtures/mock-platform.ts` | Command overrides and emitted events |
| Minimal liveness check | `smoke.spec.ts` | Fastest spec to debug harness issues |
| Happy-path connect flow | `connect-telemetry.spec.ts` | Most complete mocked flow |
| Validation / cancel negatives | `invalid-udp-bind.spec.ts`, `wrong-port-cancel.spec.ts` | Error handling and cleanup expectations |

## Workflow

- Run with `pnpm e2e` or `pnpm e2e:headed`.
- Playwright builds the frontend with `IRONWING_PLATFORM=mock`, starts a local preview server, then runs the browser suite against that server.
- Local runs stay on `workers: 1`; CI uses `workers: 2` to reduce wall-clock time without fully parallelizing individual spec files.
- Failure artifacts (trace, screenshot, video) are enabled via Playwright config.

## Spec Conventions

- Test real flows through stable `data-testid` selectors and visible state changes.
- Prefer setup/cleanup that returns the mock backend and UI to Idle before asserting the main scenario.
- Configure mocked command behavior through `fixtures/mock-platform.ts` instead of patching DOM state.
- Keep specs focused on user-visible transitions: connect, disconnect, error surfacing, disabled/enabled controls, telemetry arrival.
- Keep active browser proofs self-contained under `e2e/`; do not import removed legacy helpers or React-era test code.

## Scope Limits

- The mock platform is not a production browser transport architecture.
- These tests do not prove real Tauri, Rust, or SITL integration. That thin native coverage now lives in `../e2e-native/` via WebDriverIO.

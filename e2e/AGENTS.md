# Playwright E2E

## Overview

`e2e/` covers browser-only Playwright UI flows against the production frontend bundle with `IRONWING_PLATFORM=web`. The browser suite exercises the real Web/WASM platform adapter and connects to `mavkit::sim::DemoVehicle` by selecting the Demo transport in the UI.

Browser E2E is a UI lane: tests interact only through rendered controls, links, and visible UI state. Do not use `@platform/mock`, `src/platform/mock/*`, `window.__IRONWING_MOCK_PLATFORM__`, app-internal command overrides, fake platform events, or synthetic backend state.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Playwright config | `../playwright.config.ts` | Runs `build:web` unless `IRONWING_E2E_SKIP_BUILD=1`, serves `dist/web`, artifacts, retries, workers |
| Specs | `specs/*.spec.ts` | One short, readable spec file per workspace by default |
| Test fixture | `support/test.ts` | Exports Playwright `test`, `expect`, and the app page object |
| App/page objects | `support/app.ts`, `support/pages/*` | Thin app composition plus one focused page object per surface |
| Scenario data | `support/data/*` | Typed mission plans, setup sections, and edit candidates |
| Layout helpers | `support/layout.ts` | Viewport canaries and simple overflow assertions |

## Workflow

- Run with `pnpm run e2e:browser` or `pnpm run e2e:browser:headed`.
- Playwright runs `pnpm run build:web`, starts `../scripts/e2e-serve.mjs` for the `dist/web` bundle, then runs the browser suite against that server. CI downloads the build job's `dist/web` artifact and sets `IRONWING_E2E_SKIP_BUILD=1` so this lane only serves the prebuilt bundle.
- Specs connect by selecting `Demo` in the connection transport UI, choosing a demo preset, and pressing Connect. Wait for real connected state and telemetry emitted through the Web/WASM adapter.
- Local runs stay on `workers: 1`; CI uses limited parallelism to reduce wall-clock time without fully parallelizing every browser interaction.
- Failure artifacts (trace, screenshot, video) are enabled via Playwright config.

## Spec Conventions

- Keep specs compact and non-parity. Default to one spec file per workspace; smoke is the harness check.
- Specs should explain the scenario with `test.step(...)`: arrange/connect, open the workspace, perform the user action, and assert the result. A reader should understand what is being proven without opening support files.
- Put selectors, button-click mechanics, branching, retries, and web-first assertions in focused page objects under `support/pages/*`. Do not create god support files that collect unrelated workspaces.
- Put reusable scenario data in `support/data/*`; keep it typed and immutable.
- Workspace specs may be deeper when the workspace is important: setup should open every section and prove at least one safe parameter write/apply/reload round-trip; mission should prove multi-item authoring plus upload/readback.
- Use normal UI navigation and controls. Do not patch DOM state, inject app commands, dispatch fake platform events, or seed backend state.
- Avoid file picker mocks. For logs and firmware, assert that the UI opens and empty, unsupported, or capability-limited states are sane.
- Keep active browser proofs self-contained under `e2e/`; do not import removed legacy helpers or React-era test code.

## Scope Limits

- Deep domain behavior, edge-case command handling, serialization, and MAVLink contract coverage belong in focused unit/contract tests.
- Browser E2E does not prove native Tauri, desktop transports, or SITL integration. Native coverage remains separate in `../e2e-native/` via WebDriverIO and real SITL; do not modify that lane from browser E2E work.

# Native WebDriver E2E

## Overview

`e2e-native/` is the thin real-stack desktop lane: WebDriverIO drives the native Tauri app, the Rust shell talks to a real ArduPilot SITL instance, and the frontend renders the live state. Keep this suite small and slow on purpose.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Top-level orchestrator | `../scripts/e2e-native.mjs` | Reuses `scripts/workflow/*` for build, SITL lifecycle, cleanup |
| WDIO config | `wdio.conf.mjs` | Spawns `tauri-driver`, points at the built debug binary |
| First smoke test | `smoke.spec.mjs` | Idle → connect → telemetry → disconnect |
| Shared runtime helpers | `../scripts/workflow/native-e2e.mjs` | Build env + native app path helpers |

## Workflow

- Run with `pnpm run e2e:native`.
- The script builds a debug no-bundle Tauri app with the SITL TCP env baked into the frontend bundle.
- It then starts Docker SITL, waits for the TCP port to come up, launches WDIO, and always tears SITL down on exit.
- `tauri-driver` must be installed and available on `PATH` (or provided via `IRONWING_TAURI_DRIVER_PATH`). Linux also needs `WebKitWebDriver`.

## Spec Conventions

- Use stable `data-testid` selectors that already exist in the active Svelte frontend.
- Assert only the thinnest real-stack behavior needed: window loads, TCP defaults are injected, connect succeeds, live telemetry arrives, disconnect returns to Idle.
- Keep selectors and assertions anchored to the shipped shell/runtime cards; do not reach into archived `src-old/` surfaces or resurrect legacy proof helpers.
- Keep `maxInstances: 1`; do not parallelize native sessions.
- Prefer expanding coverage by adding a few high-value flows, not by mirroring the browser-only Playwright suite.

## Scope Limits

- This is not the place for broad mocked UI coverage; keep that in `../e2e/`.
- Avoid adding many long-running native tests until the lane proves stable in local development and CI.

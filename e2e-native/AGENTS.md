# Native WebDriver E2E

## Overview

`e2e-native/` is the thin real-stack desktop integration lane: WebDriverIO drives the native Tauri app, the Rust shell talks over TCP to a real ArduPilot SITL instance, and the frontend renders the live state. Keep this suite small and slow on purpose. Do not convert this lane to demo-only, mock-only, or a mirror of browser UI coverage.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Top-level orchestrator | `../scripts/e2e-native.mjs` | Reuses `scripts/workflow/*` for build, SITL lifecycle, cleanup |
| WDIO config | `wdio.conf.mjs` | Spawns `tauri-driver`, points at the built debug binary |
| Real-stack workflow spec | `smoke.spec.mjs` | Boot → connect → telemetry/settings → mission transfer → disconnect |
| Shared runtime helpers | `../scripts/workflow/native-e2e.mjs` | Build env + native app path helpers |

## Workflow

- Run with `pnpm run e2e:native`.
- The script builds a debug no-bundle Tauri app with the SITL TCP env baked into the frontend bundle.
- It then starts Docker SITL, waits for the TCP port to come up, launches WDIO, and always tears SITL down on exit.
- `tauri-driver` must be installed and available on `PATH` (or provided via `IRONWING_TAURI_DRIVER_PATH`). Linux also needs `WebKitWebDriver`.

## Spec Conventions

- Use stable `data-testid` selectors that already exist in the active Svelte frontend.
- Cover high-value real-stack behavior that browser UI E2E cannot prove: window loads, TCP defaults are injected, connect succeeds, live telemetry arrives, live settings invokes reach Rust, mission upload/readback works against SITL, and disconnect returns to Idle.
- Keep the native lane on the real SITL/TCP stack because it is the most integration-oriented E2E coverage in the repo. The MAVKit demo vehicle belongs to browser UI E2E coverage, not as a replacement for this native smoke lane.
- Treat connection state as current app behavior: idle = `connection-connect-btn` visible/enabled with no cancel/disconnect controls, connecting = `connection-cancel-btn`, connected = `connection-disconnect-btn`. Do not use the removed `connection-status-text` selector.
- Keep native assertions focused on real backend boundaries and stable app-visible outcomes. It is acceptable to include a small connected mission/settings flow here; keep broad layout, mocked edge cases, and exhaustive UI matrix coverage in browser E2E.
- Keep selectors and assertions anchored to the shipped shell/runtime cards; do not resurrect removed legacy proof helpers.
- Keep `maxInstances: 1`; do not parallelize native sessions.
- Prefer expanding coverage by adding a few high-value flows, not by mirroring the browser-only Playwright suite.

## Scope Limits

- This is not the place for broad mocked UI coverage; keep that in `../e2e/`.
- Do not duplicate the browser Playwright UI matrix here; add only a few stable flows that prove native Tauri ↔ Rust ↔ SITL/TCP integration.
- Avoid adding many long-running native tests until the lane proves stable in local development and CI.

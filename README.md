# IronWing

Modern ground control station using Tauri + Svelte + Rust.

## Stack

- Desktop + Mobile: Tauri v2 (desktop + Android)
- Frontend: Svelte + TypeScript + Vite + Tailwind CSS
- Core: Rust (MAVKit, crate: `mavkit` — async MAVLink SDK)
- Map: MapLibre GL JS (3D terrain + satellite)
- Transports: UDP, Serial, BLE (Nordic UART), Classic SPP (Android)

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- `wasm-pack` and the `wasm32-unknown-unknown` target for default Vite/web builds
- pnpm
- Optional but recommended: Nix (`nix develop`) for a preconfigured shell

## Local development

Install dependencies:

```bash
pnpm install
```

Common commands:

```bash
pnpm run dev:desktop
pnpm run check
pnpm run test
pnpm run build:frontend
pnpm run dev:web
```

SvelteKit's Vite commands default to the pure web platform: `pnpm exec vite` serves the browser/WASM frontend, and `pnpm exec vite build` writes `dist/web`. Use `pnpm run dev:web` when you also want SITL and the WebSocket bridge managed for you.

## Use IronWing with ArduPilot SITL (development)

Dev commands start ArduPilot SITL automatically for live vehicle workflows. For a no-SITL walkthrough, select the built-in **Demo vehicle** transport in the normal web or desktop app.

`pnpm run dev:desktop` is the local desktop SITL workflow. It picks a free instance, starts ArduPilot SITL in Docker, launches Tauri dev, and tears the SITL container down automatically when the app exits or you press Ctrl+C.

```bash
pnpm run dev:desktop
```

In the desktop app, TCP mode is preselected for this workflow and the matching `127.0.0.1:<port>` address is prefilled. If another stack is already using the baseline port, the script prints the chosen TCP address before the app opens. `pnpm run dev:web` starts SITL plus a WebSocket bridge and preselects the bridge URL. `pnpm run dev:android` starts SITL and preselects an emulator-friendly TCP address; set `IRONWING_ANDROID_SITL_HOST` for physical devices or custom networking.

## Flight Operations (GUI)

After connecting to a vehicle, the sidebar shows vehicle status and flight controls.

### Connect

1. Select a transport: **Demo vehicle**, **UDP**, **TCP**, **Serial**, **BLE**, or **Classic SPP** (Android)
2. For UDP: enter bind address (default `0.0.0.0:14550`)
3. For TCP: enter address (default `127.0.0.1:5760`)
4. For BLE: scan and select your device
5. For Serial: select port and baud rate
6. For Demo vehicle: choose a vehicle preset
7. Click **Connect**
8. Wait for status to show "connected" and telemetry to appear

### Arm and Disarm

- Click **Arm** to arm the vehicle (requires GPS fix and pre-arm checks to pass)
- Click **Disarm** to disarm

Arming may take a few seconds after a fresh SITL start while the EKF converges.

### Change Flight Mode

Use the mode dropdown in the left panel to switch modes (STABILIZE, GUIDED, LOITER, RTL, LAND, etc.). The dropdown auto-populates based on vehicle type after the first heartbeat.

Quick-action buttons for **RTL**, **Land**, and **Loiter** are available below the dropdown.

### Takeoff

1. Enter a target altitude in meters (default 10)
2. Click **Takeoff**

Takeoff automatically sets GUIDED mode, arms the vehicle, and sends the NAV_TAKEOFF command. You do not need to arm or set mode manually beforehand.

### Guided Goto (Fly to Point)

On the **Flight Data** tab, **right-click** anywhere on the map to send the vehicle to that location. The vehicle must be armed and in GUIDED mode. The goto command uses the vehicle's current altitude.

### Land / Return to Launch

- Click **Land** to switch to LAND mode (vehicle descends and auto-disarms on touchdown)
- Click **RTL** to return to the launch point and land

### Typical SITL Flight Sequence

```
Connect → Takeoff (10m) → right-click map to fly around → Land or RTL
```

## Android

Requires Android SDK + NDK. Run on a connected device or emulator. The dev command starts SITL automatically:

```bash
pnpm run dev:android       # Dev build on device/emulator
pnpm run build:android     # Build APK
```

Android supports UDP, BLE, and Classic SPP transports. Serial is excluded (doesn't compile for Android targets).

## End-to-End Testing (Playwright)

Browser-based E2E tests run against the production frontend bundle with `IRONWING_PLATFORM=web`. This is a **browser UI workflow**: it validates user-visible behavior through the real Web/WASM adapter and the built-in MAVKit demo vehicle, not native Tauri or SITL integration.

### How it works

1. By default, Playwright runs `pnpm run build:web`, which builds the browser Web/WASM bundle in `dist/web`.
2. Playwright starts a local Vite preview server for the built app. Set `IRONWING_E2E_SKIP_BUILD=1` to reuse an existing `dist/web` bundle without rebuilding.
3. Specs select the Demo transport in the rendered connection UI and connect to `mavkit::sim::DemoVehicle`.
4. Specs drive the app through real browser interactions and assert visible state changes. They do not patch app internals, dispatch fake platform events, or use command overrides.

### Quick start

```bash
# One-shot: build the frontend bundle, start a local preview, run Playwright
pnpm run e2e:browser
```

Other useful commands:

```bash
pnpm run e2e:browser:headed   # Run tests with a visible browser window
pnpm run e2e                  # Run all browser and native E2E lanes sequentially
```

`pnpm run e2e:browser` uses Playwright's built-in `webServer` support to run `build:web` unless `IRONWING_E2E_SKIP_BUILD=1`, start a preview server, run the browser suite, and clean up afterward. CI downloads the `dist/web` artifact from the build job and sets that skip flag so the browser E2E lane never rebuilds the web bundle.

### Current test scope

Compact demo-backed specs live under `e2e/specs/`. The default shape is one readable spec file per workspace. Specs use `test.step(...)` to show the user journey; selector-heavy clicking/waiting logic lives in focused page objects under `e2e/support/pages/`, and reusable scenario data lives under `e2e/support/data/`.

- **smoke.spec.ts** — Boots the web bundle, selects Demo, connects, and verifies the live overview.
- **connection.spec.ts** — Checks Demo transport help, diagnostics, connect/disconnect/reconnect, and phone vehicle drawer access.
- **overview.spec.ts** — Checks live overview state and the compact connected layout canary.
- **telemetry.spec.ts** / **hud.spec.ts** — Check live demo flight metrics and instruments.
- **mission.spec.ts** — Authors a mixed mission, uploads it to the demo vehicle, clears local state, reads it back, and checks undo/redo plus survey/fence/rally planning tools.
- **setup.spec.ts** — Downloads demo parameters, opens every setup section, applies guided and raw safe parameter edits, reloads from the vehicle, and verifies persistence.
- **logs.spec.ts** / **firmware.spec.ts** / **settings.spec.ts** — Check workspace-specific empty, capability-limited/recovery, and mutable settings surfaces.

Local Playwright runs stay serial (`workers: 1`); CI uses limited parallelism. Traces, screenshots, and video are captured on failure.

### Scope limits

- These tests do **not** prove native Tauri or SITL integration.
- Deep serialization, command edge cases, firmware flashing, log parsing, and broad MAVLink contract coverage belong in unit/contract tests or the native/SITL lane as appropriate.
- `pnpm run dev:desktop` remains the real SITL workflow: it starts ArduPilot SITL and launches the native Tauri app with the matching TCP address prefilled.

## Native End-to-End Testing (WebDriverIO)

`pnpm run e2e:native` is the thin real-stack desktop lane: it builds a debug Tauri app, starts SITL, launches the native app through `tauri-driver`, and runs one WebDriverIO smoke test against the real Rust + frontend stack.

### Prerequisites

- `tauri-driver` on `PATH` (`cargo install tauri-driver --locked`) or `IRONWING_TAURI_DRIVER_PATH=/path/to/tauri-driver`
- `WebKitWebDriver` on Linux

### Quick start

```bash
pnpm run e2e:native
```

### Current native scope

- **e2e-native/smoke.spec.mjs** — Verifies the native app launches, TCP SITL defaults are prefilled, connect succeeds against real SITL, telemetry renders, and disconnect returns to Idle.

Keep this lane intentionally small. Broad UI coverage still belongs in the browser-only Playwright suite above.

## Build outputs

Frontend bundles are separated by target under `dist/`:

| Command | Output |
| --- | --- |
| `pnpm exec vite build` | `dist/web` |
| `pnpm run build:frontend` | `dist/web` |
| `pnpm run build:desktop` | `dist/tauri` |
| `pnpm run build:android` | `dist/tauri` |
| `pnpm run build:web` | `dist/web` |
| `pnpm run e2e:browser` | reuses `dist/web` |

Set `IRONWING_OUT_DIR` to override a specific build artifact directory.

## CI

- `.github/workflows/ci.yml`: frontend checks/tests, backend checks/tests, native E2E, web build artifact creation, browser E2E from the downloaded artifact, and GitHub Pages publishing on `main` after all checks pass.

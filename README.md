# IronWing

Modern ground control station using Tauri + React + Rust.

## Stack

- Desktop + Mobile: Tauri v2 (desktop + Android)
- Frontend: React + TypeScript + Vite + Radix UI + Tailwind CSS
- Core: Rust (MAVKit, crate: `mavkit` — async MAVLink SDK)
- Map: MapLibre GL JS (3D terrain + satellite)
- Transports: UDP, Serial, BLE (Nordic UART), Classic SPP (Android)

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- pnpm
- Optional but recommended: Nix (`nix develop`) for a preconfigured shell

## Local development

Install dependencies:

```bash
pnpm install
```

Common commands:

```bash
pnpm run dev
pnpm run frontend:typecheck
pnpm run frontend:build
cargo check --workspace
cargo test --workspace
pnpm run tauri:dev
```

## Use IronWing with ArduPilot SITL (development)

`pnpm run dev` is the local SITL workflow. It picks a free instance, starts ArduPilot SITL in Docker, launches `pnpm run tauri:dev`, and tears the SITL container down automatically when the app exits or you press Ctrl+C.

```bash
pnpm run dev
```

In the app, TCP mode is preselected for this workflow and the matching `127.0.0.1:<port>` address is prefilled. If another stack is already using the baseline port, the script prints the chosen TCP address before the app opens.

## Flight Operations (GUI)

After connecting to a vehicle, the sidebar shows vehicle status and flight controls.

### Connect

1. Select a transport: **UDP**, **Serial**, **BLE**, or **Classic SPP** (Android)
2. For UDP: enter bind address (default `0.0.0.0:14550`)
3. For TCP: enter address (default `127.0.0.1:5760`)
4. For BLE: scan and select your device
5. For Serial: select port and baud rate
6. Click **Connect**
7. Wait for status to show "connected" and telemetry to appear

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

Requires Android SDK + NDK. Run on a connected device or emulator:

```bash
pnpm run android:dev       # Dev build on device/emulator
pnpm run android:build     # Build APK
```

Android supports UDP, BLE, and Classic SPP transports. Serial is excluded (doesn't compile for Android targets).

## End-to-End Testing (Playwright)

Browser-based E2E tests now run against the production frontend bundle with the `@platform/*` boundary resolved to a mocked browser implementation. This is a **browser-only UI workflow**: it validates user-visible behavior, not real Tauri, Rust, or SITL integration.

### How it works

1. Playwright builds the frontend with `IRONWING_PLATFORM=mock`, which swaps the native `@platform/*` imports for browser-safe mock implementations.
2. Playwright starts a local Vite preview server for the built app.
3. The browser tests configure mocked command results and emitted events through the `window.__IRONWING_MOCK_PLATFORM__` controller exposed by `src/platform/mock/backend.ts`.
4. Specs drive the app through real browser interactions and assert visible state changes.

### Quick start

```bash
# One-shot: build the frontend bundle, start a local preview, run Playwright
pnpm e2e
```

Other useful commands:

```bash
pnpm e2e:headed          # Run tests with a visible browser window
```

`pnpm e2e` uses Playwright's built-in `webServer` support to build the frontend, start a preview server, run the browser suite, and clean up afterward.

### Current test scope

Four spec files in `e2e/`:

- **smoke.spec.ts** — Verifies the app loads and reaches the idle connection state in browser-only mode.
- **connect-telemetry.spec.ts** — Mocked connect/telemetry/disconnect cycle: selects TCP transport, connects, receives mocked link/vehicle/telemetry events, then disconnects and confirms idle state.
- **wrong-port-cancel.spec.ts** — Negative path: starts a deferred mocked connection, verifies "Connecting" state and UI lockout, cancels, and confirms clean return to idle with controls re-enabled.
- **invalid-udp-bind.spec.ts** — Negative path: submits a mocked `connect_link` failure and verifies the app surfaces the validation error cleanly.

Each Playwright invocation still runs serially (`workers: 1`). Traces, screenshots, and video are captured on failure.

### Scope limits

- These tests do **not** prove real Tauri or Rust integration.
- `pnpm run dev` remains the real SITL workflow: it starts ArduPilot SITL and launches the native Tauri app with the matching TCP address prefilled.

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

## CI

- `.github/workflows/ci.yml`: frontend typecheck/build + Rust check/tests on every push and PR

## Planning

Project roadmap and current milestone tracking live in `PLAN.md`.

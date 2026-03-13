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

## End-to-End Testing (Playwright + SITL)

Browser-based E2E tests run against the real Tauri app connected directly to an ArduPilot SITL instance over TCP. Tauri's Remote UI crate (`tauri-remote-ui`) exposes the frontend on a local per-run port so Playwright can drive it from a standard Chromium browser. This is a **dev/test-only** mechanism, not a production web deployment.

### How it works

1. Frontend is built with `IRONWING_E2E=1`, which swaps Tauri IPC imports for a WebSocket-based implementation that talks to the Remote UI RPC proxy.
2. The Rust binary is compiled with `--features custom-protocol,e2e-remote-ui`, enabling the Remote UI HTTP/WS server on a per-run local port.
3. Playwright auto-picks the first free instance id, starts a Docker SITL container on that instance's TCP port, and waits for the TCP endpoint to come up.
4. The app launches with Remote UI enabled (the native window shows a placeholder page while the browser host serves the real UI). A liveness check polls the matching `http://127.0.0.1:<port>/keep_alive` endpoint until the server is ready.
5. Playwright opens Chromium on that same Remote UI port, and the happy-path spec connects directly to SITL over TCP.

### Quick start

```bash
# One-shot: build + start everything + run tests + tear down
pnpm e2e

# Pin a specific stack manually if you need to
E2E_INSTANCE_ID=1 pnpm e2e
```

Other useful commands:

```bash
pnpm e2e:headed          # Run tests with a visible browser window
```

`pnpm e2e` uses the Node entrypoint `scripts/e2e.mjs`, which picks a free instance, builds the frontend and Rust app, starts SITL, launches the Remote UI binary, runs Playwright, and always cleans everything up afterward.

### Current test scope

Four spec files in `e2e/`:

- **smoke.spec.ts** — Verifies the app loads through the Remote UI host and renders the expected title.
- **sitl-connect.spec.ts** — Full connect/telemetry/disconnect cycle: selects TCP transport, connects to the instance's `127.0.0.1:<sitl-port>`, waits for live telemetry (state, mode, altitude, battery, heading, GPS), then disconnects and confirms idle state.
- **wrong-port-cancel.spec.ts** — Negative path: connects to an instance-scoped unused UDP port, verifies "Connecting" state and UI lockout, cancels, and confirms clean return to idle with controls re-enabled.
- **invalid-udp-bind.spec.ts** — Negative path: enters an invalid UDP bind string and verifies the app surfaces the validation error cleanly.

Each Playwright invocation still runs serially (`workers: 1`), but `pnpm e2e` auto-picks the first free instance id so parallel suite invocations get isolated Remote UI and SITL ports plus unique container names. You can still pin an instance manually with `E2E_INSTANCE_ID`. Traces, screenshots, and video are captured on failure.

### Scope limits

Remote UI proxies Tauri IPC over WebSocket, giving the browser access to the full Rust backend. This works for testing because the Tauri process is running locally with all native transports (UDP, serial, BLE) available on the Rust side. The browser itself doesn't open sockets or talk MAVLink directly.

A future pure-web or wasm deployment would need a fundamentally different transport architecture (proxy server, wasm MAVLink parser, reduced transport surface). Remote UI is not that path. See `PLAN.md` for the roadmap note on browser-native architecture.

## CI

- `.github/workflows/ci.yml`: frontend typecheck/build + Rust check/tests on every push and PR

## Planning

Project roadmap and current milestone tracking live in `PLAN.md`.

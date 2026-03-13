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
pnpm run frontend:typecheck
pnpm run frontend:build
cargo check --workspace
cargo test --workspace
pnpm run tauri:dev
```

## Use IronWing with ArduPilot SITL (development)

This is the dev loop used by CI and local SITL testing.

### Quick path with Makefile

```bash
make bridge-up
make status
make dev-sitl
```

Stop everything:

```bash
make bridge-down
```

`make dev-sitl` starts SITL + MAVProxy bridge, waits for UDP telemetry, then launches `pnpm run tauri:dev`.
Wait logic uses checked-in Python helpers: `scripts/sitl_wait_tcp.py` and `scripts/sitl_wait_udp.py`.

You can also inspect logs with:

```bash
make sitl-logs
make mavproxy-logs
```

### 1) Start SITL container

```bash
docker pull radarku/ardupilot-sitl
docker run -d --rm --name ardupilot-sitl -p 5760:5760 radarku/ardupilot-sitl
```

### 2) Bridge SITL TCP -> UDP using MAVProxy (with `uvx`)

```bash
uvx --from mavproxy --with future --python 3.11 mavproxy.py \
  --master=tcp:127.0.0.1:5760 \
  --out=udp:127.0.0.1:14550 \
  --daemon --non-interactive \
  --default-modules=link,signing,log,wp,rally,fence,param,relay,tuneopt,arm,mode,calibration,rc,auxopt,misc,cmdlong,battery,terrain,output,layout
```

This uses SITL TCP `5760` (same baseline transport used by legacy Mission Planner SITL tooling) and forwards MAVLink to UDP `14550` for this app.

### 3) Launch the desktop app

```bash
pnpm run tauri:dev
```

In the app:

- Select UDP connection
- Bind address: `0.0.0.0:14550`
- Connect

You should then see telemetry and mission workflows available (Read/Write/Verify/Clear, Set Current, Cancel Transfer).

### 4) Cleanup

```bash
docker rm -f ardupilot-sitl
```

## Flight Operations (GUI)

After connecting to a vehicle, the sidebar shows vehicle status and flight controls.

### Connect

1. Select a transport: **UDP**, **Serial**, **BLE**, or **Classic SPP** (Android)
2. For UDP: enter bind address (default `0.0.0.0:14550`)
3. For BLE: scan and select your device
4. For Serial: select port and baud rate
5. Click **Connect**
6. Wait for status to show "connected" and telemetry to appear

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

Browser-based E2E tests run against the real Tauri app connected to an ArduPilot SITL instance. Tauri's Remote UI crate (`tauri-remote-ui`) exposes the frontend at `http://127.0.0.1:9515` so Playwright can drive it from a standard Chromium browser. This is a **dev/test-only** mechanism, not a production web deployment.

### How it works

1. Frontend is built with `IRONWING_E2E=1`, which swaps Tauri IPC imports for a WebSocket-based implementation that talks to the Remote UI RPC proxy.
2. The Rust binary is compiled with `--features custom-protocol,e2e-remote-ui`, enabling the Remote UI HTTP/WS server on port 9515.
3. SITL bridge starts (Docker container + MAVProxy, same as `make bridge-up`).
4. The app launches with Remote UI enabled (the native window shows a placeholder page while the browser host serves the real UI). A liveness check polls `http://127.0.0.1:9515/keep_alive` until the server is ready.
5. Playwright opens Chromium, navigates to `http://127.0.0.1:9515/`, and runs specs against the live UI.

### Quick start

```bash
# One-shot: build + start everything + run tests + tear down
pnpm e2e

# Or step by step for faster iteration:
make e2e-up              # Build, start SITL + app, block when ready
pnpm e2e                 # Run tests (reuses running app)
make e2e-down            # Stop app + SITL
```

Other useful commands:

```bash
make e2e-build           # Build frontend + Rust binary only (no SITL)
pnpm e2e:headed          # Run tests with a visible browser window
```

The startup orchestrator is `scripts/e2e-start.sh`. It accepts `--no-build` (skip compilation, reuse existing binary) and `--no-bridge` (skip SITL, app only). Playwright's `webServer` config calls this script automatically when no server is already running.

### Current test scope

Three spec files in `e2e/`:

- **smoke.spec.ts** — Verifies the app loads through the Remote UI host and renders the expected title.
- **sitl-connect.spec.ts** — Full connect/telemetry/disconnect cycle: selects UDP transport, connects to `0.0.0.0:14550`, waits for live telemetry (state, mode, altitude, battery, heading, GPS), then disconnects and confirms idle state.
- **wrong-port-cancel.spec.ts** — Negative path: connects to a wrong port (`14551`), verifies "Connecting" state and UI lockout, cancels, and confirms clean return to idle with controls re-enabled.

Tests run serially (`workers: 1`) since they share a single SITL instance. Traces, screenshots, and video are captured on failure.

### Scope limits

Remote UI proxies Tauri IPC over WebSocket, giving the browser access to the full Rust backend. This works for testing because the Tauri process is running locally with all native transports (UDP, serial, BLE) available on the Rust side. The browser itself doesn't open sockets or talk MAVLink directly.

A future pure-web or wasm deployment would need a fundamentally different transport architecture (proxy server, wasm MAVLink parser, reduced transport surface). Remote UI is not that path. See `PLAN.md` for the roadmap note on browser-native architecture.

## CI

- `.github/workflows/ci.yml`: frontend typecheck/build + Rust check/tests on every push and PR

## Planning

Project roadmap and current milestone tracking live in `PLAN.md`.

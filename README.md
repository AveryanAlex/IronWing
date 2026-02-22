# MissionPlannerNg

Modern Mission Planner rewrite using Tauri + React + Rust.

Current state: M0-M3 complete. Mission planning MVP, Bluetooth connectivity (BLE + Classic SPP), Android mobile support, flight instruments HUD, parameter staging engine with batch write, setup wizards (accel/gyro/radio calibration), and STATUSTEXT plumbing all shipped.

## Stack

- Desktop + Mobile: Tauri v2 (desktop + Android)
- Frontend: React + TypeScript + Vite + Radix UI + Tailwind CSS
- Core: Rust (MAVKit, crate: `mavkit` — async MAVLink SDK)
- Map: MapLibre GL JS (3D terrain + satellite)
- Transports: UDP, Serial, BLE (Nordic UART), Classic SPP (Android)

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- npm
- Optional but recommended: Nix (`nix develop`) for a preconfigured shell

## Local development

Install dependencies:

```bash
npm install
```

Common commands:

```bash
npm run frontend:typecheck
npm run frontend:build
cargo check --workspace
cargo test --workspace
npm run tauri:dev
```

## Use Mission Planner with ArduPilot SITL (development)

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

`make dev-sitl` starts SITL + MAVProxy bridge, waits for UDP telemetry, then launches `npm run tauri:dev`.
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
npm run tauri:dev
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
npm run android:dev       # Dev build on device/emulator
npm run android:build     # Build APK
```

Android supports UDP, BLE, and Classic SPP transports. Serial is excluded (doesn't compile for Android targets).

## CI

- `.github/workflows/ci.yml`: frontend typecheck/build + Rust check/tests on every push and PR

## Planning

Project roadmap and current milestone tracking live in `PLAN.md`.

# Agent Instructions

## Overview

Modern ground control station for MAVLink vehicles (drones, rovers, planes). Built with Tauri v2 (Rust + React/TypeScript). Supports desktop (Linux, macOS, Windows) and Android. Connects via UDP, serial, BLE, and Bluetooth Classic SPP. Features live telemetry HUD, mission planning with 3D map, parameter management with staging workflow, and calibration wizards.

## Build & Test Commands

```bash
# Check everything compiles
cargo check --workspace          # Rust (IronWing workspace)
npm run frontend:typecheck       # TypeScript

# Run tests in this repo
cargo test --workspace           # All Rust tests (excludes SITL)

# Run a single Rust test in this repo
cargo test --workspace <test_name>

# SITL bridge helpers in this repo
make bridge-up                   # Start ArduPilot SITL + MAVProxy
make bridge-down                 # Stop everything

# Dev
npm run tauri:dev                # Launch desktop app with hot reload
make dev-sitl                    # Start bridge + launch app

# Android (requires Android SDK + NDK)
npm run android:dev              # Launch on Android emulator/device
npm run android:build            # Build APK
```

All commands run from the repo root.

## mavkit Boundary

- This repository consumes `mavkit` from crates.io.
- `mavkit` is our crate, and IronWing is currently the primary downstream user.
- It is OK to refactor and change mavkit when needed.
- Still prefer deliberate, well-scoped SDK changes and keep Rust/TypeScript wire contracts aligned.
- Agents can ask for mavkit library changes directly when product work requires SDK updates.
- After mavkit changes are merged and released, bump the `mavkit` crate version in this repo.

## Architecture

Tauri v2 desktop app with three layers: React frontend, Tauri IPC shell, Rust domain crate.

```
React (TypeScript)  ──invoke/listen──>  Tauri Shell (main.rs)  ──calls──>  mavkit
```

### Rust Crates

**`mavkit`** (crates.io dependency, external repo) - Async MAVLink SDK:
- `Vehicle` struct - async MAVLink vehicle handle (Clone via Arc, Send + Sync)
- `Vehicle::from_connection()` - transport-agnostic entry point accepting any `Box<dyn AsyncMavConnection>`
- `StreamConnection<R, W>` - adapter implementing `AsyncMavConnection` over any `AsyncRead + AsyncWrite` pair (feature-gated behind `stream`)
- `ble_transport::channel_pair()` - creates `ChannelReader`/`ChannelWriter` for bridging callback-based transports (BLE, SPP) into async streams (feature-gated behind `stream`)
- Watch channels for reactive state: `Telemetry`, `VehicleState`, `LinkState`, `MissionState`, `HomePosition`, `TransferProgress`, `StatusMessage`
- Mission operations via `MissionHandle`: upload, download, clear, verify roundtrip, set current
- Flight commands: arm, disarm, set mode, takeoff, guided goto, preflight calibration
- Parameter operations via `ParamsHandle`: download_all, write, write_batch (with `ParamWriteResult`)
- Wire boundary: `items_for_wire_upload()` / `plan_from_wire_download()`
- `validate_plan()`, `normalize_for_compare()`, `plans_equivalent()`
- ArduPilot mode tables (feature-gated behind `ardupilot`)

**`tauri-plugin-bluetooth-classic`** (`crates/tauri-plugin-bluetooth-classic/`) - Android Classic SPP:
- Kotlin plugin: RFCOMM connect via SPP UUID, read loop (Base64 events), write, disconnect
- Rust side: `get_bonded_devices`, `connect`, `disconnect`, `send` commands
- Desktop stub returns errors (Classic SPP is Android-only; desktop uses serial `/dev/rfcomm0`)

### Wire Boundary Convention

MAVLink wire format puts home at seq 0 for Mission type. The rest of the codebase uses semantic plans where `home` is a separate `Option<HomePosition>` field and items are 0-indexed waypoints. Conversion happens at the wire boundary:
- Upload: `items_for_wire_upload()` prepends home as seq 0, resequences items from seq 1
- Download: `plan_from_wire_download()` extracts seq 0 as home, resequences rest from 0
- Fence/Rally types: no home, items pass through unchanged

### Tauri Shell

`src-tauri/src/lib.rs` - Thin async adapter layer:
- `AppState` holds `tokio::sync::Mutex<Option<Vehicle>>` (single-vehicle)
- `#[tauri::command]` async handlers call `Vehicle` methods directly
- Watch → Tauri event bridge tasks forward state changes to the frontend
- No session IDs — single active connection
- `connect_ble()` bridges `tauri-plugin-blec` (NUS UART) → `channel_pair` → `StreamConnection` → `Vehicle::from_connection()`
- `connect_spp()` (Android) bridges `tauri-plugin-bluetooth-classic` events → `channel_pair` → `StreamConnection` → `Vehicle::from_connection()`
- `available_transports` command returns platform-appropriate list (serial hidden on Android, SPP only on Android)

### Frontend

- `App.tsx` - Main component with all state management (connection, mission items, home position, transfer)
- `MissionMap.tsx` - MapLibre GL 3D map with terrain, satellite imagery, click-to-add waypoints
- `mission.ts` / `telemetry.ts` / `params.ts` / `statustext.ts` / `calibration.ts` - IPC bridge functions (`invoke` + `listen` wrappers)
- `use-vehicle.ts` - Connection lifecycle, transport discovery, BT device scanning, multi-transport connect
- `use-params.ts` - Parameter store, staging engine (stage/unstage/applyStaged), filter modes, metadata loading
- `Sidebar.tsx` - Dynamic transport selector (populated from `availableTransports`), BLE scan picker, SPP bonded device picker
- `ConfigPanel.tsx` - [Parameters] / [Setup] sub-tabs; params tab has staging UI, diff panel, filter pills
- `setup/AccelCalibWizard.tsx` - 6-position accel calibration guided by STATUSTEXT
- `setup/RadioCalibWizard.tsx` - Live RC channel bars, records min/max, stages RC params
- `setup/SetupPanel.tsx` - Houses accel, gyro, radio calibration cards

### IPC Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `link://state` | `LinkState` | Rust -> TS |
| `telemetry://tick` | `Telemetry` | Rust -> TS |
| `vehicle://state` | `VehicleState` | Rust -> TS |
| `home://position` | `HomePosition` | Rust -> TS |
| `mission.progress` | `TransferProgress` | Rust -> TS |
| `mission.state` | `MissionState` | Rust -> TS |
| `param://store` | `ParamStore` | Rust -> TS |
| `param://progress` | `ParamProgress` | Rust -> TS |
| `statustext://message` | `StatusMessage` | Rust -> TS |

## Key Patterns

- **Serde rename**: All Rust enums use `#[serde(rename_all = "snake_case")]` for TypeScript compatibility. TypeScript types must use matching snake_case string literals.
- **Coordinates**: `MissionItem.x`/`y` are lat/lon as `i32` in degE7 (multiply by 1e7). `HomePosition` uses `f64` degrees.
- **Async commands**: All Tauri commands that need the vehicle are `async fn` using `tokio::sync::Mutex`. Pure commands (validate, list ports) are sync.
- **Watch channels**: Vehicle state is exposed via `tokio::sync::watch` channels. Bridge tasks forward changes to Tauri events. Tasks auto-terminate when Vehicle drops.
- **Feature gates**: mavkit's `stream` feature enables `StreamConnection` + `ble_transport` modules (pulls in `async-trait` + `futures`). The `stream` feature is always enabled in `src-tauri`.
- **Dual command registration**: `src-tauri/src/lib.rs` has separate `#[cfg(not(target_os = "android"))]` and `#[cfg(target_os = "android")]` `invoke_handler` blocks because the command sets differ (serial vs SPP).
- **Parameter staging**: Edits always stage locally (never write directly). User reviews staged changes in a diff panel, then clicks "Apply" to batch-write. `ParamTransferPhase` has `Writing` variant for batch progress. File loading auto-stages values that differ from vehicle.
- **Filter modes**: Standard (default) shows params where `userLevel` is "Standard" or unset. Modified shows only staged params. All shows everything.

## Bluetooth

The app supports Bluetooth connectivity for MAVLink telemetry radios:

| Transport | Desktop | Android | Implementation |
|-----------|---------|---------|----------------|
| UDP | Yes | Yes | mavlink crate built-in |
| Serial | Yes | No | mavlink crate + `serialport` |
| BLE (NUS UART) | Yes | Yes | `tauri-plugin-blec` (btleplug / native Android) |
| Classic SPP | Via serial (`/dev/rfcomm0`) | Yes | `tauri-plugin-bluetooth-classic` (Kotlin RFCOMM) |

### Transport-agnostic connection flow

```
[BT Device] <--SPP/BLE--> [blec / classic plugin]
                                    ↓
                         [byte channels (mpsc)]
                                    ↓
                         [StreamConnection adapter]
                                    ↓
                         [Vehicle::from_connection()]
                                    ↓
                         [existing event loop - unchanged]
```

- `Vehicle::from_connection()` accepts any `Box<dyn AsyncMavConnection>` — the event loop is transport-agnostic
- `StreamConnection` wraps `AsyncRead + AsyncWrite` into `AsyncMavConnection` (uses mavlink crate's `read_versioned_msg_async` / `write_versioned_msg_async`)
- `ble_transport::channel_pair()` bridges callback-based APIs (BLE notifications, SPP events) into async streams
- BLE uses Nordic UART Service UUIDs (`6E400001/02/03`)

### Platform gating

- `LinkEndpoint::Serial` and `list_serial_ports_cmd` gated behind `#[cfg(not(target_os = "android"))]`
- `LinkEndpoint::BluetoothSpp` and `bt_get_bonded_devices` gated behind `#[cfg(target_os = "android")]`
- `LinkEndpoint::BluetoothBle` available on all platforms
- Frontend calls `availableTransports()` on mount to populate the transport dropdown dynamically
- Two separate `invoke_handler` blocks in `run()` register platform-specific command sets

## Android

The app supports Android via Tauri v2 mobile. Serial port support is excluded on Android (the `serialport` crate doesn't compile for Android targets).

- `mavkit` is included without the `serial` feature on Android; desktop gets the full feature set via target-conditional deps
- Android has Bluetooth Classic SPP + BLE; desktop has BLE + serial (including rfcomm)
- Android manifest includes `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION` permissions
- The `gen/android/` directory is generated by `npx tauri android init` — the AndroidManifest.xml permissions block is manually maintained

## Project Status

M0-M3 complete. mavkit SDK with full transport stack (UDP, serial, BLE, Classic SPP), Android mobile support, flight instruments HUD, parameter staging engine with batch write, setup wizards (accel/gyro/radio calibration), and STATUSTEXT plumbing. Next up: M4 (logs and analysis). Roadmap details in `PLAN.md`.

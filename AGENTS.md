# Agent Instructions

## Overview

Modern ground control station for MAVLink vehicles (drones, rovers, planes). Built with Tauri v2 (Rust + React/TypeScript). Supports desktop (Linux, macOS, Windows) and Android. Connects via UDP, serial, BLE, and Bluetooth Classic SPP. Features live telemetry HUD, mission planning with 3D map, parameter management with staging workflow, calibration wizards, and TLOG/BIN log analysis with playback.

## Build & Test Commands

```bash
# Check everything compiles
cargo check --workspace          # Rust (IronWing workspace)
pnpm run frontend:typecheck       # TypeScript (tsc --noEmit)

# Lint (CI-enforced, warnings = errors)
cargo clippy --all-targets --all-features -- -D warnings

# Run tests
cargo test --workspace           # All 40 Rust unit tests
cargo test --workspace <test_name>  # Single test

# SITL dev loop
pnpm run dev                     # Start SITL + tauri:dev; Ctrl+C cleans up

# Dev
pnpm run tauri:dev                # Desktop app with hot reload
pnpm run android:dev              # Android emulator/device
pnpm run android:build            # Build APK
```

All commands run from the repo root. Nix flake (`flake.nix` + `.envrc`) provides the canonical reproducible dev environment.

## mavkit Boundary

- `mavkit` is consumed as a **git dependency** from `github.com/AveryanAlex/mavkit.git` (branch `main`), not crates.io.
- `ardupilot-binlog` is also a git dependency from the same org.
- `mavkit` is our crate; IronWing is the primary downstream user.
- It is OK to refactor and change mavkit when needed.
- Still prefer deliberate, well-scoped SDK changes and keep Rust/TypeScript wire contracts aligned.
- After mavkit changes are merged, the git ref in `src-tauri/Cargo.toml` updates automatically on next `cargo update`.

## Architecture

Tauri v2 app with three layers: React frontend, Tauri IPC shell, Rust domain crate.

```
React (TypeScript)  ──invoke/listen──>  Tauri Shell (lib.rs)  ──calls──>  mavkit
```

### Rust Crates

**`mavkit`** (git dependency, external repo) — Async MAVLink SDK:
- `Vehicle` struct — async MAVLink vehicle handle (Clone via Arc, Send + Sync)
- `Vehicle::from_connection()` — transport-agnostic entry point accepting any `Box<dyn AsyncMavConnection>`
- `StreamConnection<R, W>` — adapter implementing `AsyncMavConnection` over any `AsyncRead + AsyncWrite` pair (feature-gated behind `stream`)
- `ble_transport::channel_pair()` — creates `ChannelReader`/`ChannelWriter` for bridging callback-based transports (BLE, SPP) into async streams (feature-gated behind `stream`)
- Watch channels for reactive state: `Telemetry`, `VehicleState`, `LinkState`, `MissionState`, `HomePosition`, `TransferProgress`, `StatusMessage`
- Mission operations via `MissionHandle`: upload, download, clear, verify roundtrip, set current
- Flight commands: arm, disarm, set mode, takeoff, guided goto, preflight calibration
- Parameter operations via `ParamsHandle`: download_all, write, write_batch (with `ParamWriteResult`)
- Wire boundary: `items_for_wire_upload()` / `plan_from_wire_download()`
- `validate_plan()`, `normalize_for_compare()`, `plans_equivalent()`
- ArduPilot mode tables (feature-gated behind `ardupilot`)
- TLOG read/write (feature-gated behind `tlog`)

**`tauri-plugin-bluetooth-classic`** (`crates/tauri-plugin-bluetooth-classic/`) — Android Classic SPP:
- Kotlin plugin: RFCOMM connect via SPP UUID, read loop emits Base64 Tauri events, write, disconnect
- Rust side: `get_bonded_devices`, `connect`, `disconnect`, `send` commands
- Desktop stub returns errors (Classic SPP is Android-only; desktop uses serial `/dev/rfcomm0`)

### Wire Boundary Convention

MAVLink wire format puts home at seq 0 for Mission type. The rest of the codebase uses semantic plans where `home` is a separate `Option<HomePosition>` field and items are 0-indexed waypoints. Conversion happens at the wire boundary:
- Upload: `items_for_wire_upload()` prepends home as seq 0, resequences items from seq 1
- Download: `plan_from_wire_download()` extracts seq 0 as home, resequences rest from 0
- Fence/Rally types: no home, items pass through unchanged

### Tauri Shell

See `src-tauri/src/AGENTS.md` for module-level detail, command patterns, and connection lifecycle.

`src-tauri/src/lib.rs` — Thin async adapter layer:
- `AppState` holds `vehicle: Mutex<Option<Vehicle>>`, `connect_abort: Mutex<Option<AbortHandle>>`, `log_store: Mutex<Option<LogStore>>`, `recorder: TlogRecorderHandle`
- Single `invoke_handler!` block registers ALL commands. Platform gating happens **inside** each command function via dual `#[cfg]` implementations, not at registration level.
- Watch → Tauri event bridge tasks (`bridges.rs`) forward state changes to the frontend. Tasks auto-terminate when Vehicle drops.
- `connect_abort` handle enables cancellation of in-flight `Vehicle::connect()` awaits.

### Frontend

See `src/AGENTS.md` for detailed frontend structure, hook patterns, and IPC bridge conventions.

- `App.tsx` — State hub: 8 hooks, no Context/Redux/Zustand, pure prop drilling. `effectiveVehicle` overlays live telemetry with log-replay data during playback.
- IPC bridge files (`mission.ts`, `telemetry.ts`, `params.ts`, etc.) — typed `invoke` + `listen` wrappers.
- Hooks: `useVehicle` (connection + telemetry), `useMission`, `useParams` (staging), `useLogs`, `usePlayback` (client-side RAF), `useRecording`, `useSettings`, `useBreakpoint`.

### IPC Events

| Event | Payload | Direction | Source |
|-------|---------|-----------|--------|
| `telemetry://tick` | `Telemetry` | Rust → TS | Watch bridge, throttled by `TELEMETRY_INTERVAL_MS` atomic |
| `link://state` | `LinkState` | Rust → TS | Watch bridge |
| `vehicle://state` | `VehicleState` | Rust → TS | Watch bridge |
| `home://position` | `HomePosition` | Rust → TS | Watch bridge, filters None |
| `mission://progress` | `TransferProgress` | Rust → TS | Watch bridge, filters None |
| `mission://state` | `MissionState` | Rust → TS | Watch bridge |
| `param://store` | `ParamStore` | Rust → TS | Watch bridge |
| `param://progress` | `ParamProgress` | Rust → TS | Watch bridge |
| `statustext://message` | `StatusMessage` | Rust → TS | Watch bridge, filters None |
| `log://progress` | `LogProgress` | Rust → TS | Inline from `log_open` (not a watch bridge) |

## Key Patterns

- **Serde rename**: All Rust enums crossing IPC use `#[serde(rename_all = "snake_case")]`. TypeScript types must use matching snake_case string literals. Struct fields serialize as-is (snake_case by default).
- **Tagged unions**: `LinkEndpoint` uses `#[serde(tag = "kind", rename_all = "snake_case")]` → `{ kind: "udp", bind_addr: "..." }`.
- **invoke() arg naming**: TypeScript uses camelCase args (`{ customMode }`), Tauri auto-converts to Rust snake_case (`custom_mode: u32`).
- **Unit suffixes**: Field names always include units: `_m`, `_deg`, `_mps`, `_v`, `_a`, `_pct`, `_usec`, `_secs`, `_hz`.
- **Coordinates**: `MissionItem.x`/`y` are lat/lon as `i32` in degE7 (multiply by 1e7). `HomePosition`/`Telemetry` use `f64` degrees with `latitude_deg`/`longitude_deg` naming.
- **Async commands**: All Tauri commands needing the vehicle are `async fn` using `with_vehicle()` → `MappedMutexGuard`. Pure commands (validate, parse file) are sync.
- **Watch bridges**: 8 bridge tasks spawned in `bridges.rs::spawn_event_bridges()` on connect. Self-terminate when Vehicle drops (watch sender closes). No explicit cancellation.
- **Telemetry throttling**: Rust-side `TELEMETRY_INTERVAL_MS` atomic (default 200ms = 5Hz), adjustable via `set_telemetry_rate`. Frontend-side RAF coalescing in `use-vehicle.ts`.
- **Parameter staging**: Edits stage locally in React state (`Map<string, number>`), never write directly. User reviews staged changes in diff panel, then "Apply" calls `writeBatchParams`. File loading auto-stages values differing from vehicle.
- **Filter modes**: Standard (default) shows params where `userLevel` is "Standard" or unset. Modified shows only staged. All shows everything.
- **Platform gating**: Done inside command functions with dual `#[cfg]` implementations. `LinkEndpoint` enum variants are conditionally compiled. See `src-tauri/src/AGENTS.md` for details.
- **Playback**: Log replay is entirely frontend. Data fetched once via `log_get_telemetry_track`, then `usePlayback` RAF-interpolates client-side. `effectiveVehicle` in App.tsx merges replay data over live state.
- **Recording**: `TlogRecorderHandle` uses `std::sync::Mutex` (not tokio) — accessed from both sync and async contexts. Subscribes to `vehicle.raw_messages()` broadcast channel.

## Bluetooth

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

- BLE uses Nordic UART Service UUIDs (`6E400001/02/03`), MTU hardcoded to 20 bytes (BLE 4.0 conservative default, not negotiated)
- BLE connect has retry-with-rescan fallback: tries `connect()`, if fails runs `discover()` for 3s then retries
- SPP data flow: Kotlin `trigger("data", event)` → Tauri event → Rust `app.listen()` → Base64 decode → channel sender → StreamConnection

### Platform gating

- `LinkEndpoint::Serial` and `list_serial_ports_cmd` gated behind `#[cfg(not(target_os = "android"))]`
- `LinkEndpoint::BluetoothSpp` and `bt_get_bonded_devices` gated behind `#[cfg(target_os = "android")]`
- `LinkEndpoint::BluetoothBle` available on all platforms
- Frontend calls `availableTransports()` on mount to populate the transport dropdown dynamically
- Android-only plugins (`bluetooth-classic`, `geolocation`) registered in `#[cfg(target_os = "android")]` setup block

## Android

- `mavkit` on Android excludes `serial` feature; desktop gets full feature set via target-conditional deps in `Cargo.toml`
- Android has Bluetooth Classic SPP + BLE; desktop has BLE + serial (including rfcomm)
- `crate-type = ["staticlib", "cdylib", "rlib"]` — triple type required (JNI, iOS, desktop)
- All 4 Android ABIs get `-Wl,-z,max-page-size=16384` linker flag (Android 15+ 16KB page support)
- Vite dev server binds `0.0.0.0` when `TAURI_ENV_PLATFORM === "android"`
- `use-device-location.ts` tries dynamic `import("@tauri-apps/plugin-geolocation")` with catch fallback to browser `navigator.geolocation`
- Mobile breakpoint is `!lg` (< 1024px), not the typical < 768px

## Tooling

- **pnpm 10.28.0** (pinned via `packageManager` field) — must use pnpm, not npm/yarn
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — no `tailwind.config.js`, uses CSS `@theme` directives
- **No TypeScript linter** — no ESLint/Biome configured. CI only runs `tsc --noEmit` + `vite build`
- **No formatter enforced** — no Prettier, no `rustfmt.toml`. Be consistent with surrounding code
- **Clippy** with `-D warnings` enforced in CI
- **CI**: `ci.yml` (push/PR) — frontend typecheck+build, Rust check+clippy+test. `release.yml` (v* tags) — 4-platform matrix build via `tauri-apps/tauri-action`
- **Nix flake** is the canonical dev environment (Rust, Node, pnpm, Android SDK/NDK, JDK, system libs)

## Tests

- **40 Rust unit tests** in `src-tauri/src/logs.rs` (34) and `helpers.rs` (6). Inline `#[cfg(test)]` modules, no separate `tests/` dir
- **Lightweight TypeScript/Node tests** — vitest covers selected helper logic; no broad component test suite
- **No integration tests** for Tauri command layer
- **SITL dev loop is pnpm-managed** — `pnpm run dev` for local SITL + Tauri iteration; not automated in CI
- BIN format test data is synthetic (built byte-by-byte in test helpers), no fixture files on disk

## Project Status

M0–M3 complete. M4 in progress (TLOG recording/import, indexing, timeline playback, charts, map replay, CSV export shipped; persisted log library remaining). Roadmap in `PLAN.md`.

## PLAN.md Maintenance

- Treat `PLAN.md` as a living roadmap, not a historical changelog.
- When shipped work materially changes milestone status or scope, update `PLAN.md` in the same task when practical.
- Keep milestone status accurate and reflect partially shipped work explicitly.
- Collapse completed milestones into short summaries; keep current/future milestones detailed.

## Known Quirks

- **IPC event naming**: All events now use URI-style (`telemetry://tick`, `mission://state`, `param://store`). Follow this convention for new events.
- **`mpng_settings`** localStorage key is a legacy name artifact (from "Mission Planner Next Gen").
- **`mav.tlog`/`mav.tlog.raw`/`mav.parm`** at repo root are developer SITL artifacts, not committed test fixtures.
- **Parameter metadata** fetched at runtime from `autotest.ardupilot.org` via `@tauri-apps/plugin-http` (bypasses CORS), parsed with browser `DOMParser`, cached in localStorage 7 days.

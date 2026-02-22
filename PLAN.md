# Mission Planner Next - Greenfield Rewrite Plan

## 1) Goal and Scope

Build a modern, desktop-first Ground Control Station from scratch using Tauri.

- Primary targets: Desktop (Linux, macOS, Windows) and Android
- Initial scope (v1):
  - Vehicle connect/disconnect (Serial, UDP, BLE, Classic SPP)
  - Live flight data dashboard (HUD + map + status)
  - Mission planning (waypoints, geofence, rally basics)
  - Parameter read/write workflows
  - Log import + playback + charting
- Explicitly out of scope for now:
  - Legacy plugin compatibility
  - Full parity with all niche legacy modules

---

## 2) Product Principles

- Reliability before feature count
- Operator workflow continuity (connect -> monitor -> plan -> configure -> review logs)
- Offline-first behavior for field operations
- Strict module boundaries (no global mutable god objects)
- Contract-first frontend/backend APIs
- Testable protocol core with replayable telemetry/log sessions

---

## 3) Recommended Technology Stack

## Desktop Host
- Tauri v2
- Rust stable toolchain
- Signed installer and auto-update pipeline

## Frontend
- React + TypeScript + Vite
- Radix UI + Tailwind CSS (component primitives + styling)
- MapLibre GL JS (3D terrain + satellite)

## Maps and Visualization
- MapLibre GL JS with 3D terrain
- PMTiles/MBTiles offline map cache strategy (future)
- Custom HUD rendering (SVG artificial horizon, tape gauges, flight path vector)

## Backend/Core (Rust)
- tokio (async runtime)
- rust-mavlink 0.17 + serialport (live links and MAVLink parsing)
- UDP/serial/BLE/SPP link adapters via `StreamConnection`
- anyhow/thiserror (error handling)

## Quality/Delivery
- GitHub Actions CI
- cargo test + frontend unit tests + integration tests
- SITL-based E2E tests for high-risk workflows
- Release signing + reproducible build metadata

---

## 4) Target Architecture

## High-Level Layers
1. UI Layer (React): rendering + interaction only
2. Application Boundary: typed commands/events (IPC)
3. Core Services (Rust): domain workflows and orchestration
4. Adapters: serial/network/filesystem/map-cache/firmware endpoints
5. Persistence: SQLite + local files/cache

## Domain Modules (all in `mavkit` crate)
- Vehicle lifecycle: connection, heartbeat, link state, reconnection
- Telemetry: MAVLink message parsing, watch channels, configurable stream rates
- Mission: model, validators, wire boundary translation, transfer engine (upload/download/clear/verify)
- Parameters: read/write, bulk download, .parm file I/O
- Flight commands: arm/disarm, mode set, takeoff, guided goto
- Transport adapters: serial, UDP, BLE (via StreamConnection), Classic SPP (via StreamConnection)
- ArduPilot mode tables (feature-gated)

Future modules (not yet implemented):
- Log ingest: TLOG/BIN import, indexing, playback timeline, chart query
- Firmware: manifest fetch, download cache, flash orchestration
- Parameter staging: diff/apply engine, rollback, metadata cache

## Design Constraints
- No UI component directly accesses serial/network APIs
- No cross-module writes except through explicit service APIs
- Every long-running operation supports cancellation and progress events

---

## 5) Repository Layout

```text
MissionPlannerNg/
  src/                            # React frontend (TypeScript)
    components/
      hud/                        # Flight instruments (horizon, tapes, etc.)
      ui/                         # Radix + Tailwind base components
    hooks/                        # use-vehicle, use-mission, use-params
    lib/                          # mav-commands, utils
    App.tsx                       # Main layout + state orchestration
    MissionMap.tsx                # MapLibre 3D map
    Sidebar.tsx                   # Transport selector + BT device pickers
    mission.ts / telemetry.ts     # IPC bridge functions
  src-tauri/
    src/lib.rs                    # Tauri IPC command handlers
    Cargo.toml                    # Dependencies + feature gating
    gen/android/                  # Android build artifacts (Gradle)
    capabilities/                 # Tauri capability scopes
  crates/
    mavkit/                       # Async MAVLink SDK (domain core)
      src/
        vehicle.rs                # Vehicle abstraction + lifecycle
        event_loop.rs             # MAVLink event loop
        state.rs                  # Telemetry state structs
        mission/                  # Mission model + transfer engine
        params/                   # Parameter storage + file I/O
        stream_connection.rs      # AsyncRead/AsyncWrite -> MAVConnection adapter
        ble_transport.rs          # BLE/SPP callback -> async channel bridge
        modes.rs                  # ArduPilot flight mode tables
        command.rs                # Command types (arm, mode, takeoff, etc.)
      tests/
        sitl_roundtrip.rs         # SITL integration tests
    tauri-plugin-bluetooth-classic/  # Android Classic SPP plugin (Kotlin RFCOMM)
  .github/workflows/ci.yml       # CI: frontend typecheck + Rust tests + SITL
  Makefile                        # Dev/test orchestration
```

---

## 6) IPC Contract Strategy

Use typed commands (request/response) plus typed event streams.

## Command Categories
- Link commands: connect/disconnect/list ports/start stream
- Mission commands: load/save/edit/upload/download/validate
- Param commands: fetch metadata/read/set/apply staged changes
- Log commands: import/index/query/playback/export
- Firmware commands: list targets/download/flash/verify

## Event Categories
- `telemetry://tick`
- `link://state`
- `home://position`
- `mission.progress`
- `mission.state`
- `mission.error`
- `params.progress`
- `log.playback.tick`
- `firmware.progress`
- `system.alert`

## Example IPC Types

```rust
// crates/mp-ipc/src/link.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectRequest {
    pub endpoint: LinkEndpoint,
    pub vehicle_hint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum LinkEndpoint {
    Serial { port: String, baud: u32 },
    Udp { bind_addr: String },
    Tcp { host: String, port: u16 },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectResponse {
    pub session_id: String,
}
```

```ts
// apps/desktop/src/shared/ipc.ts
export type LinkStateEvent = {
  sessionId: string;
  state: "disconnected" | "connecting" | "connected" | "error";
  detail?: string;
};
```

Version every contract package and keep backward-compatible event evolution rules.

---

## 7) Milestones and Timeline

Assumption: small focused team (4-6 engineers). Timeline can compress/expand based on team size.

Current status:
- M0: complete
- M1: complete
- M2: complete
- M2.5: complete (Bluetooth transport stack, Android mobile, HUD instruments, param UI foundation)

## M0 - Foundation (Weeks 1-4) [COMPLETE]
- Finalize architecture and ADRs
- Set up monorepo, CI, lint/test gates
- Create IPC baseline (`mp-ipc`) + event bus skeleton
- Add SITL smoke test in CI (connect and heartbeat)

Exit criteria:
- Green CI for desktop build + unit tests
- End-to-end smoke path runs in automation

## M1 - Connectivity + Live Telemetry (Weeks 5-10) [COMPLETE]
- Implement serial/UDP adapters and session lifecycle
- Parse core MAVLink telemetry fields
- Build initial Flight Data screen shell (HUD + map + status cards)
- Add reconnect, timeout, and connection diagnostics

Exit criteria:
- Connect to SITL and at least one real autopilot profile
- Stable 30-minute telemetry session without crash

## M2 - Mission Planning MVP (Weeks 11-16) [COMPLETE]

Goal:
- Operator can create/edit/upload/download/verify basic missions on SITL from the new app.

M2 scope (must ship):
- Mission model/editor (waypoints, altitude/speed basics)
- Map interactions and mission table sync
- Upload/download mission with validation and progress events
- Basic geofence/rally upload/download

M2 workstreams:

1. `mp-mission-core` crate (new)
   - Status: complete
   - Canonical mission domain types: `MissionPlan`, `MissionItem`, `MissionType`, `MissionFrame`
   - First-class `HomePosition` type with `Option<HomePosition>` on `MissionPlan`
   - Wire boundary translation: `items_for_wire_upload()` prepends home as seq 0 for Mission type, `plan_from_wire_download()` extracts seq 0 as home
   - Validators: sequence continuity, coordinate bounds, NaN protection, home lat/lon range
   - Normalizers for upload/readback comparisons (float tolerance + frame normalization)
   - `MissionTransferMachine` accepts wire item count (including home) for correct progress tracking

2. MAVLink mission transfer engine
   - Status: complete
   - Upload flow: `MISSION_COUNT` -> (`MISSION_REQUEST_INT` or `MISSION_REQUEST`) -> `MISSION_ITEM_INT` -> `MISSION_ACK`
   - Download flow: `MISSION_REQUEST_LIST` -> `MISSION_COUNT` -> `MISSION_REQUEST_INT` loop -> `MISSION_ITEM_INT` loop -> `MISSION_ACK`
   - Wire boundary adaptation: upload uses `items_for_wire_upload()`, download uses `plan_from_wire_download()` so the rest of the stack never sees the wire seq-0 home item
   - `HOME_POSITION` MAVLink message (ID 242) handled: emits `HomePositionEvent` on receipt, auto-requests via `MAV_CMD_REQUEST_MESSAGE` after first heartbeat
   - Mission namespaces via `mission_type` (`MISSION`, `FENCE`, `RALLY`)
   - Timeout/retry policy (default 1500 ms, item 250 ms, max retries 5)
   - Cancel/reset-to-idle behavior for failed transfers

3. Tauri boundary integration
   - Status: complete
   - Commands: `mission_download`, `mission_upload`, `mission_clear`, `mission_verify_roundtrip`, `mission_set_current`
   - Events: `mission.progress`, `mission.state`, `mission.error`, `home://position`

4. Frontend mission planning surface
   - Status: complete
   - Home position is a standalone `homePosition` state, not embedded in items array; sourced from vehicle `HOME_POSITION` telemetry, mission download, or manual entry
   - MapLibre 3D terrain panel with click-to-add waypoints, separate home marker ("H" pin), mission line GeoJSON
   - Mission table with inline edit (command, lat/lon, altitude, hold/speed); items are 0-indexed internally, displayed 1-indexed
   - Row operations: add/delete/reorder with map-table two-way selection sync
   - Transfer actions: Read, Write, Verify, Clear with progress/error status inline

5. SITL + regression automation
   - Status: complete
   - Roundtrip suite for `MISSION`, `FENCE`, `RALLY` all passing; sample mission plan includes home position, roundtrip comparison strips home (autopilot may overwrite) and verifies items via `plans_equivalent`
   - Staged/non-strict mode by default (`--test-threads=1`); strict mode via `MP_SITL_STRICT=1`
   - Nightly/manual CI workflow with retry logic for flaky SITL startup

ArduPilot compatibility rules for M2:
- Handle `MISSION_REQUEST` fallback by still answering with `MISSION_ITEM_INT`
- Do not assume strict atomic upload behavior on ArduPilot; always run readback verification
- Keep mission type flows independent (mission/fence/rally stored separately)

Exit criteria:
- Create/edit/upload/download/verify works on ArduPilot SITL for `MISSION`
- Geofence and rally minimal roundtrip works (`MISSION_TYPE_FENCE`, `MISSION_TYPE_RALLY`)
- Retry/timeout behavior proven in automated tests
- Mission UI can complete a full plan-edit-sync loop without legacy app

Out of scope (defer to later milestone):
- Advanced survey/polygon/grid tools
- Partial mission upload/download optimization
- Terrain-following and camera-trigger authoring UX

## M2.5 - Bluetooth, Android, and Flight Instruments [COMPLETE]

Shipped between M2 and M3 as cross-cutting platform work:

1. Bluetooth transport stack
   - BLE (Nordic UART Service) via `tauri-plugin-blec` — desktop + Android
   - Classic SPP via `tauri-plugin-bluetooth-classic` — Android only (Kotlin RFCOMM)
   - Desktop Classic SPP via serial `/dev/rfcomm0`
   - Transport-agnostic bridge: callback-based BT APIs → `channel_pair()` → `StreamConnection` → `Vehicle::from_connection()`

2. Android mobile support
   - Tauri v2 mobile integration with responsive layout
   - Bottom navigation (5 tabs) + drawer sidebar
   - Edge-to-edge safe area handling
   - BT permission request flow for Android 12+
   - Platform-gated command sets (serial on desktop, SPP on Android)

3. Flight instruments (HUD panel)
   - Artificial horizon with terrain fill
   - Tape gauges for airspeed and altitude
   - Flight path vector and bearing bug
   - Attitude, nav, and battery status display

4. Flight operations
   - Arm/disarm with state validation
   - Flight mode selection (auto-populated from vehicle type)
   - Takeoff with altitude entry (auto-arms + sets GUIDED)
   - Guided goto via right-click on map
   - RTL/Land quick buttons
   - Telemetry rate throttling (configurable Hz)

5. Parameter UI foundation
   - Live parameter read/write
   - Parameter table with search/filter
   - .parm file import/export

6. Platform and repo
   - Flattened repo structure (removed `apps/desktop` nesting)
   - Single stateful Connect/Disconnect button
   - `available_transports` dynamic transport discovery
   - BLE scan picker and SPP bonded device picker

Exit criteria:
- BLE and Classic SPP connections working on desktop and Android
- HUD instruments rendering live telemetry
- Parameter read/write working on SITL
- Android APK builds and runs

## M3 - Parameters and Setup Workflows
- Parameter staging engine: stage edits, diff view, apply/rollback
- ArduPilot parameter metadata cache (descriptions, ranges, units)
- Parameter grouping and advanced filtering
- First setup wizard subset (radio/compass/accelerometer as feasible)

Exit criteria:
- Typical parameter tuning flow complete without legacy app

## M4 - Logs and Analysis
- TLOG/BIN import and index
- Timeline playback tied to map and key telemetry widgets
- Core charts and export

Exit criteria:
- Pilot can review a flight log with timeline and metrics

## M5 - Firmware and Release Hardening
- Firmware metadata/download cache
- Flash workflow with safety checks and rollback messaging
- Reliability hardening, crash recovery, diagnostics bundle
- Signed installer + updater + staged release channel

Exit criteria:
- Release candidate for controlled user group

## M6 - Public Beta
- Feature-gap triage from pilot users
- Performance and UX polish
- Documentation and migration guidance from legacy

Exit criteria:
- Public beta with known limitation list and support process

---

## 8) Test and Validation Strategy

- Unit tests per domain crate (protocol parsing, validators, state reducers)
- Integration tests for link lifecycle and mission/param workflows
- SITL scenario suite:
  - connect/disconnect reliability
  - mode changes and telemetry continuity
  - mission upload/download consistency
  - parameter batch apply safety
- Replay tests from recorded telemetry/log fixtures
- Performance tests:
  - startup time
  - telemetry event throughput
  - map render responsiveness
  - memory baseline and leak detection

---

## 9) Security and Safety Baseline

- Signed binaries and update artifacts
- Least-privilege filesystem and process access
- Input validation for all IPC commands
- Crash-safe writes for mission/params artifacts
- Explicit confirmation UX for safety-critical commands
- Telemetry and command audit log for troubleshooting

---

## 10) Risk Register and Mitigations

- MAVLink edge-case handling complexity
  - Mitigation: replay corpus + SITL matrix early and continuously
- High-rate telemetry overwhelming UI thread
  - Mitigation: backpressure, sampling tiers, render decoupling
- Firmware flashing failure scenarios
  - Mitigation: prechecks, robust progress/error model, rollback guidance
- Scope creep from legacy parity expectations
  - Mitigation: milestone gates and explicit deferred backlog
- Cross-platform hardware differences
  - Mitigation: Windows-first hardened adapter layer, then porting

---

## 11) Immediate Next Steps (Current - M3 Start)

1. Parameter staging engine: `staged_params` map in AppState, stage/apply/rollback commands, diff view in frontend
2. ArduPilot parameter metadata: parse upstream JSON schema, cache locally, expose descriptions/ranges/units in param table
3. Parameter grouping: categorize params by subsystem, collapsible groups in table UI
4. Setup wizard MVP: radio failsafe + mode config flow, then compass calibration with live sensor values
5. Frontend test baseline: add Vitest for hooks and IPC bridge modules
6. Mobile polish: verify BT permission flow on Android 12+, test full connection lifecycle on hardware

This plan stays biased toward shipping a usable cockpit first, with disciplined protocol correctness before advanced planning UX.

# IronWing - Greenfield Rewrite Plan

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
- cargo test + frontend unit tests
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
- Guided setup: onboarding wizard, setup state, readiness checklist, pre-arm assistant
- Firmware: manifest fetch, download cache, flash orchestration

## Design Constraints
- No UI component directly accesses serial/network APIs
- No cross-module writes except through explicit service APIs
- Every long-running operation supports cancellation and progress events

---

## 5) Repository Layout

```text
IronWing/
  src/                            # React frontend (TypeScript)
    components/
      hud/                        # Flight instruments (horizon, tapes, etc.)
      setup/                      # Calibration wizards (accel, radio)
      ui/                         # Radix + Tailwind base components
    hooks/                        # use-vehicle, use-mission, use-params
    lib/                          # mav-commands, utils
    App.tsx                       # Main layout + state orchestration
    MissionMap.tsx                # MapLibre 3D map
    Sidebar.tsx                   # Transport selector + BT device pickers
    mission.ts / telemetry.ts     # IPC bridge functions
    params.ts / statustext.ts     # Parameter + status IPC
    calibration.ts                # Calibration command IPC
    param-metadata.ts             # ArduPilot param metadata parser + cache
  src-tauri/
    src/lib.rs                    # Tauri IPC command handlers
    Cargo.toml                    # Dependencies + feature gating
    gen/android/                  # Android build artifacts (Gradle)
    capabilities/                 # Tauri capability scopes
  crates/
    tauri-plugin-bluetooth-classic/  # Android Classic SPP plugin (Kotlin RFCOMM)
  .github/workflows/ci.yml       # CI: frontend typecheck + Rust tests
  Makefile                        # Dev/test orchestration
```

Note: `mavkit` is consumed from crates.io and maintained in a separate repository.

---

## 6) IPC Contract Strategy

Use typed commands (request/response) plus typed event streams.

## Command Categories
- Link commands: connect/disconnect/list ports/start stream
- Mission commands: load/save/edit/upload/download/validate
- Param commands: fetch metadata/read/set/apply staged changes
- Setup commands: inspect vehicle, run wizard step, validate readiness, surface blockers
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
- `setup.progress`
- `setup.issue`
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
- M3: complete (parameter staging engine, setup wizards, STATUSTEXT plumbing)
- M4: in progress (TLOG recording/import, indexing, timeline playback, basic charts, map replay path)

## Completed Milestones

### M0 - Foundation [COMPLETE]
- Architecture, repo scaffolding, CI, and SITL smoke coverage are in place.

### M1 - Connectivity + Live Telemetry [COMPLETE]
- Core connectivity, telemetry ingestion, flight data shell, and connection diagnostics shipped.

### M2 - Mission Planning MVP [COMPLETE]
- Mission/fence/rally planning, transfer, verification, and SITL regression coverage shipped.
- Deferred beyond M2: advanced survey tools, partial transfer optimization, terrain-following, and camera-trigger authoring UX.

### M2.5 - Bluetooth, Android, and Flight Instruments [COMPLETE]
- BLE + Classic SPP transport support, Android mobile shell, HUD instruments, flight operations, and parameter UI foundation shipped.

### M3 - Parameters and Setup Workflows [COMPLETE]
- Parameter staging/batch apply, metadata-aware filtering, STATUSTEXT plumbing, and accel/gyro/radio setup workflows shipped.

## M4 - Logs and Analysis [IN PROGRESS]

Current shipped slice:
- TLOG recording from live MAVLink sessions
- TLOG and BIN import, parse, and in-memory indexing
- Timeline playback controls with speed/seek
- Expanded charts: altitude, speed, attitude, battery, throttle, GPS quality, RC input, servo output, nav controller, vibration (BIN)
- Flight summary stats: max/avg altitude, max speed, total distance, max range from home, battery delta, mAh consumed, GPS satellite range
- CSV export with optional time-range selection (drag-to-select on any chart)
- Flight-path replay tied to the map
- HUD, sidebar, and telemetry panel render from playback data during log replay
- Relative mm:ss time axis on all charts

Remaining M4 scope:
- Persisted log library / recent recordings browser

Exit criteria:
- Pilot can review a flight log with timeline and metrics

## M5 - Guided Vehicle Setup Wizard

Goal:
- A new ArduPilot flight controller can be taken from first connection to first-flight-ready state inside IronWing with a guided, resumable workflow.

Issue-sized tasks:

1. Setup session model and persistence
   - Add a setup profile/session model that tracks board identity, vehicle type, completed steps, blockers, and resume state
   - Persist wizard progress locally so setup can resume after disconnects, restarts, or firmware updates

2. Vehicle inspection and prerequisites step
   - Detect connected board, firmware family/version, vehicle type, available sensors, RC presence, GPS state, and link quality
   - Build a prerequisite screen that explains what can proceed now versus what requires hardware changes or outdoor GPS conditions

3. Mandatory calibration step integration
   - Integrate existing accel, gyro, and radio calibration flows into a single guided setup sequence
   - Add the missing compass-calibration workflow and completion checks so all mandatory first-flight calibrations live in one place

4. Frame, outputs, and motor/ESC verification step
   - Add frame/orientation review, servo-output mapping checks, motor order/direction verification, and ESC calibration guidance/tests
   - Separate "safe bench verification" from "props-on flight readiness" and enforce clear safety prompts

5. Flight modes and failsafe configuration step
   - Add guided setup for core flight modes and recommended mode ordering per vehicle class
   - Add dedicated setup/review for radio, battery, GCS, and EKF/GPS-related failsafe settings with sane defaults and warnings

6. Pre-arm blocker assistant
   - Parse pre-arm failures and common STATUSTEXT/setup issues into actionable tasks with fix guidance instead of raw messages alone
   - Keep a readiness checklist that updates live as calibrations, GPS/home lock, battery, and sensor health become valid

7. First-flight readiness review and report
   - Add a final review step covering level horizon check, motor direction confirmation, GPS/home readiness, battery state, and recommended staged mode progression
   - Generate a saved setup summary/checklist the operator can revisit before first flight

8. Validation and field test coverage
   - Add SITL coverage for the wizard state machine and readiness logic where possible
   - Run hardware validation on at least one fresh-controller setup flow and document known gaps by vehicle type

Exit criteria:
- New flight controller can be brought from first connection to first-flight-ready state using the guided setup flow without relying on external GCS setup screens
- Wizard progress survives reconnects/restarts and clearly reports remaining blockers
- Pre-arm/setup blockers are surfaced as actionable setup tasks rather than only raw status text

## M6 - Firmware Install and Update Workflow

Goal:
- IronWing can install or update ArduPilot firmware with a board-aware, safety-focused workflow and clear recovery guidance.

Issue-sized tasks:

1. Firmware catalog client and cache
   - Implement a client for official ArduPilot firmware metadata/download sources plus a local artifact cache
   - Track channel metadata (stable, beta, latest, custom) and expose board/vehicle compatibility information

2. Board identification and flash prerequisites
   - Detect board identity, current firmware, bootloader/transport capabilities, and whether the device is in a flashable state
   - Add prerequisite checks for power, USB/direct connection expectations, disconnected-state requirements, and storage location for backups/downloads

3. Firmware picker UI and compatibility warnings
   - Build a firmware selection flow for vehicle type, board target, release channel, and custom local firmware files
   - Warn when switching vehicle families, using beta/dev builds, or selecting targets that may invalidate settings or peripherals

4. Parameter backup and migration safeguards
   - Add pre-flash parameter backup/export prompts and restore guidance after update
   - Detect cases where automatic restore should be discouraged because parameter meaning or vehicle type changed

5. Flash executor and progress reporting
   - Implement the baseline USB flash flow with erase/program/verify progress, reboot handling, and reconnect prompts
   - Capture structured logs for each flash attempt so failures can be diagnosed without guesswork

6. Post-flash verification and next steps
   - Reconnect after flash, confirm firmware version/target, and identify setup items invalidated by the update
   - Hand off naturally into setup/review work when calibration, frame, or failsafe checks must be revisited

7. Recovery and advanced firmware paths
   - Add support paths for custom firmware loading, bootloader prompts, SD-card update guidance, and failed-flash troubleshooting
   - Document and gate more advanced or risky flows separately from the default happy path

8. Validation and hardware matrix
   - Validate stable update flows on supported desktop platforms and at least one real board family
   - Record known limitations for unsupported boards, first-time bootloader installs, and platform-specific flashing gaps

Exit criteria:
- Stable firmware install/update works with clear recovery guidance and post-flash verification
- Firmware selection is board-aware and warns about risky or incompatible choices before flashing
- Failed or interrupted flash attempts leave the user with actionable recovery steps and diagnostic logs

## M7 - Release Hardening
- Reliability hardening, crash recovery, diagnostics bundle
- Signed installer + updater + staged release channel

Exit criteria:
- Release candidate for controlled user group

## M8 - Public Beta
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

## 11) Immediate Next Steps (Current - M4 In Progress)

1. Add a persisted log library / recent recordings surface for imported and recorded sessions
2. Frontend test baseline: add Vitest for hooks, playback state, and IPC bridge modules
3. Mobile polish: verify BT permission flow on Android 12+, test full connection lifecycle on hardware
4. Safety and support groundwork: confirmation UX/audit trail for critical actions and a diagnostics bundle export path

This plan stays biased toward shipping a usable cockpit first, with disciplined protocol correctness before advanced planning UX.

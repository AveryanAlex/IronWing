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
- SITL-based E2E tests for high-risk workflows (Playwright + Tauri Remote UI, shipped)
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

**Tauri shell firmware module** (`src-tauri/src/firmware/`):
- Firmware: catalog client, artifact parsing, serial bootloader uploader (with extf), DFU recovery executor, port/device discovery

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
  scripts/                       # Node workflow orchestration (dev + e2e)
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
- M4: complete (TLOG/BIN recording, import, indexing, timeline playback, charts, map replay, CSV export)
- M5: complete (guided setup wizard, compass calibration, motor test, pre-arm assistant, sensor health)
- M6: complete (firmware install/update and DFU recovery with catalog browsing, extf serial support)

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

### M4 - Logs and Analysis [COMPLETE]
- TLOG/BIN recording, import, indexing, timeline playback, expanded charts, flight summary stats, CSV export, map replay, and playback-aware HUD shipped.

### M5 - Guided Vehicle Setup Wizard [COMPLETE]
- 7-step guided setup wizard (inspection, calibration, frame/motor, flight modes, failsafe, pre-arm, readiness), compass calibration workflow, motor test, pre-arm blocker parsing, sensor health watch, and localStorage persistence shipped.

### M6 - Firmware Install and Recovery [COMPLETE]
- Dedicated first-class Firmware group in Setup with explicit Install / Update and Recover via DFU modes
- Serial-first firmware flashing via native Rust bootloader uploader for `.apj` artifacts (ArduPilot/PX4-compatible boards)
- Official ArduPilot catalog client with board-filtered browsing plus local `.apj` file support for the serial path
- Serial-path external-flash (`extf_image`) support: APJ parsing, bootloader capacity probe, erase/program/verify protocol, phase-labeled progress
- Recovery-mode manual board target and version selection from the official ArduPilot catalog, with local `.apj` and local `.bin` fallback sources
- STM32 DFU recovery path via native Rust USB stack (nusb), with stronger guardrails blocking APJs that require external-flash writes
- Pre-flash parameter backup prompt reusing existing save-to-file capability
- Reconnect verification with explicit `verified` vs `flashed_but_unverified` terminal outcomes (BL_REV < 3 boards)
- DFU recovery guidance for Windows driver issues (WinUSB/Zadig) and unsupported platform states
- Desktop port inventory, bootloader re-enumeration detection, STM32 DFU device scanning
- Firmware session exclusivity guard (mutually exclusive with live vehicle connection)
- 100+ Rust fixture tests and 60+ Vitest tests covering both paths end-to-end without hardware
- Deferred: automatic parameter restore/migration, Android flashing, `.px4`/`.hex`/`.dfu` formats, DFU as normal install path, real hardware validation matrix

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

## Future: Browser-Native / Wasm Mode (not current scope)

The Playwright E2E setup uses Tauri's Remote UI to serve the frontend in a browser, but the Rust backend still runs locally and owns all transport connections (UDP, serial, BLE). This is a testing convenience, not a web deployment architecture.

A true browser-native mode would require a different approach entirely: a wasm-compiled MAVLink parser, a proxy/relay server bridging raw transports to WebSocket, and a reduced transport surface (no direct serial or BLE from the browser). The platform boundary (`src/platform/`) was designed with this split in mind, but the proxy layer, wasm packaging, and transport subset are all later work, well beyond the current milestone scope.

---

## 8) Test and Validation Strategy

- Unit tests per domain crate (protocol parsing, validators, state reducers)
- Integration tests for link lifecycle and mission/param workflows
- **Browser E2E via Playwright + Tauri Remote UI + SITL** (shipped):
  - Tauri's Remote UI plugin exposes the frontend on a local per-run port during E2E runs. Playwright drives Chromium against this host while the Rust backend connects directly to a local SITL instance over TCP. This is a dev/test-only mechanism; the browser talks to the Rust process via WebSocket RPC, not raw MAVLink.
  - Orchestrated by pnpm-only Node entrypoints (`scripts/dev.mjs`, `scripts/e2e.mjs`, `scripts/workflow/*.mjs`). `pnpm dev` and `pnpm e2e` auto-pick the first free instance id so concurrent runs get isolated ports and container names.
  - Initial suite covers app load smoke test, a full connect/telemetry/disconnect cycle, and a wrong-port cancel/recovery path against SITL.
  - Platform boundary (`src/platform/`) swaps Tauri IPC for WebSocket-based stubs at build time via `IRONWING_E2E=1`. A source guardrail test enforces that direct `@tauri-apps/api` imports stay confined to the platform layer.
  - Tests run serially (single SITL instance). Traces, screenshots, and video captured on failure.
- SITL scenario suite (planned expansion):
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

## 11) Immediate Next Steps (Current - M7 Next)

1. Firmware validation on real hardware: serial flash and DFU recovery across representative board families
2. Frontend test baseline: add Vitest for hooks, playback state, and IPC bridge modules
3. Expand E2E suite: mission upload/download, parameter workflows, mode changes (infrastructure shipped, coverage is initial)
4. Mobile polish: verify BT permission flow on Android 12+, test full connection lifecycle on hardware
5. Safety and support groundwork: confirmation UX/audit trail for critical actions and a diagnostics bundle export path
6. Release hardening: crash recovery, diagnostics bundle, signed installer and updater pipeline

This plan stays biased toward shipping a usable cockpit first, with disciplined protocol correctness before advanced planning UX.

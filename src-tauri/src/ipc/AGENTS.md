# IPC Wire Contracts

## Overview

`crates/ironwing-core/src/ipc/` is the shared typed contract layer between the Rust shell and the frontend. `src-tauri/src/ipc/mod.rs` is only the Tauri-side adapter that re-exports those contracts. Every struct and enum in core IPC is a wire type that crosses the IPC boundary via serde. Changes require matching TypeScript updates and contract-fixture test coverage.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Session envelope / source tracking | `crates/ironwing-core/src/ipc/envelope.rs` | `SessionEnvelope`, `ScopedEvent`, `OperationFailure`, `ReasonKind` |
| Domain wrapper pattern | `crates/ironwing-core/src/ipc/domain.rs` | `DomainValue<T>`, `DomainProvenance` |
| Session/connection state | `crates/ironwing-core/src/ipc/session.rs` | `SessionSnapshot`, `VehicleState`, `SessionConnection` |
| Telemetry payload | `crates/ironwing-core/src/ipc/telemetry.rs` | Flight, navigation, attitude, power, GPS, RC, rangefinder snapshots |
| Guided flight contract | `crates/ironwing-core/src/ipc/guided.rs` | `GuidedRuntime`, `GuidedSession`, `GuidedSnapshot`, command results |
| Calibration state | `crates/ironwing-core/src/ipc/calibration.rs` | Compass/accel calibration snapshots |
| Sensor health | `crates/ironwing-core/src/ipc/sensor_health.rs` | Subsystem health summary |
| Status text | `crates/ironwing-core/src/ipc/status_text.rs` | MAVLink status text entries and history |
| Support / config facts | `crates/ironwing-core/src/ipc/support.rs`, `crates/ironwing-core/src/ipc/configuration_facts.rs` | Vehicle support capabilities, param-derived facts |
| Playback state | `crates/ironwing-core/src/ipc/playback.rs` | Playback progress snapshot |
| Tauri adapter re-exports | `src-tauri/src/ipc/mod.rs` | Public API surface for the rest of the Tauri crate |

## Serde Conventions

- All enums use `#[serde(rename_all = "snake_case")]`.
- Tagged unions use `#[serde(tag = "kind")]` as the default discriminant. Exceptions: `GuidedCommandResult` uses `#[serde(tag = "result")]`, `OperationFailure` wraps a `Reason` struct.
- Numeric fields carry unit suffixes: `_m`, `_deg`, `_mps`, `_v`, `_a`, `_pct`, `_usec`, `_secs`, `_hz`, `_wh`.
- Optional fields are `Option<T>` and serialize as JSON `null` when absent.

## Key Patterns

- **`DomainValue<T>`**: Generic envelope wrapping any domain snapshot with `available`, `complete`, `provenance`, and `value`. Used for telemetry, session, support, and other streamed domains.
- **`SessionEnvelope`**: Tracks `session_id`, `source_kind` (live/playback), `seek_epoch`, and `reset_revision`. Attached to scoped events via `ScopedEvent<T>`.
- **`OperationFailure`**: Structured error with `operation_id`, `Reason { kind, message }`. Frontend maps `ReasonKind` to user-facing messages.
- **Snapshot builders**: Conversion functions like `telemetry_snapshot_from_value()`, `session_connection_from_link_state()` transform mavkit domain types into IPC snapshots. Keep these as the only translation boundary.

## Rules

- Wire types are defined in `ironwing-core`; keep Tauri exposure crate-local through these adapter re-exports.
- `src-tauri/src/ipc/mod.rs` re-exports the shared core API for the Tauri crate. Add new types in `ironwing-core` first, then re-export as needed.
- Do not add business logic to this module; it is a contract/translation layer only.
- Changes to tagged enums or field shapes require updating the corresponding TypeScript types and contract-fixture tests in `tests/contracts/`.

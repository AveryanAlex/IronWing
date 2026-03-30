# Rust Backend (Tauri Shell)

## Overview

Thin Tauri IPC shell between the React frontend and `mavkit`. This layer owns transport setup, command dispatch, event relays, logs/recording, firmware flows, and platform-gated plugin registration.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| App bootstrap / plugin registration | `lib.rs` | `AppState`, `invoke_handler!`, Android setup |
| General vehicle/mission/param commands | `commands.rs` | Most Tauri commands live here |
| Transport setup / connect lifecycle | `connection.rs` | `LinkEndpoint`, BLE/SPP connection paths |
| Event relays | `bridges.rs`, `e2e_emit.rs` | Watch channels + inline emit wrapper |
| Session envelope / source tracking | `session_runtime.rs` | Live/playback session state machine |
| Guided flight runtime | `guided.rs` | Vehicle context extraction, guided snapshot emission |
| IPC wire contracts | `ipc/AGENTS.md` | Typed event/command payloads, serde conventions |
| Logs / playback source | `logs.rs` | Dual TLOG/BIN parsing and queries |
| Recording | `recording.rs` | TLOG recorder lifecycle |
| Helpers | `helpers.rs` | `with_vehicle()`, `with_log_store()`, `downsample()` |
| Firmware subsystem | `firmware/AGENTS.md` | Serial flash, DFU recovery, catalog, session state |

## Modules

| File | Purpose |
|------|---------|
| `lib.rs` | Entry point, plugin setup, command registration |
| `commands.rs` | Vehicle, mission, param, calibration, guided commands |
| `connection.rs` | Transport setup, connect/disconnect lifecycle |
| `bridges.rs` | Watch-channel relays for frontend events |
| `e2e_emit.rs` | Unified emit wrapper for the native webview |
| `bluetooth.rs` | BLE scan and permissions helpers |
| `session_runtime.rs` | Session envelope state machine (live/playback tracking, pending sessions, seek epochs) |
| `guided.rs` | Guided flight helpers and snapshot emission |
| `logs.rs` | Log parsing, summary, track/path export, CSV export |
| `recording.rs` | TLOG recording lifecycle |
| `helpers.rs` | Shared guards and utilities |
| `ipc/` | Wire-type contract layer for all IPC-facing payloads |
| `firmware/` | Firmware flashing, DFU recovery, catalog, typed session model |
| `main.rs` | Binary stub calling `ironwing::run()` |

## AppState

```rust
pub(crate) struct AppState {
    pub(crate) vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    pub(crate) active_link_target: tokio::sync::Mutex<Option<ActiveLinkTarget>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) background_tasks: tokio::sync::Mutex<Vec<tokio::task::JoinHandle<()>>>,
    pub(crate) background_listeners: tokio::sync::Mutex<Vec<tauri::EventId>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) recorder: TlogRecorderHandle,
    pub(crate) firmware_session: FirmwareSessionHandle,
    pub(crate) firmware_abort: tokio::sync::Mutex<Option<FirmwareAbortHandle>>,
    pub(crate) firmware_cancel_requested: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub(crate) param_download_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) mission_op_cancel: tokio::sync::Mutex<Option<MissionCancelToken>>,
    pub(crate) session_runtime: tokio::sync::Mutex<SessionRuntime>,
    pub(crate) guided_runtime: tokio::sync::Mutex<GuidedRuntime>,
    pub(crate) session_context: tokio::sync::Mutex<bridges::SessionContext>,
    pub(crate) status_text_history: tokio::sync::Mutex<Vec<StatusTextEntry>>,
    pub(crate) next_status_text_sequence: AtomicU64,
}
```

## Command Pattern

- All commands are registered unconditionally in one `invoke_handler!` block.
- Async vehicle commands use `with_vehicle(&state).await?`.
- Log-only commands use `with_log_store()` when they need an open log.
- IPC boundary types return `Result<T, String>`; stringify errors before crossing the boundary.

## Platform Gating

- Platform gating happens in Rust command implementations and transport types, not by conditionally registering commands.
- For simple commands, the common pattern is separate `#[cfg(...)]` command definitions with the same name.
- For helper-returned lists (for example available transports), inline `#[cfg]` branches build the platform-specific result.
- `LinkEndpoint` variants are conditionally compiled; frontend transport choices come from `available_transports()`.

## Event Relays

- `bridges.rs` owns telemetry, vehicle, mission, param, statustext, sensor-health, and compass-calibration relays.
- Use `emit_event(&handle, event_name, payload)` from `e2e_emit.rs`, not `handle.emit()` directly.
- `log://progress` and `firmware://progress` are emitted inline from domain commands, not from watch bridges.

## Connection Lifecycle

```text
connect_link()
  → abort in-flight connect
  → disconnect previous vehicle
  → build transport-specific Vehicle
  → spawn_event_bridges()
  → store Vehicle in AppState

disconnect_link()
  → stop recorder
  → abort in-flight connect
  → disconnect vehicle
```

## Recording / Logs

- `TlogRecorderHandle` uses `std::sync::Mutex` because it is touched from sync and async contexts.
- `logs.rs` parses both TLOG and BIN into a shared in-memory model used by queries, summaries, tracks, and exports.
- Keep `log://progress` semantics aligned with the frontend log UI.

## Tests

- Rust tests are inline `#[cfg(test)]` modules.
- Most Rust test coverage is concentrated in `firmware/mod.rs`, `logs.rs`, and `helpers.rs`.
- BIN-format test data is synthetic and constructed in helpers; do not add binary fixture blobs to the repo.
- There is no dedicated IPC integration-test layer for Tauri commands yet.

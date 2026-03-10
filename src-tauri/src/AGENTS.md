# Rust Backend (Tauri Shell)

## Overview

Thin Tauri IPC adapter between React frontend and `mavkit` SDK. 9 modules, single-vehicle architecture.

## Modules

| File | Lines | Purpose |
|------|-------|---------|
| `lib.rs` | ~90 | Entry point: `AppState`, `run()`, `invoke_handler!`, plugin registration |
| `commands.rs` | 255 | Vehicle/mission/param/calibration/transport command handlers |
| `connection.rs` | 258 | `connect_link`, `disconnect_link`, `LinkEndpoint` enum, BLE/SPP bridge setup |
| `bridges.rs` | ~140 | 8 watch channel → Tauri event bridge tasks |
| `bluetooth.rs` | ~80 | BLE scan/stop, BT permissions, bonded device listing |
| `logs.rs` | 1703 | Log open/query/summary/export + 34 unit tests (largest file) |
| `recording.rs` | ~100 | `TlogRecorderHandle`, start/stop/status |
| `helpers.rs` | ~80 | `with_vehicle()`, `with_log_store()` guards, `downsample()` + 6 tests |
| `main.rs` | 5 | Stub → `ironwing::run()` |

## AppState

```rust
pub(crate) struct AppState {
    pub(crate) vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<AbortHandle>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) recorder: TlogRecorderHandle,
}
```

- Single vehicle at a time (`Option<Vehicle>`)
- `connect_abort` cancels in-flight `Vehicle::connect()` awaits
- `log_store` independent of vehicle — logs viewable while disconnected
- `recorder` uses `std::sync::Mutex` internally (not tokio) — accessed from both sync and async contexts

## Command Pattern

All vehicle commands use `with_vehicle()` → `MappedMutexGuard`:

```rust
#[tauri::command]
async fn my_command(state: State<'_, AppState>, arg: String) -> Result<T, String> {
    let vehicle = with_vehicle(&state).await?;  // returns Err("not connected") if None
    vehicle.some_method().await.map_err(|e| e.to_string())
}
```

Pure commands (validate, parse) skip the vehicle guard and are sync.

### Adding a new command

1. Write handler in `commands.rs` (or `logs.rs`/`recording.rs` if domain-specific)
2. Import in `lib.rs` and add to `invoke_handler![]` block
3. Add TypeScript wrapper in appropriate `src/*.ts` bridge file

## Platform Gating

**Inside command functions**, not separate handler blocks:

```rust
#[tauri::command]
async fn list_serial_ports_cmd() -> Result<Vec<PortInfo>, String> {
    #[cfg(not(target_os = "android"))]
    { /* real implementation */ }
    #[cfg(target_os = "android")]
    { Err("not supported on Android".into()) }
}
```

Gated items:
- `LinkEndpoint::Serial` variant — `#[cfg(not(target_os = "android"))]`
- `LinkEndpoint::BluetoothSpp` variant — `#[cfg(target_os = "android")]`
- `list_serial_ports_cmd`, `available_transports`, `bt_get_bonded_devices` — dual `#[cfg]` bodies
- Plugin registration in `lib.rs` setup: `bluetooth-classic` + `geolocation` are `#[cfg(target_os = "android")]` only
- Desktop-only: `#[cfg(desktop)]` sets window background color in setup

## Watch Bridge Pattern (`bridges.rs`)

8 tasks spawned via `spawn_event_bridges()` on connect. Each follows:

```rust
let mut rx = vehicle.watch_channel();
tokio::spawn(async move {
    while rx.changed().await.is_ok() {
        let val = rx.borrow().clone();
        let _ = handle.emit("event://name", &val);
    }
    // Auto-terminates when Vehicle drops (sender closes)
});
```

**Exception**: Telemetry bridge uses throttled poll (`TELEMETRY_INTERVAL_MS` atomic, default 200ms), not `changed().await`. Rate adjustable live via `set_telemetry_rate` command without restarting the task.

### Adding a new event bridge

1. Add a new block in `spawn_event_bridges()` following the pattern above
2. Add TypeScript `listen()` wrapper in the appropriate bridge file
3. Subscribe in a hook's `useEffect`, return unlisten in cleanup

## Connection Lifecycle

```
connect_link():
  1. Abort any in-flight connect (connect_abort handle)
  2. Take + disconnect any existing Vehicle
  3. Match LinkEndpoint → create Vehicle (UDP/TCP/Serial direct, BLE/SPP via channel_pair)
  4. store_connected_vehicle():
     a. spawn_event_bridges(app, &vehicle)  // 8 watch→event tasks
     b. state.vehicle = Some(vehicle)

disconnect_link():
  1. recorder.stop()                        // stop TLOG recording if active
  2. Abort connect_abort handle             // cancel in-flight connect
  3. state.vehicle.take() → v.disconnect()  // Vehicle drops → bridge tasks terminate
```

## Recording (`recording.rs`)

`TlogRecorderHandle` wraps `Arc<std::sync::Mutex<Option<TlogRecorderInner>>>`.

- `start()`: subscribes to `vehicle.raw_messages()` broadcast, spawns tokio task writing to `TlogWriter<BufWriter<File>>`
- `stop()`: signals shutdown via `AtomicBool`, waits for flush
- `status()`: returns `RecordingStatus` (`"idle"` | `{ recording: { file_name, bytes_written } }`)
- Uses `std::sync::Mutex` because `stop()` is called from sync disconnect path

## Log Analysis (`logs.rs`)

`LogStore` holds parsed TLOG or BIN log in memory. Dual-format:
- **TLOG**: MAVLink timestamped. `TlogFile` → `StoredEntry` with field extraction per message type
- **BIN**: ArduPilot binary dataflash. `ardupilot_binlog::Reader` → format definitions → `StoredEntry`

Key operations:
- `log_open` — parses file, emits `log://progress` inline (not via bridge)
- `log_query` — query by message type with optional time range + downsampling
- `log_get_telemetry_track` — 100ms-interval telemetry snapshots for playback
- `log_get_flight_path` — GPS track for map
- `log_export_csv` — write queried data to CSV with optional time range

## Error Convention

All commands return `Result<T, String>`. Errors are `.map_err(|e| e.to_string())` — no structured error types at the IPC boundary.

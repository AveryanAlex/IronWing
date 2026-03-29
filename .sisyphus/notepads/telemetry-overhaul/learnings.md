# Telemetry Overhaul — Learnings

## Conventions & Patterns

## 2026-03-29 Initial Codebase Analysis

### Rust Backend Patterns
- `bridges.rs:122-178`: Telemetry polling uses `vehicle.telemetry().<domain>().<metric>().latest()` pattern, builds flat JSON via `serde_json::json!{}`, then calls `telemetry_snapshot_from_value()` to group into TelemetryState
- `commands.rs:set_telemetry_rate`: Sync command pattern with validation, stores to TELEMETRY_INTERVAL_MS atomic
- `connection.rs:122-142`: `MAV_CMD_SET_MESSAGE_INTERVAL` sent via `vehicle.raw().command_long(MavCmd::MAV_CMD_SET_MESSAGE_INTERVAL as u16, [message_id, interval_usec, 0.0, 0.0, 0.0, 0.0, 0.0])`
- `helpers.rs:with_vehicle`: Returns `MappedMutexGuard<Vehicle>` or Err("not connected")
- `lib.rs:105-175`: All commands in single `tauri::generate_handler![]` block

### IPC Telemetry Contract
- `ipc/telemetry.rs`: TelemetryState struct already has ALL 7 domain groups (flight, navigation, attitude, power, gps, terrain, radio)
- `telemetry_state_from_value()` maps flat JSON keys to grouped struct; uses helper fns: `number()`, `integer()`, `string()`, `number_list()`
- All 10 missing fields already exist in Rust struct AND TypeScript types — bridge just doesn't populate them

### Missing Bridge Fields (10 total)
- `target_bearing_deg` — navigation
- `xtrack_error_m` — navigation
- `terrain_height_m` — terrain
- `height_above_terrain_m` — terrain
- `battery_voltage_cells` — power (Vec<f64>)
- `energy_consumed_wh` — power
- `battery_time_remaining_s` — power
- `rc_channels` — radio (Vec<f64>)
- `rc_rssi` — radio
- `servo_outputs` — radio (Vec<f64>)

### Frontend Patterns
- `types.ts`: `ActiveTab` is union type, `TABS` is `{id, label, Icon}[]`
- `App.tsx:102`: `activeTab` default is "map", tab switching in InsetPanelFrame (lines 180-204)
- `telemetry.ts:setTelemetryRate`: `invoke("set_telemetry_rate", { rateHz })` pattern
- `use-settings.ts`: Simple Settings type, loadSettings from localStorage("mpng_settings"), updateSettings(patch) merges and saves
- Settings fields: `telemetryRateHz` and `svsEnabled` only

### 2026-03-29 Tab Rename Follow-up
- Renaming the tab in `types.ts` is enough for `TopBar` and `BottomNav` because both derive directly from `TABS`.
- `App.tsx` only needs the default state and the tab branch label updated; `MapPanel` can stay wired in until the Overview panel lands.

### 2026-03-29 Message Rate Commands
- `set_message_rate` should use `with_vehicle(&state).await?` plus `command_long(MAV_CMD_SET_MESSAGE_INTERVAL, [...])` and validate the caller-provided Hz range before converting to microseconds.
- `get_available_message_rates` is a simple static response shape; keeping the curated list in `commands.rs` avoids any frontend-specific source of truth.

## Vehicle Status UI Redesign (Sidebar)
- Utilized CSS grid with card-style layout for telemetry stats (State, Mode, Alt, Speed, Battery, Heading, GPS).
- Incorporated status-aware coloring based on existing design tokens (e.g. text-success, text-warning, text-danger for battery).
- Applied muted styles/placeholders gracefully when disconnected or values missing.
- Used "transition-colors duration-300" to ensure smooth visual changes in live updates.


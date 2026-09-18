# Embedded MCP server

IronWing desktop exposes its shared live vehicle over MCP Streamable HTTP using `rmcp` and Axum. Open **App settings → MCP server**, enable the listener and apply. Defaults are **disabled**, `127.0.0.1:14243`, endpoint **`http://127.0.0.1:14243/mcp`**, with no token. The desktop process must remain running; hiding the macOS window is sufficient. Web and Android do not host MCP.

In an agent client supporting Streamable HTTP, add the endpoint URL. If you generated a token in IronWing, configure an `Authorization: Bearer <token>` request header in the client, or use its bearer-token environment-variable setting. No stdio subprocess or separate IronWing server process is required. Both current and legacy Streamable HTTP protocol negotiation are handled by rmcp; the old standalone HTTP+SSE transport is not provided.

The address may be `localhost`, an IPv4/IPv6 interface address, `0.0.0.0` or `::`. Wildcard addresses are listen addresses; agents on another computer use this computer's reachable IP. Authentication remains optional on all interfaces. The listener uses HTTP; TLS termination, if required, is external. Browser requests with an Origin header are rejected; command-line agents normally send no Origin. Token checks apply to each HTTP request, including existing sessions.

Configuration is persisted in the Tauri app configuration directory as `mcp.json`, with owner-only permissions on Unix. Tokens are not logged, placed in URLs or sent to analytics. Copying a generated token does not activate it until **Apply MCP settings**. Changing settings takes effect immediately. A bind failure preserves the previous listener; startup failures appear in the panel. Turning the server off cancels requests and releases its port without disconnecting the vehicle.

## Tools

| Tool | Input / result |
| --- | --- |
| `connection_status` | Shared live connection state, transport, connection session ID and effective UI source. |
| `devices_list` | Optional `scan_timeout_ms` (3000 default, 100–30000); transports, serial/USB inventory, Nordic UART BLE devices and demo presets. BLE errors do not hide serial inventory. |
| `vehicle_connect` | `transport` with `kind` and settings; optional `replace` and `auto_record_on_connect`. Serial: `{kind:"serial",port:"/dev/ttyACM0",baud:115200}`; TCP: `{kind:"tcp",address:"127.0.0.1:5760"}`; UDP: `{kind:"udp",bind_addr:"0.0.0.0:14550"}`; BLE: `{kind:"bluetooth_ble",address:"…",profile:"nordic_uart"}`; demo: `{kind:"demo",vehicle_preset:"airplane"}`. |
| `vehicle_disconnect` | Optional expected `session_id`; disconnects the same vehicle visible in the UI. |
| `vehicle_status` | Live mode/armed state, firmware, hardware, unique IDs, link and sensor health. Connected serial-device USB information includes its serial number when available. The 64-bit UID is a decimal string to avoid precision loss in JSON clients. Unavailable information is null. |
| `parameters_search` | Optional `regex`, `case_sensitive` (false), `limit`; searches ID, human name and description. Omit regex and limit for all parameters, sorted by ID. Returns total and explicit truncation. |
| `parameters_read` | `ids: string[]`; confirmed cached values plus metadata and synchronization state. Downloads an empty cache first. Unknown IDs have per-item `not_found` errors. |
| `parameters_write` | `params: [{id,value}]`, optional expected `session_id`; immediate batch write with requested/confirmed values and per-item success. No UI approval, clamping, automatic reboot or application of UI-staged edits. Not atomic. |
| `parameters_refresh` | Optional expected `session_id`; waits for a complete new download and reports count/sync. |
| `telemetry_catalog` | Named metrics with source message IDs and units, plus observed raw packet fields. |
| `message_rates_write` | `rates: [{message_id,rate_hz}]`, optional expected `session_id`; rates 0.1–50 Hz. Results acknowledge stream requests; actual receipt is measured separately. Does not change UI refresh cadence. |
| `telemetry_read` | `fields`, `count` (1), `interval_ms` (1000); returns a timed collection of points. |
| `status_text_read` | Optional `cursor: {session_id,sequence}` and `severity: string[]`; shared last 100 STATUSTEXT entries with next cursor and `history_lost`. |
| `vehicle_reboot` | Optional expected `session_id`; acknowledges reboot command, not completed boot. Check status and reconnect afterwards if needed. |

All parameter reads identify their cache synchronization state. Metadata includes ID, value/type, human name, description, range, increment, units, enum options, bitmask, read-only/reboot flags and user level. `metadata_available=false` distinguishes missing documentation from an unknown parameter. Backend metadata uses the same versioned/family/SITL/AP_Periph precedence as the frontend, a seven-day disk cache, and stale-cache fallback when offline.

Writes use the existing live runtime and remain blocked while playback is the effective UI source. Reads are explicitly live, never replay samples. An agent connection session is independent of an MCP HTTP session and is invalidated when the vehicle changes. Pass `session_id` on mutations when decisions were based on an earlier status/read. Concurrent MAVLink parameter/mission operations may return an operation conflict; retry after the active operation completes. A cancelled or failed batch never implies rollback of already acknowledged changes.

## Example: inspect a barometer and IMU

1. `devices_list`, then `vehicle_connect` using the desired endpoint and baud rate/profile.
2. `parameters_search({"regex":"^(BARO|INS)_"})` and `parameters_read` for the parameters of interest.
3. `parameters_write` if changes are needed; inspect confirmation results. Reboot only when necessary.
4. `telemetry_catalog` to discover sensor names and source message IDs.
5. Enable the primary pressure and scaled IMU streams:

```json
{"rates":[{"message_id":29,"rate_hz":5},{"message_id":26,"rate_hz":5}]}
```

6. Collect ten points, one per second:

```json
{
  "fields":["barometer.0.pressure_hpa","barometer.0.temperature_c","imu.0.acceleration_x_mps2","imu.0.acceleration_z_mps2"],
  "count":10,
  "interval_ms":1000
}
```

The first point is sampled immediately, so ten points span nine seconds. Each field has `received_at_ms`, `age_ms`, and `new_packet`. Equal values with `new_packet=true` mean new packets arrived; `new_packet=false` with growing age means a repeated cached observation. This establishes stream activity, not whether the sensor hardware is internally healthy. Missing data is null; reading never enables streams automatically. Normalized flight metrics come from mavkit; barometers and IMUs come from scaled MAVLink packets. Sensor indices 0/1/2 select separate SCALED_PRESSURE / SCALED_PRESSURE2 / SCALED_PRESSURE3 and SCALED_IMU / SCALED_IMU2 / SCALED_IMU3 messages.

Raw fields may be requested even before their first packet, e.g.:

```json
{"fields":[{"message_id":27,"field":"xacc","component_id":1,"instance":0}],"count":5,"interval_ms":500}
```

Raw values retain MAVLink wire units; RAW_IMU values are not assigned generic SI units. Dotted paths support nested objects and array indices. Responses identify the selected component and instance. Without these filters, the most recently observed matching packet is used.

Limits: 1–64 fields, 1–1000 points, interval at least 20 ms, `(count-1)*interval_ms <= 60000`. Collection stops with partial results on disconnect, session change or cancellation. It is a snapshot sampler, not a lossless packet recorder. STATUSTEXT history is shared with the dashboard; use its cursor to avoid rereading alerts and inspect `history_lost` after reconnects or history overflow.

Flight control, mission editing, firmware installation, calibration wizards and background long-running measurements are outside this tool surface.

## Verification

- `cargo test -p ironwing mcp:: --lib`: sampling, metadata, listener/auth and real rmcp HTTP client tests.
- `pnpm exec vitest run src/components/settings/McpSettingsPanel.test.ts src/param-metadata-shared.test.ts`: focused UI and shared metadata fixture.
- `pnpm run e2e:native`: existing native smoke followed by MCP → real SITL connection, parameter echo/readback, barometer/IMU sampling and reboot/reconnect. Requires the existing native WebDriver/Docker environment.

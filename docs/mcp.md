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
| `parameters_search` | Optional `regex`, `case_sensitive` (false), `limit` (50); searches ID, human name and description. Omit regex to match all parameters, sorted by ID. An explicit limit has no application maximum; set it to the reported total to retrieve all matches. Returns a context header with total/truncation, then brief CSV: `id,value,human_name,units,read_only,reboot_required,metadata_available`. `limit: 0` returns the count and a header-only CSV. |
| `parameters_read` | `ids: string[]`, optional `mode` (`values` default or `details`). Always CSV: values uses `id,value,type,error`; details adds metadata columns. Downloads an empty cache first. Unknown IDs have per-item `not_found` errors. |
| `parameters_write` | `params: [{id,value}]`, optional expected `session_id`; immediate batch write with requested/confirmed values and per-item success. No UI approval, clamping, automatic reboot or application of UI-staged edits. Not atomic. |
| `parameters_refresh` | Optional expected `session_id`; waits for a complete new download and reports count/sync. |
| `telemetry_catalog` | Three text blocks: context, CSV named metrics (`name,units,message_id,field,scale`), CSV observed packets (`message_id,name,component_id,instance,fields,age_ms`). |
| `message_rates_write` | `rates: [{message_id,rate_hz}]`, optional expected `session_id`; rates 0.1–50 Hz. Results acknowledge stream requests; actual receipt is measured separately. Does not change UI refresh cadence. |
| `telemetry_read` | `fields`, `count` (1), `interval_ms` (1000); returns two text blocks: a brief session/timing legend, then plain CSV. No `structuredContent` or output JSON Schema. |
| `status_text_read` | Optional `cursor: {session_id,sequence}` and `severity: string[]`; always CSV (`timestamp_usec,severity,sequence,text`), including empty/small histories. Context includes next cursor and `history_lost`; shared last 100 STATUSTEXT entries. |
| `vehicle_reboot` | Optional expected `session_id`; acknowledges reboot command, not completed boot. Check status and reconnect afterwards if needed. |

All parameter reads identify their cache synchronization state. `parameters_search` is compact discovery; use `parameters_read({"ids":["BARO_TYPE"],"mode":"details"})` for full documentation. The default `mode:"values"` does not fetch metadata. Agents should use a focused search regex and deliberate limit, then request `mode:"details"` only for relevant IDs to understand their documentation before interpreting or changing them. Reading all discovered IDs in `mode:"values"` is allowed but moderately expensive (about 17k tokens for the 1438-parameter demo snapshot). Reuse the snapshot instead of repeatedly fetching every value: configuration parameters normally remain stable until changed. Successful writes return vehicle-echoed values and update the app cache, so a confirmation-only `parameters_read` is unnecessary. Obtain a fresh snapshot when the vehicle/session changes or freshness is required, following the flight-state/consent rule below. Detailed CSV includes ID, value/type, human name, description, range, increment, units, enum options, bitmask, read-only/reboot flags and user level. `metadata_available=false` distinguishes missing documentation from an unknown parameter. Backend metadata uses the same versioned/family/SITL/AP_Periph precedence as the frontend, a seven-day disk cache, and stale-cache fallback when offline.

### Compact read responses

`parameters_search`, `parameters_read`, `telemetry_catalog` and `status_text_read` always return text-only content, with no `structuredContent` or output JSON Schema. The first text block is a small JSON context header (session, source, counts, and synchronization or cursor/history-loss where applicable). Subsequent blocks are plain CSV, without Markdown fences or alignment padding. Parse each CSV block separately. CSV uses comma separators, CRLF records, double-quoted fields when needed, and doubled quotes inside quoted fields. Embedded line breaks in descriptions/alerts are preserved: use a CSV parser, not a line split. `—` denotes an unavailable/null value; `false`, `0` and empty strings remain distinct.

Parameter details extend the value columns with `metadata_available,human_name,description,range,increment,units,unit_text,values,bitmask,read_only,reboot_required,user_level`. `range`, enum `values`, and `bitmask` cells contain compact JSON encoded with ordinary CSV quoting; decode the CSV cell first, then its JSON. No metadata is silently truncated. The observed-packet catalog uses the same convention for its `fields` array. A successful parameter row has `error=—`; unknown IDs have `error=not_found` and unavailable value/type cells. Search remains sorted by ID, defaults to 50 results, and has no application cap on an explicit limit.

The CSV context for parameter reads retains `sync,total,truncated,returned`; `total` for batch reads includes requested IDs that were not found. The catalog context includes `named_count,observed_count`, raw units, a raw-selector example and the stream-rate note. Alert context retains the full `{session_id,sequence}` cursor and `history_lost`, even when filtering yields no entries. Alert timestamps keep the original `timestamp_usec` precision; missing timestamps are `—`. These read tools return text errors with MCP `isError=true`.

`devices_list`, connection/vehicle status, refresh, writes, connection changes and reboot retain their structured JSON results and output schemas. Telemetry samples retain their separate timing legend and time-in-columns CSV format described below.

Writes use the existing live runtime and remain blocked while playback is the effective UI source. Reads are explicitly live, never replay samples. An agent connection session is independent of an MCP HTTP session and is invalidated when the vehicle changes. Pass `session_id` on mutations when decisions were based on an earlier status/read. Concurrent MAVLink parameter/mission operations may return an operation conflict; retry after the active operation completes. A cancelled or failed batch never implies rollback of already acknowledged changes.

## Agent workflow and write confirmation

Start with `connection_status`. Reuse the intended connection, or discover devices and call `vehicle_connect` if needed, then `vehicle_status` for basic vehicle information. Request telemetry as needed.

Before starting parameter work, check whether the vehicle is flying, then call `parameters_refresh` once. `vehicle_status` exposes armed/mode, but armed alone is not proof of flight or ground state; inspect telemetry if needed (for example raw `EXTENDED_SYS_STATE`, message 245, field `landed_state`, when available). A full download can saturate the link: an airborne vehicle requires explicit user consent. If ground state is uncertain, establish it or obtain consent first. This also applies to search/read/write calls that automatically download an empty cache. This is guidance supplied to the agent, not a backend flight-state interlock.

Search the refreshed cache using focused regex/limits. Reading all values is allowed; reuse that snapshot. Before working with a parameter, the agent must load its documentation through `parameters_read(mode:"details")`, limited to relevant IDs.

`parameters_write` immediately sends `PARAM_SET` for each item and waits for its `PARAM_VALUE` echo. The echoed value becomes `confirmed_value` and updates the shared app cache; `success` checks it against the requested value within the SDK tolerance. It does **not** send an independent `PARAM_REQUEST_READ` after the write or redownload all parameters. A confirmation-only `parameters_read` would just read the same updated cache and is unnecessary for successful writes. For failed items, `confirmed_value` can be either a mismatching echo or the SDK's `0.0` placeholder after timeout/other errors; `success:false` must not be interpreted as a verified zero value.

## Example: inspect a barometer and IMU

1. `connection_status`; if needed, `devices_list` and `vehicle_connect`, then `vehicle_status`.
2. Check flight state and obtain user consent if airborne (or unable to establish ground state), then `parameters_refresh`.
3. `parameters_search({"regex":"^(BARO|INS)_","limit":50})`, then `parameters_read({"ids":["BARO_TYPE"],"mode":"details"})` for each parameter being worked on.
4. `parameters_write` if changes are needed; inspect each result and reuse successful echoed values. Reboot only when necessary.
5. When telemetry is needed, use `telemetry_catalog` to discover sensor names and source message IDs. Enable the primary pressure and scaled IMU streams if absent:

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

The first point is sampled immediately, so ten points span nine seconds. The second text block is standard comma-separated CSV: sample times are columns, each selected sensor field occupies one row, and the source is listed once per row. The first block contains the session/timing legend; pass only the second block to a CSV parser. CSV records use CRLF; fields containing commas, quotes or line breaks are quoted, and embedded quotes are doubled. No Markdown fencing or padding spaces are added. `t0` is Unix milliseconds; time-column headers and `rx` are millisecond offsets from `t0`. Each cell is `value@rx/age`, with `+` when a new packet arrived since the previous sample. No `+` means a cached packet, and `—` marks missing values. If a field changes source (component/instance/message), `#n` selects its source in the Source column. Values retain their numeric precision; timestamps and age remain recoverable without repeating long JSON keys.

For example, a constant value from two fresh packets followed by a stalled stream is:

```csv
Field,Source,0,1000,2000
barometer.0.pressure_hpa,"msg=29, comp=1",1013.25@-10/10+,1013.25@990/10+,1013.25@990/1010
```

The response header includes the session, actual/requested point counts, interval and completion reason, including partial or empty results after cancellation. Vehicle boot-clock metadata is omitted; packet receipt times use the host clock. This establishes stream activity, not whether the sensor hardware is internally healthy. Reading never enables streams automatically. Normalized flight metrics come from mavkit; barometers and IMUs come from scaled MAVLink packets. Sensor indices 0/1/2 select separate SCALED_PRESSURE / SCALED_PRESSURE2 / SCALED_PRESSURE3 and SCALED_IMU / SCALED_IMU2 / SCALED_IMU3 messages.

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

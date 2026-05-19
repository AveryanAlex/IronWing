# Native telemetry initialization handoff

## Problem

On native Tauri connect, the user currently sees telemetry in three stages:

1. `--` placeholders
2. misleading early values like `-0.0 m`, `0.0 m/s`, `100.0%`, `No fix · 0 sats`
3. real telemetry like `14.1 m`, `RTK fixed · 10 sats`

This is bad UX. Users should not see stage 2 as if it were trustworthy live telemetry.

## Key finding

This is **not primarily a Tauri event delivery bug** and **not primarily a frontend fake-data seed bug**.

The Tauri event-sink issue was a separate bug that blocked native telemetry entirely. After fixing that, this initialization issue is still visible.

The current problem is mostly:

- `mavkit` publishes the first MAVLink-derived telemetry samples it receives
- IronWing surfaces those samples immediately in compact summary/sidebar UI
- IronWing does not gate those values behind a "telemetry is ready/trustworthy" rule

## Evidence trail

### Stage 1: placeholders are intentional

Native live runtime starts with missing telemetry:

- `crates/ironwing-core/src/live_runtime/live_vehicle_runtime.rs`
  - `live_telemetry: TelemetrySnapshot::missing(DomainProvenance::Bootstrap)`
- `crates/ironwing-core/src/live/snapshot.rs`
  - `base_live_snapshot_from_caches()` returns missing telemetry until connected/live telemetry exists

So the initial `--` state is expected.

### Stage 2: early values are coming from real backend samples

The "fake" values are actually early raw samples:

- battery from `SYS_STATUS`
  - `~/.cargo/git/checkouts/.../mavkit/.../src/event_loop/state_update/system.rs`
- GPS fix/sats from `GPS_RAW_INT`
  - `~/.cargo/git/checkouts/.../mavkit/.../src/event_loop/state_update/gps.rs`
- altitude/speed/heading from `GLOBAL_POSITION_INT` / `VFR_HUD`
  - `~/.cargo/git/checkouts/.../mavkit/.../src/event_loop/state_update/flight.rs`

These values are low-level real inputs, but not necessarily operationally trustworthy immediately after connect.

### Frontend currently renders them too eagerly

`src/lib/telemetry-selectors.ts` is the main place to inspect.

#### Compact summary path

- `selectTelemetrySummaryView(connected, telemetry)`
- renders values whenever `connected === true`
- does **not** check readiness, completeness, degraded state, or GPS quality before showing values

This is why the compact vehicle panel can show:

- `ALT -0.0 m`
- `SPEED 0.0 m/s`
- `BATTERY 100.0%`
- `GPS No fix · 0 sats`

as if they were already good live telemetry.

#### Operator/degraded path

- `selectOperatorTelemetryView(...)`
- intentionally preserves partial values while marking them `degraded`

That behavior is acceptable for detailed/operator views, but not for the compact user-facing summary without extra gating.

## Ownership assessment

### Not primarily a mavkit bug

`mavkit` appears to be behaving like a low-level SDK:

- it publishes the first valid decoded samples it sees
- it does not currently promise that those samples are fully trustworthy/settled for UX purposes

### IronWing bug

IronWing is responsible for:

- not treating early partial telemetry as trustworthy user-facing telemetry
- adding a telemetry readiness gate before showing compact summary values

## Recommended fix

### Product-level fix to implement in IronWing

Add a **telemetry readiness / trust gate** for compact summary/sidebar rendering.

Instead of:

- "connected means show telemetry values"

Use:

- "connected and telemetry is trustworthy means show telemetry values"

Until then, keep placeholders.

### Practical implementation options

#### Option A: frontend-only gate in selectors

Update `src/lib/telemetry-selectors.ts` so the compact summary does not show real numbers until a readiness condition is met.

Candidate readiness rules:

- GPS fix is better than `NoFix`, or
- a minimum set of live fields is present and domain is complete enough, or
- telemetry is no longer degraded/bootstrap-partial

This is the fastest product fix.

#### Option B: shared contract-level readiness flag (preferred)

Add a shared concept such as:

- `telemetry_ready: boolean`, or
- `telemetry_quality.phase = "bootstrap" | "partial" | "ready"`

at the shared Rust/core layer, then consume it from all frontends.

Benefits:

- one definition of readiness
- less UI heuristic drift
- works consistently across Tauri/web/mock

## What not to do

- Do **not** fix this by hiding all early backend samples inside `mavkit` without careful thought.
- Do **not** assume `0.0` means valid enough for UX just because it is a finite number.
- Do **not** use the compact summary as a raw telemetry debug surface.

## Suggested next steps

1. Decide whether to implement Option A or Option B.
2. Add regression tests for the compact summary/sidebar:
   - connected + partial bootstrap telemetry -> still placeholders
   - connected + degraded early `No fix / 0 sats / 0 alt` -> still placeholders
   - connected + ready live telemetry -> render real values
3. Re-run native Tauri flow after fix.

## Related but separate bug already found earlier

There was also a native Tauri issue where telemetry events were emitted but not delivered because `TauriEventSink` never received an `AppHandle` due to overwritten `.setup(...)` wiring in `src-tauri/src/lib.rs`.

That issue is separate from this telemetry-initialization UX problem.

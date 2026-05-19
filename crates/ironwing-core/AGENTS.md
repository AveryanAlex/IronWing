# IronWing Core

## Overview

Shared Rust domain boundary used by the Tauri shell and non-Tauri runtimes. This crate is the source of truth for IPC wire contracts, runtime descriptors, and reusable live/log helpers. Keep Tauri-specific APIs out of this crate.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| IPC wire contracts | `src/ipc/` | Typed serde payloads, envelopes, snapshots, log/recording payloads |
| Telemetry snapshots | `src/telemetry.rs`, `src/ipc/telemetry.rs` | Shared telemetry domain and IPC conversion helpers |
| Transport descriptors | `src/transport.rs` | Platform-neutral transport types used by runtime adapters |
| Log playback helpers | `src/log_playback.rs`, `src/ipc/playback.rs` | Shared playback state and IPC progress shape |
| Live runtime bridge helpers | `src/live_runtime/`, `src/live/` | Event sinks, task sets, command helpers, live session snapshots |
| Event names | `src/event_names.rs` | URI-style event constants shared by emitters and bridges |

## Rules

- Add or change IPC wire types under `src/ipc/` first; Tauri re-exports them from `src-tauri/src/ipc/mod.rs`.
- Keep serde field names and enum tags aligned with frontend TypeScript contracts and fixture tests.
- Prefer platform-neutral descriptors and helpers here; platform gating belongs in adapters such as `src-tauri/src/`.

# Firmware Subsystem

## Overview

Firmware flashing is its own subsystem with two independent product paths: serial bootloader flashing and DFU recovery. It has a typed session model, typed outcomes, inline progress events, and a large in-module test harness.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| IPC commands / task orchestration | `commands.rs` | Starts sessions, emits progress, owns abort handles |
| Session / wire types | `types.rs` | IPC-visible enums, session handle, error types |
| Catalog and manifest flow | `catalog.rs`, `cache.rs` | Remote manifest fetch, cache, grouped targets |
| Artifact parsing | `artifact.rs` | APJ parsing, BIN acceptance, payload extraction |
| Serial flashing path | `serial_executor.rs`, `serial_uploader.rs` | Bootloader protocol path |
| DFU recovery path | `dfu_recovery.rs` | USB DFU recovery path |
| Device discovery | `discovery.rs` | Port and DFU device enumeration |
| Test harness | `mod.rs` | Large inline test module plus module exports |

## Core Rules

- Serial primary and DFU recovery are separate flows. Do not fold one into the other.
- `FirmwareSessionHandle` prevents concurrent firmware operations. `firmware_abort` cancels the running async task. Both matter.
- Internal code uses typed firmware enums/errors; stringify only at the outer IPC boundary.
- `firmware://progress` is emitted inline from commands, not via the generic watch-bridge system.
- Firmware operations are desktop-only; Android paths should remain explicit unsupported stubs where applicable.

## Session Model

- Start a session before doing work; stop it on every terminal path.
- Treat `FirmwareSessionStatus` as a frontend wire contract. Changes require matching TypeScript updates and tests.
- Keep serial outcomes, DFU outcomes, and cross-path wrappers distinct; they are intentionally not one generic enum.

## Artifact / Catalog Notes

- `catalog.rs` owns manifest fetch, parse, grouping, and cache behavior.
- `artifact.rs` owns APJ parsing and raw binary extraction.
- Do not mix discovery, artifact parsing, and flashing concerns in one file.

## Tests

- `mod.rs` holds the subsystem test harness and wire-contract coverage.
- Add or update tests when changing tagged enums, event payloads, APJ parsing, or serial/DFU flow behavior.
- Keep tests behavior- and contract-oriented; avoid relying on incidental formatting.

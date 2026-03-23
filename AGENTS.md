# Agent Instructions

## Overview

Modern ground control station for MAVLink vehicles. Tauri v2 app with a React/TypeScript frontend, a Rust Tauri shell, and the `mavkit` SDK as the domain layer. Desktop targets Linux/macOS/Windows; Android is supported with platform-gated transports and plugins.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Frontend state, IPC bridges, UI patterns | `src/AGENTS.md` | Hook ownership, bridge wrappers, frontend tests |
| Platform alias boundary (`@platform/*`) | `src/platform/AGENTS.md` | Build-time Tauri vs mocked-browser split |
| Setup UI and staging flow | `src/components/setup/AGENTS.md` | Shared primitives, panel orchestration |
| Per-section setup rules | `src/components/setup/sections/AGENTS.md` | Section anatomy, docs links, helper placement |
| Rust shell, commands, bridges, recording, logs | `src-tauri/src/AGENTS.md` | AppState, command patterns, event relays |
| Firmware flashing / DFU recovery | `src-tauri/src/firmware/AGENTS.md` | Session model, serial vs DFU paths |
| Playwright E2E | `e2e/AGENTS.md` | Mocked browser workflow, spec conventions |
| Native WebDriver E2E | `e2e-native/AGENTS.md` | Real Tauri + Rust + SITL smoke lane |
| Dev/E2E workflow helpers | `scripts/workflow/AGENTS.md` | Runtime port math, cleanup, SITL helpers |

## Build & Test Commands

```bash
# Frontend
pnpm run frontend:typecheck
pnpm run frontend:build
pnpm test

# Rust
cargo check --workspace
cargo clippy --all-targets --all-features -- -D warnings
cargo test --workspace

# Dev / E2E
pnpm run dev
pnpm run tauri:dev
pnpm run android:dev
pnpm run android:build
pnpm e2e
pnpm e2e:headed
pnpm run e2e:native
```

Run commands from the repo root. Nix (`flake.nix` + `.envrc`) is the canonical reproducible environment.

## mavkit Boundary

- `mavkit` and `ardupilot-binlog` are git dependencies from `github.com/AveryanAlex`, not crates.io packages.
- `mavkit` is this project's SDK boundary; it is acceptable to change when IronWing needs it.
- Keep Rust and TypeScript wire contracts aligned when changing mavkit-facing behavior.
- Updating the git ref in `Cargo.lock` is done through normal Cargo resolution (`cargo update`).

## Architecture

```text
React (TypeScript) ── invoke/listen ──> Tauri Shell (Rust) ──> mavkit
```

- Frontend owns presentation, local staging state, playback UI, and map interactions.
- Tauri shell owns transport setup, command dispatch, event relays, logging, recording, and firmware flows.
- `mavkit` owns MAVLink vehicle/session behavior.

## Cross-layer Conventions

- Frontend IPC imports go through `@platform/core`, `@platform/event`, and `@platform/http` only. Do not import Tauri SDK modules directly outside the platform boundary.
- All IPC-facing Rust enums use snake_case serde names. Tagged unions usually use a `kind` discriminant, but some outcome wrappers use more specific tags such as `result` or `path`.
- TypeScript invoke arguments stay camelCase; Tauri maps them to Rust snake_case.
- Numeric field names carry unit suffixes such as `_m`, `_deg`, `_mps`, `_v`, `_a`, `_pct`, `_usec`, `_secs`, `_hz`.
- `MissionItem.x` / `MissionItem.y` are always degE7 integers. `Telemetry` and `HomePosition` use floating-point `latitude_deg` / `longitude_deg`.
- Mission home handling is a wire-boundary concern only: upload/download conversion happens in mavkit helpers, not in arbitrary frontend/backend code.
- Parameter edits stage locally first and apply in batches. Do not bypass staging for general settings flows.
- Playwright covers mocked browser flows; the thin real Rust↔frontend desktop integration lane now lives in `e2e-native/` via WebDriverIO.

## Transport / Platform Notes

| Transport | Desktop | Android |
|-----------|---------|---------|
| UDP | Yes | Yes |
| TCP | Yes | Yes |
| Serial | Yes | No |
| BLE | Yes | Yes |
| Classic SPP | Via serial bridge only | Yes |

- Platform gating lives in Rust command implementations and transport enums, not in ad-hoc frontend conditionals.
- Frontend transport choices come from `available_transports()`, not hardcoded platform checks.
- Android-only plugins are registered under platform-gated setup blocks in the Rust shell.

## Tooling

- Use `pnpm` only; the version is pinned in `package.json`.
- Tailwind is v4 via `@tailwindcss/vite`; do not introduce `tailwind.config.js`.
- There is no repo-wide ESLint/Biome/Prettier layer; match surrounding style.
- Clippy warnings are CI failures.

## Tests

- Prefer behavior/contract tests over implementation-detail tests.
- Use Vitest for unit and focused jsdom component behavior; use Playwright for mocked browser flows and WebDriverIO for the thin native desktop smoke lane.
- Do not add source-grep tests against `.tsx` source. Source scanning is only acceptable for real architectural guardrails.
- Layer-specific test guidance lives in `src/AGENTS.md`, `src-tauri/src/AGENTS.md`, `e2e/AGENTS.md`, and `e2e-native/AGENTS.md`.
- Keep native desktop coverage intentionally thin and high-value; broad UI coverage still belongs in the mocked Playwright suite.

## PLAN.md Maintenance

- Treat `PLAN.md` as a living roadmap, not a changelog.
- Update milestone status when shipped work materially changes scope or completion state.
- Keep completed milestones summarized and current/future work detailed.

## Known Quirks

- IPC event names use URI-style strings such as `telemetry://state`, `session://state`, `mission://state`, `param://store`, `param://progress`, `sensor_health://state`, `calibration://state`, `compass://cal_progress`, `compass://cal_report`, `configuration_facts://state`, `status_text://state`, `support://state`, and `firmware://progress`.
- `mpng_settings` is a legacy localStorage key name and should not be renamed casually.
- `mav.tlog`, `mav.tlog.raw`, and `mav.parm` at repo root are developer SITL artifacts, not committed fixtures.
- Parameter metadata is fetched at runtime from `autotest.ardupilot.org` via the platform HTTP layer and cached locally.

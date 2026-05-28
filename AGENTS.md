# Agent Instructions

## Overview

Modern ground control station for MAVLink vehicles. Tauri v2 app with a **Svelte/TypeScript frontend** for the shipped runtime, a Rust Tauri shell, and the `mavkit` SDK as the domain layer. Desktop targets Linux/macOS/Windows; Android is supported with platform-gated transports and plugins.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Active frontend shell, stores, IPC bridges | `src/AGENTS.md` | Shipped Svelte runtime, bridge wrappers, active frontend tests |
| Platform alias boundary (`@platform/*`) | `src/platform/AGENTS.md` | Build-time web, Tauri, remote, and mocked-browser split |
| Shared Rust core / IPC contracts | `crates/ironwing-core/AGENTS.md` | IPC source of truth, runtime descriptors, shared live/log helpers |
| Rust shell, commands, bridges, recording, logs | `src-tauri/src/AGENTS.md` | AppState, command patterns, event relays |
| Tauri IPC adapter re-exports | `src-tauri/src/ipc/AGENTS.md` | Tauri-local re-export surface for shared core contracts |
| Firmware flashing / DFU recovery | `src-tauri/src/firmware/AGENTS.md` | Session model, serial vs DFU paths |
| Playwright E2E | `e2e/AGENTS.md` | Mocked browser workflow, spec conventions |
| Native WebDriver E2E | `e2e-native/AGENTS.md` | Real Tauri + Rust + SITL smoke lane |
| Scripts and workflow helpers | `scripts/AGENTS.md` | Entrypoints, runtime port math, cleanup, SITL helpers |

## Build & Test Commands

```bash
# Frontend
pnpm run check:frontend
pnpm run build:frontend
pnpm run test:frontend

# Rust
pnpm run check:rust
pnpm run test:rust

# Aggregates
pnpm run check
pnpm run test
pnpm run e2e

# Dev / E2E
pnpm run dev:desktop
pnpm run dev:desktop:remote
pnpm run dev:android
pnpm run dev:web
pnpm run build:android
pnpm run e2e:browser
pnpm run e2e:browser:headed
pnpm run e2e:native
```

Run commands from the repo root. Nix (`flake.nix` + `.envrc`) is the canonical reproducible environment.
Dev commands start SITL automatically for live vehicle workflows; the built-in demo vehicle is available from the normal connection picker.
SvelteKit's Vite commands default to the pure web/WASM platform and write `dist/web`; Tauri commands opt into the Tauri platform and `dist/tauri`.

## Agent Remote UI

Use `pnpm run dev:desktop:remote` when an agent needs to see and manipulate the real app with a real Rust + SITL backend from browser-capable agent tools. This is an agent quality-of-life workflow, not an automated test lane; do not add Playwright specs for it unless explicitly requested.

```bash
pnpm run dev:desktop:remote
```

The script starts Docker SITL, launches `tauri dev`, switches the frontend aliases to `src/platform/remote/*`, and starts a dev-only Rust bridge at `http://127.0.0.1:14242` for command invokes and event streaming. Open the printed Vite URL, normally `http://127.0.0.1:5173`, with the agent browser tool. The shell automatically connects to the SITL TCP address upon initialization so the agent can immediately observe live telemetry.

For screenshots, navigate the agent browser to the printed Vite URL, wait for the IronWing shell to automatically connect, then use the browser tool's screenshot action. Keep the native Tauri window open while using the browser page; closing it stops the Rust bridge and SITL cleanup follows.

Useful knobs:

```bash
IRONWING_REMOTE_UI_HOST=0.0.0.0 pnpm run dev:desktop:remote
IRONWING_REMOTE_UI_PORT=14250 pnpm run dev:desktop:remote
IRONWING_REMOTE_UI_VITE_HOST=0.0.0.0 pnpm run dev:desktop:remote
```

## mavkit Boundary

- `mavkit` and `ardupilot-binlog` are git dependencies from `github.com/AveryanAlex`, not crates.io packages.
- `mavkit` is this project's SDK boundary; it is acceptable to change when IronWing needs it.
- Keep Rust and TypeScript wire contracts aligned when changing mavkit-facing behavior.
- Updating the git ref in `Cargo.lock` is done through normal Cargo resolution (`cargo update`).

## Architecture

```text
Svelte (TypeScript) ── invoke/listen ──> Tauri Shell (Rust) ──> mavkit
```

- The active frontend owns shipped presentation, local store state, and browser-facing composition.
- The Tauri shell owns transport setup, command dispatch, event relays, logging, recording, and firmware flows.
- `mavkit` owns MAVLink vehicle/session behavior.
- The active runtime no longer carries React-era source; keep the shipped Svelte path free of React-era imports and file re-entry.

## Cross-layer Conventions

- Frontend IPC imports go through `@platform/core`, `@platform/event`, and `@platform/http` only. Shared analytics goes through `src/lib/analytics/*`, which owns the `@platform/analytics` adapter. Do not import Tauri SDK modules or Aptabase SDKs directly outside the platform boundary.
- Rust IPC wire contracts live in `crates/ironwing-core/src/ipc`; `src-tauri/src/ipc/mod.rs` only re-exports them for the Tauri crate.
- All IPC-facing Rust enums use snake_case serde names. Tagged unions usually use a `kind` discriminant, but some outcome wrappers use more specific tags such as `result` or `path`.
- TypeScript invoke arguments stay camelCase; Tauri maps them to Rust snake_case.
- Numeric field names carry unit suffixes such as `_m`, `_deg`, `_mps`, `_v`, `_a`, `_pct`, `_usec`, `_secs`, `_hz`.
- `MissionItem.x` / `MissionItem.y` are always degE7 integers. `Telemetry` and `HomePosition` use floating-point `latitude_deg` / `longitude_deg`.
- Mission home handling is a wire-boundary concern only: upload/download conversion happens in mavkit helpers, not in arbitrary frontend/backend code.
- Active IPC and web<->Rust contracts have no repo-internal backward-compatibility burden unless explicitly required. Change Rust, Tauri/web/remote/mock layers, and TypeScript together instead of carrying serde aliases, wrapper commands, fallback command arrays, or old wire names just for compatibility.
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
- Do not hand-edit or roll back `src/platform/web/generated/ironwing_wasm.d.ts`. Regenerate it by building the web WASM module, and commit the generated update when Rust-side WASM exports change.
- Tailwind is v4 via `@tailwindcss/vite`; do not introduce `tailwind.config.js`.
- There is no repo-wide ESLint/Biome/Prettier layer; match surrounding style.
- Clippy warnings are CI failures.

## Tests

- Prefer behavior/contract tests over implementation-detail tests.
- Use Vitest for unit and focused jsdom component behavior; use Playwright for mocked browser flows and WebDriverIO for the thin native desktop smoke lane.
- Keep Vitest fast and unit-shaped. Prefer pure Node tests for domain helpers, stores, IPC/platform adapters, and wire-contract fixtures. Do not grow Vitest into a browser-flow acceptance suite.
- Vitest component tests must stay focused on one leaf component or small panel with explicit props/context. They should not click through multi-step app workflows, switch workspaces, simulate routing, or assert broad shell behavior.
- Do not import `src/routes/(app)/**` pages from Vitest tests unless the test is an explicit architectural guardrail. Route/page behavior, navigation, responsive shell flows, file-picker flows, map interactions, and cross-workspace handoffs belong in Playwright under `e2e/`.
- Avoid custom test-only `.svelte` route hosts, fake workspace components, and broad context harnesses. If a component needs a special harness, keep it local, minimal, and justify why the behavior cannot be tested through a pure helper/store or Playwright.
- Do not add hidden diagnostic DOM or `data-testid` surfaces only to satisfy Vitest implementation checks. Prefer accessible queries for component tests, pure tests for derived layout/state helpers, and stable `data-testid` selectors for Playwright flows.
- When a Vitest test needs browser APIs, keep the shim small and local to the focused component. If the test needs maplibre/uPlot mocks, viewport controllers, fake routing, repeated `waitFor`/`fireEvent` workflow steps, or jsdom navigation workarounds, it is probably an E2E test and should move to Playwright.
- Do not add source-grep tests against active Svelte or React-era source except for intentional architectural guardrails.
- `src/platform/import-boundary.test.ts` is the quarantine guardrail: active `src/`, `e2e/`, and `e2e-native/` must stay free of React-era source imports, archived test imports, and React-era file re-entry.
- Layer-specific test guidance lives in `src/AGENTS.md`, `src-tauri/src/AGENTS.md`, `e2e/AGENTS.md`, and `e2e-native/AGENTS.md`.
- Keep native desktop coverage intentionally thin and high-value; broad UI coverage still belongs in the mocked Playwright suite.

## Known Quirks

- IPC event names use URI-style strings such as `telemetry://state`, `session://state`, `mission://state`, `param://store`, `param://progress`, `sensor_health://state`, `calibration://state`, `compass://cal_progress`, `compass://cal_report`, `configuration_facts://state`, `status_text://state`, `support://state`, `guided://state`, `playback://state`, `log://progress`, and `firmware://progress`.
- `mav.tlog`, `mav.tlog.raw`, and `mav.parm` at repo root are developer SITL artifacts, not committed fixtures.
- Parameter metadata is fetched at runtime from `autotest.ardupilot.org` via the platform HTTP layer and cached locally.

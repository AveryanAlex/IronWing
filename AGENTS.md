# AGENTS.md

Operational guide for coding agents working in IronWing.
Scope: entire repository.

## Priority Instructions

1. Follow explicit user instructions first.
2. Preserve existing architecture and transport behavior.
3. Keep Rust/TypeScript wire contracts aligned (snake_case strings).
4. Prefer minimal, targeted changes over broad refactors.

## Project Snapshot

- Stack: Tauri v2 shell + React/TypeScript frontend + Rust `mavkit` SDK.
- Core crates:
  - `src-tauri` (IPC shell and platform transport adapters)
  - `crates/tauri-plugin-bluetooth-classic` (Android Classic BT plugin)
- External dependency:
  - `mavkit` (published on crates.io, maintained in a separate repository)
- Main frontend code lives in `src/`.
- Build/test commands run from repo root.

## mavkit Repository Boundary

- `mavkit` is consumed from crates.io in this repository.
- `mavkit` is our crate, and IronWing is currently the primary downstream user.
- It is OK to refactor and change mavkit when needed.
- Agents can ask for mavkit library changes directly when product work requires SDK updates.
- Keep SDK/API changes deliberate and keep Rust/TypeScript wire contracts aligned.
- After mavkit changes are merged and released, bump the `mavkit` crate version in this repo.

## Cursor/Copilot Rules

- Checked locations:
  - `.cursor/rules/`
  - `.cursorrules`
  - `.github/copilot-instructions.md`
- Current status: no Cursor or Copilot rule files found.
- If these files are added later, treat them as authoritative repository rules.

## Build, Check, and Test Commands

### Install and baseline checks

- `npm install`
- `npm run frontend:typecheck` (TypeScript strict check)
- `npm run frontend:build` (typecheck + Vite build)
- `cargo check --workspace` (all Rust crates)
- `cargo test --workspace` (all Rust tests except ignored SITL)

### Common dev commands

- `npm run tauri:dev` (desktop app dev)
- `make dev-sitl` (start SITL bridge + run desktop app)
- `npm run android:dev` (Android dev run)
- `npm run android:build` (Android APK build)

### SITL bridge commands

- `make bridge-up` (start ArduPilot SITL + MAVProxy)
- `make bridge-down` (stop SITL + MAVProxy)

### Running a single test in this repo (important)

- Single Rust unit test by name:
  - `cargo test --workspace <test_name>`
- Single test with exact match:
  - `cargo test --workspace <test_name> -- --exact --nocapture`

## Architecture Constraints to Preserve

- Keep transport flow transport-agnostic via `Vehicle::from_connection()`.
- Maintain wire boundary convention:
  - Mission upload prepends home at seq 0.
  - Mission download extracts seq 0 home and resequences items.
- Keep single-vehicle model in Tauri app state.
- Preserve platform gating:
  - Android: BLE + Classic SPP
  - Desktop: UDP + serial + BLE
- Do not introduce session IDs unless requested and fully propagated.

## TypeScript/React Style Guidelines

### Formatting and syntax

- Use 2-space indentation.
- Use semicolons.
- Use double quotes for strings.
- Keep lines readable; wrap long JSX props over multiple lines.
- Prefer small helper functions for repetitive guard/format logic.

### Imports

- Order imports as: external packages, then internal modules.
- Use type-only imports where applicable (`import type { X } from "..."`).
- Keep import paths relative and consistent with nearby files.
- Avoid unused imports; remove dead symbols immediately.

### Types and contracts

- Prefer explicit `type` aliases for payloads and IPC contracts.
- Keep wire-facing keys snake_case to match Rust serde tags.
- Use discriminated unions for variant payloads (e.g., transport kinds).
- Avoid `any`; if unavoidable, isolate and narrow quickly.
- Respect `tsconfig` strict mode; do not weaken compiler options.

### Naming

- `camelCase` for variables/functions/hooks.
- `PascalCase` for React components and type-like entities.
- `UPPER_SNAKE_CASE` for top-level constants.
- Hook names must start with `use`.

### React patterns

- Prefer functional components and hooks.
- Keep state local unless shared state is required.
- Clean up side effects (`listen` unsubs, animation frames, timers).
- Use refs for mutable event callbacks to avoid stale closures.
- Keep UI state transitions explicit (connected/connecting/error/idle).

### Error handling (frontend)

- Convert unknown errors to user-safe messages.
- Use user feedback (`toast.error`, `toast.success`) for user actions.
- Treat cancellation/cleanup as best-effort where appropriate.
- Fail gracefully for optional capabilities (BLE scan, GPU debug info).

## Rust Style Guidelines

### Formatting and module structure

- Follow standard `rustfmt` style (4-space indent, trailing commas).
- Keep modules focused (`mission`, `params`, `state`, etc.).
- Use `pub use` in `lib.rs` to expose stable public API surfaces.

### Naming and types

- `snake_case` for functions/variables/modules.
- `CamelCase` for structs/enums/traits.
- Use descriptive enum variants for domain errors and states.
- Prefer strong domain types over primitive-only APIs when practical.

### Async and concurrency

- Keep async boundaries explicit (`async fn` for I/O commands).
- Use `tokio::sync` primitives consistently (`Mutex`, `watch`, `mpsc`).
- Ensure spawned tasks terminate cleanly when vehicle/session drops.
- Avoid blocking work inside async tasks.

### Error handling (Rust)

- Use `Result<T, E>` with domain errors inside crates (`VehicleError`).
- At Tauri IPC boundary, map errors to `String` consistently.
- Include actionable context in error messages.
- Use `?` for propagation; avoid `unwrap()` except where invariants are fixed constants.

### Serialization and IPC

- Keep Rust enums using `#[serde(rename_all = "snake_case")]` when shared with TS.
- Do not change IPC event names without updating frontend listeners.
- Keep payload structures backward compatible unless explicitly requested.

## Testing Expectations for Agent Changes

- For Rust-only changes: run `cargo check --workspace` and targeted `cargo test`.
- For frontend-only changes: run `npm run frontend:typecheck` (and build if relevant).
- For cross-layer contract changes: run both Rust and frontend checks.
- For mission transfer/transport changes: run SITL tests when environment is available.

## Commit Message Conventions

- Use Conventional Commit style in subject: `<type>: <short summary>`.
- Common types in this repo: `feat`, `fix`, `refactor`, `docs`, `ci`.
- Keep subject concise and imperative; optional body should explain why/value.
- Preferred commit format:
  - Line 1: `<type>(optional-scope): <short imperative summary>`
  - Line 2: blank
  - Line 3+: body paragraphs explaining motivation/impact (not just file list)
  - Final trailer (when agent-assisted): `Co-Authored-By: Name <email>`
- Wrap body lines for readability (roughly ~72-100 chars).
- Match recent history style: short Conventional subject + 1-2 explanatory body paragraphs.
- Include co-author trailer when work is co-developed with an agent:
  - `Co-Authored-By: Name <email>`
  - Examples:
    - `Co-Authored-By: GPT-5.3 Codex <noreply@openai.com>`
    - `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Match existing trailer capitalization exactly (`Co-Authored-By`).

## Practical Change Guidance

- Prefer additive changes over broad rewrites.
- Reuse existing helpers before introducing new abstractions.
- Keep platform-specific logic behind `cfg` gates.
- Preserve event names, command names, and mission semantics.
- Update docs when behavior or commands change.

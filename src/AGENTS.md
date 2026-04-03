# Frontend (active Svelte runtime + archived React reference)

> Active runtime note (M004/S04): the shipped frontend boots from `src/main.ts` and mounts `src/App.svelte`. The remaining React-era source tree now lives under `src-old/legacy/`; treat it as archived context only.

## Overview

The active frontend surface is the Svelte shell plus the shared TypeScript bridges, stores, and domain helpers it uses. `src/` should describe the shipped runtime; archived React components/hooks no longer live here.

## Formatting

- Run `pnpm run frontend:format` to apply the active frontend Biome baseline.
- Run `pnpm run frontend:format:check` to verify the same scope without writing changes.
- The active formatter baseline is intentionally centered on the shipped Svelte shell, its bootstrap helpers, and nearby tooling files.
- Do not import from `src-old/legacy/` or `src-old/runtime/` into active `src/` code.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| App bootstrap / top-level shell | `main.ts`, `App.svelte`, `app/App.svelte`, `app/shell/*`, `lib/stores/runtime.ts` | Active Svelte mount path, shell composition, bootstrap failure markers |
| Active connection surface | `components/connection/ConnectionPanel.svelte` | Connection form and diagnostics used by the shipped shell |
| Active status + telemetry cards | `components/status/VehicleStatusCard.svelte`, `components/telemetry/TelemetrySummary.svelte` | Compact runtime cards mounted by `AppShell.svelte` |
| Session/store architecture | `lib/stores/session.ts`, `lib/platform/session.ts`, `telemetry.ts`, `session.ts`, `transport.ts` | Shared state, IPC wrappers, transport contracts |
| Runtime stores and notifications | `lib/stores/*`, `lib/toasts.ts`, `lib/components/*` | Store contracts and reusable Svelte-side helpers |
| Platform alias layer | `platform/AGENTS.md` | `@platform/*` imports and mocked-browser split |
| Archived React frontend reference | `../src-old/legacy/README.md` | Legacy hooks/components/tests retained for rewrite context |

## Structure

```text
src/
├── main.ts
├── App.svelte
├── app/
│   ├── App.svelte
│   └── shell/
├── components/
│   ├── connection/
│   ├── status/
│   └── telemetry/
├── lib/
├── data/
├── platform/
├── telemetry.ts / mission.ts / params.ts / logs.ts / recording.ts / firmware.ts
├── sensor-health.ts / statustext.ts / calibration.ts / playback.ts
├── guided.ts / configuration-facts.ts / fence.ts / rally.ts / support.ts / transport.ts
├── session.ts
└── param-metadata.ts
```

## State + IPC Conventions

- Active frontend IPC imports go through `@platform/core`, `@platform/event`, or `@platform/http` only.
- Bridge modules export typed wrapper functions around `invoke()` or `listen()`.
- Event payloads use Rust serde output names (snake_case).
- Shared runtime state belongs in Svelte stores and neutral TypeScript helpers, not revived React hooks.
- Keep the shipped runtime graph reachable from `src/main.ts` on `.svelte` and neutral `.ts` modules only.

## Active Component Patterns

- `app/shell/AppShell.svelte` owns the shipped responsive shell composition.
- `components/connection/`, `components/status/`, and `components/telemetry/` are the only active feature surfaces under `src/components/` today.
- Prefer neutral helpers under `src/lib/` when logic must be shared between multiple active surfaces.
- If you need archived React behavior for reference, read it in `src-old/legacy/` and port the intent instead of importing the old module.

## Data / Lib Conventions

- Keep pure shared contracts in neutral `.ts` modules under `src/lib/` or top-level bridge/domain files.
- `lib/setup-sections.ts` holds the active, framework-neutral setup progress contract that remains relevant after the React archive.
- `data/ardupilot-docs.ts` is the only place to add ArduPilot docs URLs.
- `data/battery-presets.ts` and `data/motor-layouts.ts` are shared reference data, not feature-local constants.

## Tests

- `pnpm test` runs Vitest. Global environment is `node`.
- Use `// @vitest-environment jsdom` only on files that truly need DOM rendering.
- Prefer `@testing-library/svelte` for active UI behavior; keep legacy `@testing-library/react` coverage quarantined under `src-old/legacy/`.
- `src/platform/import-boundary.test.ts` is the intentional quarantine guardrail: active `src/`, `e2e/`, and `e2e-native/` may not import archived React source, archived tests, or reintroduce React-era `.tsx/.jsx` files.

### Active frontend tests

- `src/app/App.test.ts`
- `src/components/connection/ConnectionPanel.test.ts`
- `src/lib/stores/*.test.ts`
- `src/test/contract-fixtures.test.ts`
- `src/test/svelte-harness.test.ts`
- `src/test/svelte-async-harness.test.ts`

## Notes

- `param-metadata.ts` fetches ArduPilot XML through the platform HTTP layer and parses it with `DOMParser`.
- `src-old/legacy/` is intentionally excluded from the active build/test lanes; use it as rewrite context, not a dependency source.
- If you change SITL runtime port math, update `scripts/workflow/runtime.mjs` and its tests.

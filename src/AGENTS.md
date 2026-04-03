# Frontend (Svelte + TypeScript; legacy React still present)

> Cutover note (M004/S01): the shipped frontend now boots from `src/main.ts` and mounts `src/App.svelte`. The old React runtime root moved to `src-old/runtime/`. The legacy hook/component guidance below still describes code that remains in-repo for reference during the rewrite, not the active runtime path.

## Overview

The active frontend boot path is now a minimal Svelte runtime. Bridge files in `src/*.ts` and the `src/platform/*` boundary remain the main non-UI seams to preserve during the rewrite.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| App bootstrap / top-level routing | `main.tsx`, `App.tsx`, `types.ts` | `App.tsx` is the frontend state hub |
| Connection + telemetry | `hooks/use-session.ts`, `telemetry.ts` | Connection form state, BLE scan, vehicle actions |
| Mission editing / playback | `hooks/use-mission.ts`, `components/mission/`, `lib/mission-*` | Draft model + map/shell split |
| Mission feature UI | `components/mission/AGENTS.md` | Desktop/mobile shells, map overlays, coordinate inputs |
| Guided flight actions | `hooks/use-guided.ts`, `guided.ts` | Takeoff, goto, session lifecycle |
| Param staging / metadata | `hooks/use-params.ts`, `components/ConfigPanel.tsx`, `param-metadata.ts` | Staged Map, filter modes, metadata fetch |
| Setup UI | `components/setup/AGENTS.md` | Panel orchestration, shared primitives, section rules |
| Platform alias layer | `platform/AGENTS.md` | `@platform/*` imports and mocked-browser split |

## Structure

```text
src/
├── App.tsx
├── main.tsx
├── types.ts
├── components/
├── hooks/
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

- No Context, Redux, or Zustand. Shared app state is created in hooks and passed down from `App.tsx`.
- Bridge modules import from `@platform/core`, `@platform/event`, or `@platform/http` only.
- Each bridge exports typed wrapper functions around `invoke()` or `listen()`.
- Event payloads use Rust serde output names (snake_case).
- `App.tsx` computes `effectiveVehicle` by overlaying replay telemetry over live telemetry during playback.

## Hooks

| Hook | Purpose | Local pattern |
|------|---------|---------------|
| `useSession` | Connection lifecycle, telemetry, event subscriptions | RAF-coalesced telemetry state; localStorage-backed connection form |
| `useSessionActions` | Vehicle arm/disarm/mode actions | Extracted from useSession for separation of concerns |
| `useGuided` | Guided flight: takeoff, goto, session lifecycle | Client-side validation before IPC; typed command results |
| `useMission` | Mission CRUD, transfer state, home handling | Wraps pure `lib/mission-*` mutations |
| `useParams` | Param store, staging, metadata, file I/O | Staging is local `Map<string, number>`; batch apply only |
| `useSetup` | Setup panel state, section navigation, param highlight | Composes `useSetupSections` + param readiness |
| `useSetupSections` | Section registration, progress heuristics | Lives with setup subsystem, not general hooks |
| `useLogs` | Log open/query/summary/progress | `log://progress` is inline event-driven |
| `useRecording` | TLOG recording UI state | Polls recording status while active |
| `useFirmware` | Firmware session/progress orchestration | Wraps typed firmware IPC contract |
| `usePlayback` | Client-side playback loop | RAF timeline, not backend playback |
| `useSettings` | Persisted UI settings | Uses legacy `mpng_settings` key |
| `useBreakpoint` | Responsive breakpoint state | `isMobile` means `< lg`, not `< md` |
| `useDeviceLocation` | Browser/native geolocation wrapper | Platform-aware fallback logic |

## Component Patterns

- `MissionMap.tsx` is the heavy MapLibre integration point; mission shells wrap it rather than duplicating map logic.
- `components/mission/` splits shared mission content from desktop/mobile shells; map and editor content are reused across both.
- `components/setup/` is its own subsystem. Follow `components/setup/AGENTS.md` and `components/setup/sections/AGENTS.md` before adding a new setup flow.
- `components/ui/` are thin primitives; avoid adding app-specific state there.
- `components/hud/` are pure SVG instruments.
- `components/charts/` use uPlot canvas patterns, not React/SVG chart abstractions.

## Data / Lib Conventions

- `lib/mission-draft-typed.ts` owns in-memory mission editing state; do not re-implement waypoint mutation logic in components.
- `lib/mission-coordinates.ts` owns degE7 conversion and coordinate math.
- `lib/mission-grid.ts` owns auto-grid geometry generation.
- `lib/mission-command-metadata.ts` owns command parameter metadata and labels.
- `data/ardupilot-docs.ts` is the only place to add ArduPilot docs URLs.
- `data/battery-presets.ts` and `data/motor-layouts.ts` are shared reference data, not section-local constants.

## Tests

- `pnpm test` runs Vitest. Global environment is `node`.
- Use `// @vitest-environment jsdom` only on files that truly need DOM rendering.
- Use `@testing-library/react` semantic queries for focused component behavior tests.
- Prefer pure helper extraction first, especially in setup and mission UI.
- Do not add `readFileSync()` + source-text assertions against `.tsx` files.
- `src/platform/import-boundary.test.ts` is the one allowed source-scan exception because it enforces the `@platform/*` boundary.

### Model frontend tests

- `src/lib/mission-draft-typed.test.ts`
- `src/lib/mission-coordinates.test.ts`
- `src/lib/mission-grid.test.ts`
- `src/playback.test.ts`
- `src/param-metadata.test.ts`
- `src/hooks/use-firmware.test.ts`
- `src/hooks/use-guided.test.ts`
- `src/hooks/use-mission.test.ts`
- `src/platform/mock/backend.test.ts`
- `src/test/contract-fixtures.test.ts`
- `src/components/setup/shared/SetupCheckbox.test.tsx`
- `src/components/setup/shared/PreviewStagePanel.test.tsx`

## Notes

- `param-metadata.ts` fetches ArduPilot XML through the platform HTTP layer and parses it with `DOMParser`.
- `RcReceiverSection.tsx` and `RadioCalibWizard.tsx` are intentional exceptions that subscribe to live events directly.
- If you change SITL runtime port math, update `scripts/workflow/runtime.mjs` and its tests.

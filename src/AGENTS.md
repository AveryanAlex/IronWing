# Frontend (React + TypeScript)

## Overview

Frontend app state lives in hooks instantiated by `App.tsx`, then flows down via props. Bridge files in `src/*.ts` wrap IPC and event subscriptions; feature components consume those bridges through hooks, not by talking to Tauri directly.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| App bootstrap / top-level routing | `main.tsx`, `App.tsx`, `types.ts` | `App.tsx` is the frontend state hub |
| Connection + telemetry | `hooks/use-vehicle.ts`, `telemetry.ts` | Connection form state, BLE scan, vehicle actions |
| Mission editing / playback | `hooks/use-mission.ts`, `components/mission/`, `lib/mission-*` | Draft model + map/shell split |
| Param staging / metadata | `hooks/use-params.ts`, `components/ConfigPanel.tsx`, `param-metadata.ts` | Staged Map, filter modes, metadata fetch |
| Setup UI | `components/setup/AGENTS.md` | Panel orchestration, shared primitives, section rules |
| Platform alias layer | `platform/AGENTS.md` | `@platform/*` imports and Remote UI split |
| E2E runtime mirror | `lib/e2e-runtime.ts` | Keep in sync with `scripts/workflow/runtime.mjs` |

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
├── sensor-health.ts / snapshot.ts / statustext.ts / calibration.ts / playback.ts
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
| `useVehicle` | Connection lifecycle, telemetry, control actions | RAF-coalesced telemetry state; localStorage-backed connection form |
| `useMission` | Mission CRUD, transfer state, home handling | Wraps pure `lib/mission-*` mutations |
| `useParams` | Param store, staging, metadata, file I/O | Staging is local `Map<string, number>`; batch apply only |
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

- `lib/mission-draft.ts` owns in-memory mission editing state; do not re-implement waypoint mutation logic in components.
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

- `src/lib/mission-draft.test.ts`
- `src/lib/mission-coordinates.test.ts`
- `src/lib/mission-grid.test.ts`
- `src/playback.test.ts`
- `src/param-metadata.test.ts`
- `src/hooks/use-firmware.test.ts`
- `src/components/setup/shared/SetupCheckbox.test.tsx`
- `src/components/setup/shared/PreviewStagePanel.test.tsx`

## Notes

- `param-metadata.ts` fetches ArduPilot XML through the platform HTTP layer and parses it with `DOMParser`.
- `RcReceiverSection.tsx` and `RadioCalibWizard.tsx` are intentional exceptions that subscribe to live events directly.
- If you change runtime port math, update both `src/lib/e2e-runtime.ts` and `scripts/workflow/runtime.mjs`.

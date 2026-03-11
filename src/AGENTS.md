# Frontend (React + TypeScript)

## Overview

React frontend for IronWing GCS. No state management library — pure hooks + prop drilling from `App.tsx`.

## Structure

```
src/
├── App.tsx              # State hub: 8 hooks, effectiveVehicle overlay, prop drilling
├── main.tsx             # React entry (minimal)
├── app.css              # Global styles (Tailwind v4 @theme)
├── components/
│   ├── hud/             # Pure SVG flight instruments (horizon, tape gauges)
│   ├── setup/           # Calibration wizards (accel, radio)
│   ├── charts/          # uPlot-based log charts + timeline
│   ├── ui/              # Radix + Tailwind primitives (button, dropdown, tooltip, progress)
│   ├── MissionMap.tsx   # MapLibre 3D map (terrain, satellite, waypoints, replay path)
│   ├── Sidebar.tsx      # Desktop: static aside. Mobile: drawer with backdrop
│   ├── ConfigPanel.tsx  # Parameters + Setup tabs (largest component, 697 lines)
│   └── ...              # Mission/Telemetry/Logs panels, TopBar, BottomNav
├── hooks/               # All application state hooks (see below)
├── lib/                 # mav-commands.ts (MAVLink command table), utils.ts
├── mission.ts           # IPC bridge: mission invoke + listen wrappers
├── telemetry.ts         # IPC bridge: connection, vehicle control, BLE scan, events
├── params.ts            # IPC bridge: param download/write/batch/file
├── statustext.ts        # IPC bridge: status message subscription only
├── calibration.ts       # IPC bridge: calibrate_accel, calibrate_gyro
├── logs.ts              # IPC bridge: log open/query/summary/export
├── recording.ts         # IPC bridge: recording start/stop/status
├── playback.ts          # IPC bridge: flight path + telemetry track + interpolation
└── param-metadata.ts    # ArduPilot XML metadata fetch + parse + cache
```

## IPC Bridge Conventions

Each `src/*.ts` bridge file wraps Tauri `invoke()` and `listen()` calls with typed functions.

- **invoke args**: camelCase in TS (`{ customMode }`) → Tauri auto-converts to Rust snake_case (`custom_mode`)
- **Event payloads**: snake_case fields matching Rust serde output
- **Return types**: match Rust `Result<T, String>` — Tauri converts `Err` to rejected promise
- **New events**: use URI-style `scheme://path` (not `dot.notation`) — see root AGENTS.md Known Quirks

### Adding a new IPC command

1. Add `invoke<ReturnType>("command_name", { camelCaseArgs })` wrapper in the relevant bridge file
2. Export the wrapper function
3. Consume in the appropriate hook or component

### Adding a new event subscription

1. Add `listen<PayloadType>("event://name", callback)` wrapper returning `Promise<UnlistenFn>`
2. Subscribe in a `useEffect` hook, return unlisten in cleanup

## Hooks

All instantiated in `App.tsx`, state drilled via props. No Context or global store.

| Hook | Purpose | Key Pattern |
|------|---------|-------------|
| `useVehicle` | Connection lifecycle, telemetry, vehicle control | RAF coalescing: `pendingTelemetry` ref + `requestAnimationFrame` prevents re-renders faster than display rate |
| `useMission` | Mission CRUD, transfer events | Subscribes to `mission://state` + `mission://progress` events |
| `useParams` | Param store, staging, metadata, file I/O | Staging is pure frontend `Map<string, number>` — never writes directly; `applyStaged` calls batch write |
| `useLogs` | Log open/close/query, progress | `log://progress` for parse progress during open |
| `useRecording` | TLOG record start/stop | Polls `recording_status` every 2s while recording |
| `usePlayback` | Client-side RAF playback loop | Binary-search interpolation over telemetry track; `useRef` for mutable state in RAF callback |
| `useSettings` | localStorage persistence | Key is `"mpng_settings"` (legacy name) |
| `useBreakpoint` | `useSyncExternalStore` + `matchMedia` | `isMobile` = `!lg` (< 1024px) |

## Component Patterns

- **HUD** (`components/hud/`): Pure SVG. `ArtificialHorizon` uses `useMemo` for pitch/roll transforms. `TapeGauge` supports optional `terrainValue` prop for altitude tape terrain band.
- **Charts** (`components/charts/`): uPlot (canvas, not SVG). `UPlotChart` wraps with `ResizeObserver`. `Timeline` uses `setSelect` hook for range selection → seek/CSV export.
- **Setup** (`components/setup/`): `AccelCalibWizard` drives 6-position calibration by pattern-matching STATUSTEXT messages. `RadioCalibWizard` subscribes directly to `telemetry://tick` (not via hook) for live RC channel data.
- **Map**: MapLibre GL JS. Tiles: OpenFreeMap (vector), EOX S2 Cloudless (satellite), AWS Terrarium (DEM). Default center: Zurich.
- **Sidebar**: Same `SidebarContent` renders in both desktop `<aside>` and mobile drawer. Transport selector, BT device pickers.
- **BottomNav**: Mobile-only. Uses `var(--safe-area-bottom, 0px)` for notch padding.

## `effectiveVehicle` Pattern

`App.tsx` computes `effectiveVehicle` by overlaying log-replay data over live telemetry during playback. All child components receive `effectiveVehicle` — they don't need to know if data is live or replayed.

## `param-metadata.ts`

Fetches ArduPilot parameter XML from `https://autotest.ardupilot.org/Parameters/{slug}/apm.pdef.xml` using `@tauri-apps/plugin-http` (bypasses CORS). Parses with browser `DOMParser`. Cached in localStorage 7 days. `vehicleTypeToSlug()` maps MAVLink vehicle types → ArduPilot XML slugs (copter variants, plane, rover — no boat/sub/blimp).

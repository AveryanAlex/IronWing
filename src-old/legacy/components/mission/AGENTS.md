# Mission Feature UI (archived React reference)

## Overview

`src-old/legacy/components/mission/` is the archived React-era mission planning slice preserved for rewrite reference. It is no longer part of the active frontend runtime.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Desktop mission layout | `MissionDesktopShell.tsx` | Resizable side panel with item list and inspectors |
| Mobile mission layout | `MissionMobileDrawer.tsx` | Bottom-drawer variant for mobile breakpoint |
| Full workspace (map + shell) | `MissionWorkspace.tsx` | Composes `MissionMap`, desktop shell, context menu, auto-grid dialog |
| Workspace toolbar | `MissionWorkspaceHeader.tsx` | Upload/download actions, file I/O, clear |
| Waypoint list / cards | `MissionItemList.tsx`, `MissionItemCard.tsx` | Drag-reorder, selection, home card |
| Home card | `MissionHomeCard.tsx` | Home position display with coordinate editing |
| Item inspector | `MissionInspector.tsx` | Per-waypoint command parameters and coordinate editing |
| Fence inspector + overlay | `FenceInspector.tsx`, `FenceMapOverlay.ts` | GeoFence regions: polygon, circle, inclusion/exclusion |
| Rally inspector + overlay | `RallyInspector.tsx`, `RallyMapOverlay.ts` | Rally point management and map rendering |
| Command picker | `CommandPicker.tsx` | MAVLink command selection with search and metadata |
| Transfer status | `MissionTransferStatus.tsx` | Upload/download progress indicator |
| Planner summary | `MissionPlannerSummary.tsx` | Mission distance and time estimates |
| Coordinate inputs | `coordinate-inputs.tsx` | Lat/lon/alt input primitives for inspectors |
| Local helpers | `mission-helpers.ts` | Nearest-waypoint search and UI utilities |

## Patterns

- **Shell split**: `MissionDesktopShell` and `MissionMobileDrawer` are layout wrappers. Shared content (item list, inspectors, summary) is imported into both.
- **Map overlays**: `FenceMapOverlay.ts` and `RallyMapOverlay.ts` are imperative MapLibre integration files (not React components). They manage GeoJSON sources and layers directly.
- **Hook consumption**: Archived mission components receive `ReturnType<typeof useMission>` as a prop. They do not call `useMission` themselves. Same pattern applies for archived `useSession` and `useDeviceLocation` hooks under `src-old/legacy/hooks/`.
- **Draft mutations**: Mission editing logic lives in the active neutral helpers under `src/lib/mission-draft-typed.ts`.
- **Coordinate math**: Use `src/lib/mission-coordinates.ts` for degE7 conversions. `MissionItem.x` / `.y` are always degE7 integers.

## Rules

- Do not treat this directory as active product code; port behavior into Svelte instead of importing from here.
- Archived mission editing state belongs in `src-old/legacy/hooks/use-mission.ts`; shared neutral helpers stay in `src/lib/mission-draft-typed.ts`.
- Do not import Tauri APIs directly; mission IPC still goes through the bridge modules when behavior is ported forward.
- Map overlays are plain TypeScript managing MapLibre imperatively. Keep them free of framework-specific transport concerns.

## Tests

- `CommandPicker.test.tsx` — command search and selection behavior
- `FenceMapOverlay.test.ts` — GeoJSON polygon/circle geometry generation
- `MissionHomeCard.test.tsx` — home position display and editing
- `MissionTransferStatus.test.tsx` — transfer progress rendering states

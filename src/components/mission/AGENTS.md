# Mission Feature UI

## Overview

`components/mission/` is a feature-scoped vertical slice for mission planning, editing, and transfer. It splits shared mission content from desktop/mobile layout shells. Map overlays and editor panels are reused across both shells.

## Where To Look

| Task | Location | Notes |
|------|----------|-------|
| Desktop mission layout | `MissionDesktopShell.tsx` | Resizable side panel with item list, inspectors |
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
| Auto-grid dialog | `MissionAutoGridDialog.tsx` | Survey grid generation UI |
| Planner summary | `MissionPlannerSummary.tsx` | Mission distance, time estimates |
| Coordinate inputs | `coordinate-inputs.tsx` | Lat/lon/alt input primitives for inspectors |
| Local helpers | `mission-helpers.ts` | Nearest-waypoint search and UI utilities |

## Patterns

- **Shell split**: `MissionDesktopShell` and `MissionMobileDrawer` are layout wrappers. Shared content (item list, inspectors, summary) is imported into both. Do not duplicate mission logic per shell.
- **Map overlays**: `FenceMapOverlay.ts` and `RallyMapOverlay.ts` are imperative MapLibre integration files (not React components). They manage GeoJSON sources and layers directly. Follow the same source/layer ID constant pattern when adding new overlays.
- **Hook consumption**: Mission components receive `ReturnType<typeof useMission>` as a prop. They do not call `useMission` themselves. Same pattern applies for `useSession` and `useDeviceLocation`.
- **Draft mutations**: All waypoint editing logic lives in `lib/mission-draft-typed.ts`. Components call draft mutation functions, not implement their own.
- **Coordinate math**: Use `lib/mission-coordinates.ts` for degE7 conversions. `MissionItem.x`/`.y` are always degE7 integers.

## Rules

- Do not add mission editing state to this directory; it belongs in `hooks/use-mission.ts` and `lib/mission-draft-typed.ts`.
- Do not import Tauri APIs directly; mission IPC goes through `mission.ts` bridge.
- Map overlays are plain TypeScript managing MapLibre imperatively. Keep them free of React hooks and lifecycle.

## Tests

- `CommandPicker.test.tsx` — command search and selection behavior
- `FenceMapOverlay.test.ts` — GeoJSON polygon/circle geometry generation
- `MissionHomeCard.test.tsx` — home position display and editing
- `MissionTransferStatus.test.tsx` — transfer progress rendering states

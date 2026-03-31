// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionMobileDrawer } from "./MissionMobileDrawer";

const { terrainHookMock, terrainProfilePropsMock } = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
}));

vi.mock("../../hooks/use-mission-terrain", () => ({
  useMissionTerrain: (...args: unknown[]) => terrainHookMock(...args),
}));

vi.mock("./MissionTerrainProfile", () => ({
  MissionTerrainProfile: (props: { status: string; height?: number }) => {
    terrainProfilePropsMock(props);
    return (
      <div
        data-testid="mission-terrain-profile"
        data-status={props.status}
        data-height={props.height ?? 120}
      />
    );
  },
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../MissionMap", () => ({
  MissionMap: ({ onBlankMapClick }: { onBlankMapClick?: (lat: number, lng: number) => void }) => (
    <button data-testid="mission-map-blank-click" onClick={() => onBlankMapClick?.(47.5, 8.6)}>
      Blank map
    </button>
  ),
}));

vi.mock("../MapContextMenu", () => ({ MapContextMenu: () => null }));
vi.mock("./MissionPlannerSummary", () => ({ MissionPlannerSummary: () => <div>Summary</div> }));
vi.mock("./MissionItemList", () => ({ MissionItemList: () => <div>Items</div> }));
vi.mock("./MissionInspector", () => ({ MissionInspector: () => <div>Inspector</div> }));
vi.mock("./FenceInspector", () => ({ FenceInspector: () => <div>Fence inspector</div> }));
vi.mock("./RallyInspector", () => ({ RallyInspector: () => <div>Rally inspector</div> }));
vi.mock("./BulkEditPanel", () => ({ BulkEditPanel: () => <div>Bulk edit</div> }));
vi.mock("./MissionAutoGridDialog", () => ({
  MissionAutoGridDialog: ({ children }: { children?: ReactNode }) => <div data-testid="mission-auto-grid-dialog">{children}</div>,
}));

function createMission(tab: "mission" | "fence" | "rally" = "mission", addWaypointAt = vi.fn()) {
  const current = {
    tab,
    draftItems: [],
    homePosition: null,
    selectedIndex: null,
    selectedItem: null,
    previousItem: null,
    selectedCount: 0,
    displayTotal: 0,
    readOnly: false,
    transferUi: { active: false },
    operation: { active: false },
    isDirty: false,
    recoverableAvailable: false,
    canUndo: false,
    undoCount: 0,
    canRedo: false,
    redoCount: 0,
    issues: [],
    recoverDraft: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    addWaypoint: vi.fn(),
    addWaypointAt,
    insertBefore: vi.fn(),
    insertAfter: vi.fn(),
    deleteAt: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    validate: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    clear: vi.fn(),
    setHomeFromMap: vi.fn(),
    updateHomeFromVehicle: vi.fn(),
    select: vi.fn(),
    moveWaypointOnMap: vi.fn(),
    updateAltitude: vi.fn(),
    updateCoordinate: vi.fn(),
  };

  return {
    tabs: [
      { id: "mission", label: "Mission" },
      { id: "fence", label: "Fence" },
      { id: "rally", label: "Rally" },
    ],
    selectedTab: tab,
    selectTab: vi.fn(),
    current,
    vehicle: { missionState: { current_index: null } },
    mission: {
      setCurrent: vi.fn(),
      updateCommand: vi.fn(),
      setWaypointFromVehicle: vi.fn(),
      insertGeneratedAfter: vi.fn(),
      replaceAll: vi.fn(),
      selectedIndex: null,
      displayTotal: 0,
    },
    fence: {
      updateRegion: vi.fn(),
    },
    rally: {
      updateAltitudeFrame: vi.fn(),
    },
  };
}

describe("MissionMobileDrawer", () => {
  beforeEach(() => {
    terrainHookMock.mockReset();
    terrainProfilePropsMock.mockReset();
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: new Map() },
      warningsByIndex: new Map(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("wires chain mode blank-map clicks to mission.addWaypointAt on mobile", () => {
    const addWaypointAt = vi.fn();
    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);
    fireEvent.click(screen.getByTestId("mission-map-blank-click"));

    expect(chainButton.getAttribute("aria-pressed")).toBe("true");
    expect(addWaypointAt).toHaveBeenCalledWith(47.5, 8.6);
  });

  it("shows the compact terrain profile only for the mission tab", () => {
    const missionTab = createMission("mission");
    const { rerender } = render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={missionTab as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    expect(terrainHookMock).toHaveBeenCalledWith(
      missionTab.current.draftItems,
      missionTab.current.homePosition,
      "mission",
    );
    expect(screen.getByTestId("mission-terrain-profile").getAttribute("data-height")).toBe("80");

    const props = terrainProfilePropsMock.mock.calls[terrainProfilePropsMock.mock.calls.length - 1]?.[0] as {
      onSelectIndex?: (index: number | null) => void;
    };
    expect(props.onSelectIndex).toBe(missionTab.current.select);

    rerender(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("fence") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    expect(screen.queryByTestId("mission-terrain-profile")).toBeNull();
    expect(terrainHookMock.mock.calls[terrainHookMock.mock.calls.length - 1]?.[2]).toBe("fence");
  });
});

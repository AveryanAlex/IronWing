// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionMobileDrawer } from "./MissionMobileDrawer";

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

function createMission(addWaypointAt = vi.fn()) {
  const current = {
    tab: "mission" as const,
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
    selectedTab: "mission" as const,
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
  afterEach(() => {
    cleanup();
  });

  it("wires chain mode blank-map clicks to mission.addWaypointAt on mobile", () => {
    const addWaypointAt = vi.fn();
    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission(addWaypointAt) as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);
    fireEvent.click(screen.getByTestId("mission-map-blank-click"));

    expect(chainButton.getAttribute("aria-pressed")).toBe("true");
    expect(addWaypointAt).toHaveBeenCalledWith(47.5, 8.6);
  });
});

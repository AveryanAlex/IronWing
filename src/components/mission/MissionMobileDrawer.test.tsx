// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionMobileDrawer } from "./MissionMobileDrawer";

const { terrainHookMock, surveyHookMock, terrainProfilePropsMock, itemListPropsMock } = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  surveyHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
  itemListPropsMock: vi.fn(),
}));

vi.mock("../../hooks/use-mission-terrain", () => ({
  useMissionTerrain: (...args: unknown[]) => terrainHookMock(...args),
}));

vi.mock("../../hooks/use-survey-planner", () => ({
  useSurveyPlanner: (...args: unknown[]) => surveyHookMock(...args),
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

vi.mock("./SurveyPlannerPanel", () => ({
  SurveyPlannerPanel: () => <div data-testid="survey-planner-panel">Survey Planner</div>,
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../MissionMap", () => ({
  MissionMap: ({ onBlankMapClick, isDrawingPolygon }: { onBlankMapClick?: (lat: number, lng: number) => void; isDrawingPolygon?: boolean }) => (
    <div>
      <button data-testid="mission-map-blank-click" onClick={() => onBlankMapClick?.(47.5, 8.6)}>
        Blank map
      </button>
      <span data-testid="mission-map-drawing-state">{isDrawingPolygon ? "drawing" : "idle"}</span>
    </div>
  ),
}));

vi.mock("../MapContextMenu", () => ({ MapContextMenu: () => null }));
vi.mock("./MissionPlannerSummary", () => ({ MissionPlannerSummary: () => <div>Summary</div> }));
vi.mock("./MissionItemList", () => ({
  MissionItemList: (props: Record<string, unknown>) => {
    itemListPropsMock(props);
    return <div>Items</div>;
  },
}));
vi.mock("./MissionInspector", () => ({ MissionInspector: () => <div>Inspector</div> }));
vi.mock("./FenceInspector", () => ({ FenceInspector: () => <div>Fence inspector</div> }));
vi.mock("./RallyInspector", () => ({ RallyInspector: () => <div>Rally inspector</div> }));
vi.mock("./BulkEditPanel", () => ({ BulkEditPanel: () => <div>Bulk edit</div> }));

function createSurveyPlanner(overrides: Record<string, unknown> = {}) {
  return {
    surveyMode: false,
    activeRegionId: null,
    regions: { surveyRegions: new Map(), surveyRegionOrder: [] },
    isDrawing: false,
    drawingVertices: [],
    selectedCamera: null,
    params: {
      sideOverlap_pct: 70,
      frontOverlap_pct: 80,
      altitude_m: 50,
      trackAngle_deg: 0,
      orientation: "landscape",
      crosshatch: false,
      turnaroundDistance_m: 0,
      terrainFollow: false,
      captureMode: "distance",
      startCorner: "bottom_left",
      turnDirection: "clockwise",
    },
    isGenerating: false,
    showCustomCameraForm: false,
    canGenerate: false,
    activeRegion: null,
    allRegions: [],
    estimatedWaypointCount: null,
    formattedStats: null,
    activeRegionFlightTime_s: null,
    activeRegionHasManualEdits: false,
    enterSurveyMode: vi.fn(),
    exitSurveyMode: vi.fn(),
    createRegion: vi.fn(),
    selectRegion: vi.fn(),
    deleteRegion: vi.fn(),
    dissolveRegion: vi.fn(() => []),
    startDraw: vi.fn(),
    stopDraw: vi.fn(),
    addVertex: vi.fn(),
    completePolygon: vi.fn(() => null),
    moveVertex: vi.fn(),
    setCamera: vi.fn(),
    setParam: vi.fn(),
    generate: vi.fn(async () => null),
    openCustomCameraForm: vi.fn(),
    closeCustomCameraForm: vi.fn(),
    saveCustomCamera: vi.fn(),
    ...overrides,
  };
}

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
    clearLocal: vi.fn(),
    setHomeFromMap: vi.fn(),
    updateHomeFromVehicle: vi.fn(),
    select: vi.fn(),
    moveWaypointOnMap: vi.fn(),
    updateAltitude: vi.fn(),
    updateCoordinate: vi.fn(),
  };

  const inactiveTransferUi = {
    active: false,
    hasProgress: false,
    progressPct: 0,
    direction: null,
    completedItems: 0,
    totalItems: 0,
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
    importPlanFile: vi.fn(),
    importKmlFile: vi.fn(),
    exportPlanFile: vi.fn(),
    mission: {
      setCurrent: vi.fn(),
      updateCommand: vi.fn(),
      setWaypointFromVehicle: vi.fn(),
      insertGeneratedAfter: vi.fn(),
      replaceAll: vi.fn(),
      selectedIndex: null,
      displayTotal: 0,
      homePosition: null,
      importedSpeeds: null,
      transferUi: inactiveTransferUi,
    },
    fence: {
      updateRegion: vi.fn(),
      returnPoint: null,
      transferUi: inactiveTransferUi,
    },
    rally: {
      updateAltitudeFrame: vi.fn(),
      transferUi: inactiveTransferUi,
    },
  };
}

describe("MissionMobileDrawer", () => {
  beforeEach(() => {
    terrainHookMock.mockReset();
    surveyHookMock.mockReset();
    terrainProfilePropsMock.mockReset();
    itemListPropsMock.mockReset();
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: new Map() },
      warningsByIndex: new Map(),
    });
    surveyHookMock.mockReturnValue(createSurveyPlanner());
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes drawer open and close state through the mobile controls", () => {
    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const toggle = document.querySelector("[data-mission-mobile-panel-toggle]") as HTMLButtonElement | null;
    const drawer = document.querySelector("[data-mission-mobile-drawer]") as HTMLElement | null;
    const closeButton = document.querySelector("[data-mission-mobile-drawer-close]") as HTMLButtonElement | null;

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.getAttribute("data-state")).toBe("closed");
    expect(drawer?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(toggle as HTMLButtonElement);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.getAttribute("data-state")).toBe("open");
    expect(drawer?.getAttribute("aria-hidden")).toBe("false");

    fireEvent.click(closeButton as HTMLButtonElement);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.getAttribute("data-state")).toBe("closed");
    expect(drawer?.getAttribute("aria-hidden")).toBe("true");
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

  it("switches the drawer content to the survey planner and opens it from the survey toggle", () => {
    const planner = createSurveyPlanner({ surveyMode: true });
    surveyHookMock.mockReturnValue(planner);

    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const drawer = document.querySelector("[data-mission-mobile-drawer]") as HTMLElement | null;
    expect(drawer?.getAttribute("data-state")).toBe("open");
    expect(drawer?.getAttribute("data-survey-mode")).toBe("open");
    expect(screen.getByTestId("survey-planner-panel")).toBeTruthy();

    fireEvent.click(document.querySelector("[data-survey-mode-toggle]") as HTMLButtonElement);
    expect(planner.enterSurveyMode).toHaveBeenCalledTimes(1);
  });

  it("suppresses chain mode while survey polygon drawing is active", () => {
    const addWaypointAt = vi.fn();
    surveyHookMock.mockReturnValue(createSurveyPlanner({ isDrawing: true, drawingVertices: [{ latitude_deg: 47.5, longitude_deg: 8.6 }] }));

    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);

    expect(screen.getByTestId("mission-map-drawing-state").textContent).toBe("drawing");
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).not.toHaveBeenCalled();
  });

  it("shows the compact terrain profile only for the mission tab and forwards waypoint warnings into the mobile item list", () => {
    const missionTab = createMission("mission");
    const terrainWarnings = new Map([[1, "near_terrain"]]);
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: terrainWarnings },
      warningsByIndex: terrainWarnings,
    });
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
      10,
    );
    expect(screen.getByTestId("mission-terrain-profile").getAttribute("data-height")).toBe("80");

    const props = terrainProfilePropsMock.mock.calls[terrainProfilePropsMock.mock.calls.length - 1]?.[0] as {
      onSelectIndex?: (index: number | null) => void;
    };
    expect(props.onSelectIndex).toBe(missionTab.current.select);

    fireEvent.click(document.querySelector("[data-mission-mobile-panel-toggle]") as HTMLButtonElement);
    const itemListProps = itemListPropsMock.mock.calls[itemListPropsMock.mock.calls.length - 1]?.[0] as {
      terrainWarnings?: Map<number, string>;
    };
    expect(itemListProps.terrainWarnings).toBe(terrainWarnings);

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

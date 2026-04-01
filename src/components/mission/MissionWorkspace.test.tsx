// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionWorkspace } from "./MissionWorkspace";

const {
  terrainHookMock,
  surveyHookMock,
  terrainProfilePropsMock,
  desktopShellPropsMock,
} = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  surveyHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
  desktopShellPropsMock: vi.fn(),
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

vi.mock("react-resizable-panels", () => ({
  Group: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="panel-group" className={className}>{children}</div>
  ),
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("../MissionMap", () => ({
  MissionMap: ({ onBlankMapClick, isDrawingPolygon }: { onBlankMapClick?: (lat: number, lng: number, modifiers?: { altKey: boolean }) => void; isDrawingPolygon?: boolean }) => (
    <div>
      <button data-testid="mission-map-blank-click" onClick={() => onBlankMapClick?.(47.41, 8.56)}>
        Blank map
      </button>
      <button data-testid="mission-map-alt-click" onClick={() => onBlankMapClick?.(47.41, 8.56, { altKey: true })}>
        Alt blank map
      </button>
      <span data-testid="mission-map-drawing-state">{isDrawingPolygon ? "drawing" : "idle"}</span>
    </div>
  ),
}));

vi.mock("../MapContextMenu", () => ({ MapContextMenu: () => null }));
vi.mock("./MissionDesktopShell", () => ({
  MissionDesktopShell: (props: Record<string, unknown>) => {
    desktopShellPropsMock(props);
    return <div>Desktop shell</div>;
  },
}));

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
    selectedUiIds: new Set<number>(),
    selectedCount: 0,
    readOnly: false,
    transferUi: { active: false },
    operation: { active: false },
    isDirty: false,
    recoverableAvailable: false,
    canUndo: false,
    undoCount: 0,
    canRedo: false,
    redoCount: 0,
    displayTotal: 0,
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
    toggleSelect: vi.fn(),
    moveWaypointOnMap: vi.fn(),
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
    selectedTabLabel: tab,
    current,
    selectedTabId: tab,
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
      addRegionAt: vi.fn(),
      setReturnPoint: vi.fn(),
      returnPoint: null,
      updateRegion: vi.fn(),
      transferUi: inactiveTransferUi,
    },
    rally: {
      updateAltitudeFrame: vi.fn(),
      transferUi: inactiveTransferUi,
    },
  };
}

describe("MissionWorkspace", () => {
  beforeEach(() => {
    terrainHookMock.mockReset();
    surveyHookMock.mockReset();
    terrainProfilePropsMock.mockReset();
    desktopShellPropsMock.mockReset();
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

  it("keeps chain mode active across blank-map waypoint additions and clears it when leaving the mission tab", () => {
    const addWaypointAt = vi.fn();
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const { rerender } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).toHaveBeenCalledWith(47.41, 8.56);
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    rerender(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("fence", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(screen.getByTestId("mission-chain-mode").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).toHaveBeenCalledTimes(1);
  });

  it("suppresses chain mode while survey polygon drawing is active without deactivating the toggle", () => {
    const addWaypointAt = vi.fn();
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const drawingPlanner = createSurveyPlanner({ isDrawing: true, drawingVertices: [{ latitude_deg: 47.4, longitude_deg: 8.5 }] });
    surveyHookMock.mockReturnValueOnce(createSurveyPlanner()).mockReturnValue(drawingPlanner);

    const { rerender } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-chain-mode"));

    rerender(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(screen.getByTestId("mission-map-drawing-state").textContent).toBe("drawing");
    expect(screen.getByTestId("mission-chain-mode").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).not.toHaveBeenCalled();
  });

  it("exits chain mode when Escape is pressed", () => {
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission") as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    const chainButton = screen.getByTestId("mission-chain-mode");
    fireEvent.click(chainButton);
    expect(chainButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(chainButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("adds a waypoint on Alt+click even when chain mode is off", () => {
    const addWaypointAt = vi.fn();
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission", addWaypointAt) as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    fireEvent.click(screen.getByTestId("mission-map-blank-click"));
    expect(addWaypointAt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("mission-map-alt-click"));
    expect(addWaypointAt).toHaveBeenCalledWith(47.41, 8.56);
  });

  it("forwards survey mode and panel props to the desktop shell and wires the survey toggle", () => {
    const planner = createSurveyPlanner({ surveyMode: true });
    surveyHookMock.mockReturnValue(planner);
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };

    render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("mission") as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    const desktopShellProps = desktopShellPropsMock.mock.calls[desktopShellPropsMock.mock.calls.length - 1]?.[0] as {
      surveyMode?: boolean;
      surveyPanel?: ReactNode;
    };
    expect(desktopShellProps.surveyMode).toBe(true);
    expect(desktopShellProps.surveyPanel).toBeTruthy();

    fireEvent.click(document.querySelector("[data-survey-mode-toggle]") as HTMLButtonElement);
    expect(planner.enterSurveyMode).toHaveBeenCalledTimes(1);
  });

  it("shows the terrain profile only for the mission tab, wires the terrain hook into it, and forwards waypoint warnings to the desktop shell", () => {
    const vehicle = { connected: true, vehiclePosition: null, missionState: { current_index: null } };
    const deviceLocation = { location: null };
    const missionTab = createMission("mission");
    const terrainWarnings = new Map([[2, "below_terrain"]]);
    terrainHookMock.mockReturnValue({
      status: "ready",
      profile: { points: [], warningsByIndex: terrainWarnings },
      warningsByIndex: terrainWarnings,
    });
    const { rerender } = render(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={missionTab as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(terrainHookMock).toHaveBeenCalledWith(
      missionTab.current.draftItems,
      missionTab.current.homePosition,
      "mission",
      10,
      0,
    );
    expect(screen.getByTestId("mission-terrain-profile").getAttribute("data-height")).toBe("120");

    const props = terrainProfilePropsMock.mock.calls[terrainProfilePropsMock.mock.calls.length - 1]?.[0] as {
      selectedIndex: number | null;
      onSelectIndex?: (index: number | null) => void;
    };
    expect(props.selectedIndex).toBeNull();
    expect(props.onSelectIndex).toBe(missionTab.current.select);

    const desktopShellProps = desktopShellPropsMock.mock.calls[desktopShellPropsMock.mock.calls.length - 1]?.[0] as {
      terrainWarnings?: Map<number, string>;
    };
    expect(desktopShellProps.terrainWarnings).toBe(terrainWarnings);

    rerender(
      <MissionWorkspace
        vehicle={vehicle as never}
        mission={createMission("fence") as never}
        deviceLocation={deviceLocation as never}
      />,
    );

    expect(screen.queryByTestId("mission-terrain-profile")).toBeNull();
    expect(terrainHookMock.mock.calls[terrainHookMock.mock.calls.length - 1]?.[2]).toBe("fence");
  });
});

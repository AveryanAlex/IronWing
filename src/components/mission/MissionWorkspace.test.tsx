// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionWorkspace } from "./MissionWorkspace";
import { createCorridorRegion, createStructureRegion } from "../../lib/survey-region";

const {
  terrainHookMock,
  surveyHookMock,
  terrainProfilePropsMock,
  desktopShellPropsMock,
  missionMapPropsMock,
} = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  surveyHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
  desktopShellPropsMock: vi.fn(),
  missionMapPropsMock: vi.fn(),
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
  MissionMap: (props: {
    onBlankMapClick?: (lat: number, lng: number, modifiers?: { altKey: boolean }) => void;
    isDrawingPolygon?: boolean;
    drawingMode?: "polygon" | "polyline";
    corridorPreview?: Array<{ latitude_deg: number; longitude_deg: number }>;
    surveyOverlay?: Record<string, unknown> | null;
  }) => {
    missionMapPropsMock(props);
    return (
      <div>
        <button data-testid="mission-map-blank-click" onClick={() => props.onBlankMapClick?.(47.41, 8.56)}>
          Blank map
        </button>
        <button data-testid="mission-map-alt-click" onClick={() => props.onBlankMapClick?.(47.41, 8.56, { altKey: true })}>
          Alt blank map
        </button>
        <span data-testid="mission-map-drawing-state">{props.isDrawingPolygon ? "drawing" : "idle"}</span>
      </div>
    );
  },
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
    patternType: "grid",
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
      leftWidth_m: 0,
      rightWidth_m: 0,
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
    completeLine: vi.fn(() => null),
    moveVertex: vi.fn(),
    setPatternType: vi.fn(),
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
    missionMapPropsMock.mockReset();
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

  it("passes polyline drawing mode and a live corridor preview to the map while drawing a corridor", () => {
    const planner = createSurveyPlanner({
      patternType: "corridor",
      isDrawing: true,
      drawingVertices: [
        { latitude_deg: 47.397742, longitude_deg: 8.545594 },
        { latitude_deg: 47.397142, longitude_deg: 8.546394 },
      ],
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
        leftWidth_m: 45,
        rightWidth_m: 55,
      },
    });
    surveyHookMock.mockReturnValue(planner);

    render(
      <MissionWorkspace
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const missionMapProps = missionMapPropsMock.mock.calls[missionMapPropsMock.mock.calls.length - 1]?.[0] as {
      drawingMode?: string;
      corridorPreview?: Array<{ latitude_deg: number; longitude_deg: number }>;
    };
    expect(missionMapProps.drawingMode).toBe("polyline");
    expect(missionMapProps.corridorPreview?.length).toBeGreaterThanOrEqual(4);
  });

  it("publishes corridor overlay data with pattern type, centerline, and corridor polygon", () => {
    const region = createCorridorRegion([
      { latitude_deg: 47.397742, longitude_deg: 8.545594 },
      { latitude_deg: 47.397142, longitude_deg: 8.546394 },
      { latitude_deg: 47.396642, longitude_deg: 8.547194 },
    ]);
    region.corridorPolygon = [
      { latitude_deg: 47.3978, longitude_deg: 8.5454 },
      { latitude_deg: 47.3980, longitude_deg: 8.5458 },
      { latitude_deg: 47.3968, longitude_deg: 8.5473 },
      { latitude_deg: 47.3965, longitude_deg: 8.5469 },
      { latitude_deg: 47.3978, longitude_deg: 8.5454 },
    ];
    region.generatedTransects = [[
      { latitude_deg: 47.3976, longitude_deg: 8.5458 },
      { latitude_deg: 47.3969, longitude_deg: 8.5467 },
    ]];
    region.generatedStats = {
      gsd_m: 0.023,
      photoCount: 96,
      area_m2: 12_500,
      triggerDistance_m: 18,
      laneSpacing_m: 24,
      laneCount: 6,
      crosshatchLaneCount: 0,
    };
    surveyHookMock.mockReturnValue(createSurveyPlanner({
      patternType: "corridor",
      activeRegion: region,
      activeRegionId: region.id,
      allRegions: [region],
    }));

    render(
      <MissionWorkspace
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const missionMapProps = missionMapPropsMock.mock.calls[missionMapPropsMock.mock.calls.length - 1]?.[0] as {
      surveyOverlay?: {
        patternType?: string;
        centerline?: Array<{ latitude_deg: number; longitude_deg: number }>;
        corridorPolygon?: Array<{ latitude_deg: number; longitude_deg: number }>;
      } | null;
    };
    expect(missionMapProps.surveyOverlay?.patternType).toBe("corridor");
    expect(missionMapProps.surveyOverlay?.centerline).toEqual(region.polyline);
    expect(missionMapProps.surveyOverlay?.corridorPolygon).toEqual(region.corridorPolygon);
  });

  it("publishes structure overlay data with orbit rings and altitude labels", () => {
    const region = createStructureRegion([
      { latitude_deg: 47.397742, longitude_deg: 8.545594 },
      { latitude_deg: 47.397742, longitude_deg: 8.547194 },
      { latitude_deg: 47.396642, longitude_deg: 8.547194 },
      { latitude_deg: 47.396642, longitude_deg: 8.545594 },
    ]);
    region.generatedLayers = [
      {
        altitude_m: 56,
        gimbalPitch_deg: -10,
        orbitPoints: [
          { latitude_deg: 47.3979, longitude_deg: 8.5455 },
          { latitude_deg: 47.3980, longitude_deg: 8.5471 },
          { latitude_deg: 47.3965, longitude_deg: 8.5472 },
          { latitude_deg: 47.3964, longitude_deg: 8.5456 },
          { latitude_deg: 47.3979, longitude_deg: 8.5455 },
        ],
        photoCount: 4,
      },
      {
        altitude_m: 62,
        gimbalPitch_deg: 0,
        orbitPoints: [
          { latitude_deg: 47.39795, longitude_deg: 8.54545 },
          { latitude_deg: 47.39805, longitude_deg: 8.54715 },
          { latitude_deg: 47.39645, longitude_deg: 8.54725 },
          { latitude_deg: 47.39635, longitude_deg: 8.54565 },
          { latitude_deg: 47.39795, longitude_deg: 8.54545 },
        ],
        photoCount: 4,
      },
    ];
    region.generatedStats = {
      gsd_m: 0.015,
      photoCount: 8,
      layerCount: 2,
      photosPerLayer: 4,
      layerSpacing_m: 6,
      triggerDistance_m: 10,
      estimatedFlightTime_s: 84,
    };
    surveyHookMock.mockReturnValue(createSurveyPlanner({
      patternType: "structure",
      activeRegion: region,
      activeRegionId: region.id,
      allRegions: [region],
    }));

    render(
      <MissionWorkspace
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={createMission("mission") as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    const missionMapProps = missionMapPropsMock.mock.calls[missionMapPropsMock.mock.calls.length - 1]?.[0] as {
      surveyOverlay?: {
        patternType?: string;
        transects?: Array<Array<{ latitude_deg: number; longitude_deg: number }>>;
        orbitRings?: Array<Array<{ latitude_deg: number; longitude_deg: number }>>;
        orbitLabels?: Array<{ point: { latitude_deg: number; longitude_deg: number }; altitude_m: number }>;
        layerSpacing_m?: number;
      } | null;
    };
    expect(missionMapProps.surveyOverlay?.patternType).toBe("structure");
    expect(missionMapProps.surveyOverlay?.transects).toEqual(region.generatedLayers.map((layer) => layer.orbitPoints));
    expect(missionMapProps.surveyOverlay?.orbitRings).toEqual(region.generatedLayers.map((layer) => layer.orbitPoints));
    expect(missionMapProps.surveyOverlay?.orbitLabels).toEqual([
      { point: region.generatedLayers[0]!.orbitPoints[0]!, altitude_m: 56 },
      { point: region.generatedLayers[1]!.orbitPoints[0]!, altitude_m: 62 },
    ]);
    expect(missionMapProps.surveyOverlay?.layerSpacing_m).toBe(6);
  });
});

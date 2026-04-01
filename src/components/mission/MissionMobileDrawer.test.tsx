// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionMobileDrawer } from "./MissionMobileDrawer";
import { createCorridorRegion, createStructureRegion } from "../../lib/survey-region";

const { terrainHookMock, surveyHookMock, terrainProfilePropsMock, itemListPropsMock, missionMapPropsMock } = vi.hoisted(() => ({
  terrainHookMock: vi.fn(),
  surveyHookMock: vi.fn(),
  terrainProfilePropsMock: vi.fn(),
  itemListPropsMock: vi.fn(),
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

vi.mock("../MissionMap", () => ({
  MissionMap: (props: {
    onBlankMapClick?: (lat: number, lng: number) => void;
    isDrawingPolygon?: boolean;
    drawingMode?: "polygon" | "polyline";
    corridorPreview?: Array<{ latitude_deg: number; longitude_deg: number }>;
    surveyOverlay?: Record<string, unknown> | null;
  }) => {
    missionMapPropsMock(props);
    return (
      <div>
        <button data-testid="mission-map-blank-click" onClick={() => props.onBlankMapClick?.(47.5, 8.6)}>
          Blank map
        </button>
        <span data-testid="mission-map-drawing-state">{props.isDrawingPolygon ? "drawing" : "idle"}</span>
      </div>
    );
  },
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
    replaceImportedRegions: vi.fn(),
    appendImportedRegions: vi.fn(),
    getExportableRegions: vi.fn(() => []),
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
    setSurveyImportCallbacks: vi.fn(),
    setSurveyExportCallback: vi.fn(),
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

  it("registers survey import/export bridge callbacks with the mission hook on mobile", () => {
    const planner = createSurveyPlanner();
    surveyHookMock.mockReturnValue(planner);
    const mission = createMission("mission");

    render(
      <MissionMobileDrawer
        vehicle={{ connected: true, vehiclePosition: null, missionState: { current_index: null } } as never}
        mission={mission as never}
        deviceLocation={{ location: null } as never}
      />,
    );

    expect(mission.setSurveyImportCallbacks).toHaveBeenCalledWith({
      onReplace: planner.replaceImportedRegions,
      onAppend: planner.appendImportedRegions,
    });
    expect(mission.setSurveyExportCallback).toHaveBeenCalledWith(planner.getExportableRegions);
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

  it("passes polyline drawing mode and a live corridor preview to the map on mobile", () => {
    surveyHookMock.mockReturnValue(createSurveyPlanner({
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
    }));

    render(
      <MissionMobileDrawer
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

  it("publishes corridor overlay data with pattern type, centerline, and corridor polygon on mobile", () => {
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
      <MissionMobileDrawer
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

  it("publishes structure overlay data with orbit rings and altitude labels on mobile", () => {
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
      <MissionMobileDrawer
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

// @vitest-environment jsdom

import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormattedSurveyStats } from "../../lib/survey-preview";
import { SurveyPlannerPanel } from "./SurveyPlannerPanel";
import type { UseSurveyPlannerResult } from "../../hooks/use-survey-planner";
import {
  addSurveyRegion,
  applyGenerationResult,
  createCorridorRegion,
  createStructureRegion,
  createSurveyDraftExtension,
  createSurveyRegion,
  type SurveyRegion,
} from "../../lib/survey-region";
import type { CatalogCamera } from "../../lib/survey-camera-catalog";
import type { MissionItem } from "../../lib/mavkit-types";
import type { CorridorResult } from "../../lib/corridor-scan";
import type { StructureScanResult } from "../../lib/structure-scan";
import type { SurveyResult } from "../../lib/survey-grid";
import { defaultGeoPoint3d } from "../../lib/mavkit-types";

const POLYGON = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.545594 },
];

const POLYLINE = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397242, longitude_deg: 8.546194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
];

const SURVEY_CAMERA: CatalogCamera = {
  canonicalName: "Custom Survey Cam",
  brand: "Custom",
  model: "Survey Cam",
  sensorWidth_mm: 23.5,
  sensorHeight_mm: 15.6,
  imageWidth_px: 6000,
  imageHeight_px: 4000,
  focalLength_mm: 24,
  landscape: true,
  fixedOrientation: false,
};

const FORMATTED_STATS: FormattedSurveyStats = {
  photoCount: "128",
  gsd: "2.3 cm/px",
  area: "18,500 m²",
  triggerDistance: "18.0 m",
  laneSpacing: "24.0 m",
  laneCount: "8",
  crosshatchLaneCount: "0",
  flightTime: "9:12",
};

const FORMATTED_STRUCTURE_STATS: FormattedSurveyStats = {
  photoCount: "96",
  gsd: "1.8 cm/px",
  area: "—",
  triggerDistance: "16.0 m",
  laneSpacing: "—",
  laneCount: "—",
  crosshatchLaneCount: "—",
  flightTime: "7:18",
  layerCount: "4",
  photosPerLayer: "24",
  layerSpacing: "12.0 m",
};

function makeWaypoint(lat: number, lon: number, alt: number): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: defaultGeoPoint3d(lat, lon, alt),
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function makeSurveyResult(items: MissionItem[]): SurveyResult {
  return {
    ok: true,
    items,
    transects: [[
      { latitude_deg: 47.3972, longitude_deg: 8.5458 },
      { latitude_deg: 47.3968, longitude_deg: 8.5469 },
    ]],
    crosshatchTransects: [],
    stats: {
      gsd_m: 0.023,
      photoCount: 128,
      area_m2: 18_500,
      triggerDistance_m: 18,
      laneSpacing_m: 24,
      laneCount: 8,
      crosshatchLaneCount: 0,
    },
    params: {
      polygon: POLYGON,
      camera: SURVEY_CAMERA,
      orientation: "landscape",
      altitude_m: 60,
      sideOverlap_pct: 70,
      frontOverlap_pct: 80,
      trackAngle_deg: 0,
      startCorner: "bottom_left",
      turnDirection: "clockwise",
      crosshatch: false,
      turnaroundDistance_m: 10,
      terrainFollow: false,
      captureMode: "distance",
    },
  };
}

function makeCorridorResult(items: MissionItem[]): CorridorResult {
  return {
    ok: true,
    items,
    transects: [[
      { latitude_deg: 47.3976, longitude_deg: 8.5457 },
      { latitude_deg: 47.3970, longitude_deg: 8.5465 },
    ]],
    crosshatchTransects: [],
    stats: {
      gsd_m: 0.023,
      photoCount: 96,
      area_m2: 12_500,
      triggerDistance_m: 18,
      laneSpacing_m: 24,
      laneCount: 6,
      crosshatchLaneCount: 0,
    },
    params: {
      polyline: POLYLINE,
      camera: SURVEY_CAMERA,
      orientation: "landscape",
      altitude_m: 60,
      sideOverlap_pct: 70,
      frontOverlap_pct: 80,
      leftWidth_m: 50,
      rightWidth_m: 60,
      turnaroundDistance_m: 10,
      terrainFollow: false,
      captureMode: "distance",
    },
    corridorPolygon: [
      { latitude_deg: 47.3978, longitude_deg: 8.5454 },
      { latitude_deg: 47.3980, longitude_deg: 8.5458 },
      { latitude_deg: 47.3968, longitude_deg: 8.5473 },
      { latitude_deg: 47.3965, longitude_deg: 8.5469 },
      { latitude_deg: 47.3978, longitude_deg: 8.5454 },
    ],
  };
}

function makeStructureResult(items: MissionItem[]): StructureScanResult {
  return {
    ok: true,
    items,
    layers: [
      {
        altitude_m: 56,
        gimbalPitch_deg: 10,
        orbitPoints: [
          { latitude_deg: 47.3978, longitude_deg: 8.5455 },
          { latitude_deg: 47.3980, longitude_deg: 8.5460 },
          { latitude_deg: 47.3973, longitude_deg: 8.5473 },
          { latitude_deg: 47.3978, longitude_deg: 8.5455 },
        ],
        photoCount: 24,
      },
      {
        altitude_m: 68,
        gimbalPitch_deg: -5,
        orbitPoints: [
          { latitude_deg: 47.3977, longitude_deg: 8.5456 },
          { latitude_deg: 47.3979, longitude_deg: 8.5461 },
          { latitude_deg: 47.3972, longitude_deg: 8.5472 },
          { latitude_deg: 47.3977, longitude_deg: 8.5456 },
        ],
        photoCount: 24,
      },
    ],
    stats: {
      gsd_m: 0.018,
      photoCount: 48,
      layerCount: 2,
      photosPerLayer: 24,
      layerSpacing_m: 12,
      triggerDistance_m: 16,
      estimatedFlightTime_s: 438,
    },
    params: {
      polygon: POLYGON,
      camera: SURVEY_CAMERA,
      orientation: "landscape",
      altitude_m: 50,
      structureHeight_m: 24,
      scanDistance_m: 15,
      layerCount: 2,
      layerOrder: "bottom_to_top",
      sideOverlap_pct: 70,
      frontOverlap_pct: 80,
      terrainFollow: false,
      captureMode: "distance",
    },
  };
}

function createPlannerStub(overrides: Partial<UseSurveyPlannerResult> = {}): UseSurveyPlannerResult {
  const region = createSurveyRegion(POLYGON);
  region.cameraId = SURVEY_CAMERA.canonicalName;
  region.camera = SURVEY_CAMERA;

  const regions = addSurveyRegion(createSurveyDraftExtension(), region, -1);

  return {
    surveyMode: true,
    patternType: region.patternType,
    activeRegionId: region.id,
    regions,
    isDrawing: false,
    drawingVertices: [],
    selectedCamera: SURVEY_CAMERA,
    params: region.params,
    isGenerating: false,
    showCustomCameraForm: false,
    canGenerate: true,
    activeRegion: region,
    allRegions: [region],
    estimatedWaypointCount: 128,
    formattedStats: null,
    activeRegionFlightTime_s: null,
    activeRegionHasManualEdits: false,
    enterSurveyMode: vi.fn(),
    exitSurveyMode: vi.fn(),
    createRegion: vi.fn(() => region),
    replaceImportedRegions: vi.fn(),
    appendImportedRegions: vi.fn(),
    getExportableRegions: vi.fn(() => []),
    selectRegion: vi.fn(),
    deleteRegion: vi.fn(),
    dissolveRegion: vi.fn(() => []),
    startDraw: vi.fn(),
    stopDraw: vi.fn(),
    addVertex: vi.fn(),
    completePolygon: vi.fn(() => region),
    completeLine: vi.fn(() => region),
    moveVertex: vi.fn(),
    setPatternType: vi.fn(),
    setCamera: vi.fn(),
    setParam: vi.fn(),
    generate: vi.fn(async () => null),
    openCustomCameraForm: vi.fn(),
    closeCustomCameraForm: vi.fn(),
    saveCustomCamera: vi.fn((camera: CatalogCamera) => camera),
    ...overrides,
  };
}

function createCorridorPlannerStub(overrides: Partial<UseSurveyPlannerResult> = {}): UseSurveyPlannerResult {
  const region = createCorridorRegion(POLYLINE);
  region.cameraId = SURVEY_CAMERA.canonicalName;
  region.camera = SURVEY_CAMERA;
  region.params.leftWidth_m = 50;
  region.params.rightWidth_m = 60;

  const corridorRegion = overrides.formattedStats
    ? applyGenerationResult(region, makeCorridorResult([
        makeWaypoint(47.3972, 8.5458, 60),
        makeWaypoint(47.3969, 8.5466, 60),
      ]))
    : region;
  const regions = addSurveyRegion(createSurveyDraftExtension(), corridorRegion, -1);

  return createPlannerStub({
    patternType: "corridor",
    activeRegionId: corridorRegion.id,
    activeRegion: corridorRegion,
    allRegions: [corridorRegion],
    regions,
    params: corridorRegion.params,
    estimatedWaypointCount: 96,
    ...overrides,
  });
}

function createStructurePlannerStub(overrides: Partial<UseSurveyPlannerResult> = {}): UseSurveyPlannerResult {
  const region = createStructureRegion(POLYGON);
  region.cameraId = SURVEY_CAMERA.canonicalName;
  region.camera = SURVEY_CAMERA;
  region.params.structureHeight_m = 24;
  region.params.scanDistance_m = 15;
  region.params.layerCount = 4;

  const structureRegion = overrides.formattedStats
    ? applyGenerationResult(region, makeStructureResult([
        makeWaypoint(47.3972, 8.5458, 56),
        makeWaypoint(47.3969, 8.5466, 56),
      ]))
    : region;
  const regions = addSurveyRegion(createSurveyDraftExtension(), structureRegion, -1);

  return createPlannerStub({
    patternType: "structure",
    activeRegionId: structureRegion.id,
    activeRegion: structureRegion,
    allRegions: [structureRegion],
    regions,
    params: structureRegion.params,
    estimatedWaypointCount: 48,
    ...overrides,
  });
}

function PlannerHarness({
  canGenerate = true,
  withStats = false,
  withManualEdits = false,
}: {
  canGenerate?: boolean;
  withStats?: boolean;
  withManualEdits?: boolean;
}) {
  const [showCustomCameraForm, setShowCustomCameraForm] = useState(false);

  const planner = useMemo(() => {
    const baseRegion = createSurveyRegion(POLYGON);
    baseRegion.cameraId = SURVEY_CAMERA.canonicalName;
    baseRegion.camera = SURVEY_CAMERA;

    if (withManualEdits) {
      baseRegion.manualEdits.set(0, makeWaypoint(47.3971, 8.5461, 60));
    }

    const activeRegion: SurveyRegion = withStats
      ? applyGenerationResult(baseRegion, makeSurveyResult([
          makeWaypoint(47.3972, 8.5458, 60),
          makeWaypoint(47.3969, 8.5466, 60),
        ]))
      : baseRegion;

    const regions = addSurveyRegion(createSurveyDraftExtension(), activeRegion, -1);

    return createPlannerStub({
      showCustomCameraForm,
      canGenerate,
      activeRegionId: activeRegion.id,
      activeRegion,
      allRegions: [activeRegion],
      regions,
      formattedStats: withStats ? FORMATTED_STATS : null,
      activeRegionHasManualEdits: withManualEdits,
      openCustomCameraForm: () => setShowCustomCameraForm(true),
      closeCustomCameraForm: () => setShowCustomCameraForm(false),
    });
  }, [canGenerate, showCustomCameraForm, withManualEdits, withStats]);

  return <SurveyPlannerPanel planner={planner} />;
}

afterEach(() => {
  cleanup();
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
});

describe("SurveyPlannerPanel", () => {
  it("renders the camera picker, overlap inputs, and generate button", () => {
    render(<SurveyPlannerPanel planner={createPlannerStub()} />);

    expect(screen.getByText("Survey Planner")).toBeTruthy();
    expect(screen.getByLabelText("Search cameras")).toBeTruthy();
    expect(screen.getByLabelText("Front overlap")).toBeTruthy();
    expect(screen.getByLabelText("Side overlap")).toBeTruthy();
    expect(screen.getByRole("button", { name: /generate survey/i })).toBeTruthy();
  });

  it("disables generate when the planner cannot generate", () => {
    render(<SurveyPlannerPanel planner={createPlannerStub({
      canGenerate: false,
      activeRegion: null,
      activeRegionId: null,
      allRegions: [],
      selectedCamera: null,
      estimatedWaypointCount: null,
    })} />);

    expect((screen.getByRole("button", { name: /generate survey/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows stats after generation", () => {
    render(<PlannerHarness withStats />);

    expect(screen.getByText("Survey stats")).toBeTruthy();
    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("2.3 cm/px")).toBeTruthy();
    expect(screen.getByText("9:12")).toBeTruthy();
  });

  it("reveals the custom camera form when requested", () => {
    render(<PlannerHarness />);

    fireEvent.click(screen.getByRole("button", { name: /add custom camera/i }));

    expect(screen.getByText("Custom camera profile")).toBeTruthy();
    expect(screen.getByLabelText("Custom camera brand")).toBeTruthy();
    expect(screen.getByLabelText("Sensor width")).toBeTruthy();
  });

  it("shows a manual edit warning on the generate button", () => {
    render(<PlannerHarness withManualEdits />);

    expect(screen.getByText(/manual edits will be replaced on regeneration/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /generate survey/i }).textContent).toContain("Generate survey");
  });

  it("shows structure controls and suppresses grid/corridor-only controls in structure mode", () => {
    render(<SurveyPlannerPanel planner={createStructurePlannerStub()} />);

    expect(screen.getByText("Footprint")).toBeTruthy();
    expect(screen.getByRole("button", { name: /draw footprint/i })).toBeTruthy();
    expect(screen.getByLabelText("Structure height")).toBeTruthy();
    expect(screen.getByLabelText("Scan distance")).toBeTruthy();
    expect(screen.getByLabelText("Layer count")).toBeTruthy();
    expect(screen.queryByLabelText("Track angle")).toBeNull();
    expect(screen.queryByLabelText("Left width")).toBeNull();
    expect(screen.queryByLabelText("Right width")).toBeNull();
    expect(screen.queryByText("Crosshatch")).toBeNull();
    expect(screen.getByRole("button", { name: /generate structure scan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /bottom to top/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /top to bottom/i })).toBeTruthy();
  });

  it("shows layer-oriented stats for generated structure scans", () => {
    render(<SurveyPlannerPanel planner={createStructurePlannerStub({ formattedStats: FORMATTED_STRUCTURE_STATS })} />);

    expect(screen.getByText("Survey stats")).toBeTruthy();
    expect(screen.getByText("Layers")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Spacing 12.0 m")).toBeTruthy();
  });

  it("switches pattern type through the segmented selector", () => {
    const planner = createPlannerStub();
    render(<SurveyPlannerPanel planner={planner} />);

    fireEvent.click(screen.getByRole("button", { name: "Corridor" }));
    expect(planner.setPatternType).toHaveBeenCalledWith("corridor");
  });

  it("shows corridor controls and suppresses grid-only controls in corridor mode", () => {
    render(<SurveyPlannerPanel planner={createCorridorPlannerStub()} />);

    expect(screen.getByText("Corridor path")).toBeTruthy();
    expect(screen.getByRole("button", { name: /draw line/i })).toBeTruthy();
    expect(screen.getByLabelText("Left width")).toBeTruthy();
    expect(screen.getByLabelText("Right width")).toBeTruthy();
    expect(screen.queryByLabelText("Track angle")).toBeNull();
    expect(screen.queryByText("Crosshatch")).toBeNull();
    expect(screen.getByRole("button", { name: /generate corridor/i })).toBeTruthy();
  });

  it("completes a corridor line from the Done button and the Enter key", () => {
    const planner = createCorridorPlannerStub({
      isDrawing: true,
      drawingVertices: POLYLINE,
    });

    render(<SurveyPlannerPanel planner={planner} />);

    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(planner.completeLine).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(planner.completeLine).toHaveBeenCalledTimes(2);
  });
});

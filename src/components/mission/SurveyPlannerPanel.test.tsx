// @vitest-environment jsdom

import { useMemo, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FormattedSurveyStats } from "../../lib/survey-preview";
import { SurveyPlannerPanel } from "./SurveyPlannerPanel";
import type { UseSurveyPlannerResult } from "../../hooks/use-survey-planner";
import {
  addSurveyRegion,
  applyGenerationResult,
  createSurveyDraftExtension,
  createSurveyRegion,
} from "../../lib/survey-region";
import type { CatalogCamera } from "../../lib/survey-camera-catalog";
import type { MissionItem } from "../../lib/mavkit-types";
import type { SurveyResult } from "../../lib/survey-grid";
import { defaultGeoPoint3d } from "../../lib/mavkit-types";

const POLYGON = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.545594 },
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

function createPlannerStub(overrides: Partial<UseSurveyPlannerResult> = {}): UseSurveyPlannerResult {
  const region = createSurveyRegion(POLYGON);
  region.cameraId = SURVEY_CAMERA.canonicalName;
  region.camera = SURVEY_CAMERA;

  const regions = addSurveyRegion(createSurveyDraftExtension(), region, -1);

  return {
    surveyMode: true,
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
    selectRegion: vi.fn(),
    deleteRegion: vi.fn(),
    dissolveRegion: vi.fn(() => []),
    startDraw: vi.fn(),
    stopDraw: vi.fn(),
    addVertex: vi.fn(),
    completePolygon: vi.fn(() => region),
    moveVertex: vi.fn(),
    setCamera: vi.fn(),
    setParam: vi.fn(),
    generate: vi.fn(async () => null),
    openCustomCameraForm: vi.fn(),
    closeCustomCameraForm: vi.fn(),
    saveCustomCamera: vi.fn((camera: CatalogCamera) => camera),
    ...overrides,
  };
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

    const activeRegion = withStats
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
  localStorage.clear();
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
});

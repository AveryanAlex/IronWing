// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogCamera } from "../lib/survey-camera-catalog";
import { useSurveyPlanner } from "./use-survey-planner";

const POLYGON = [
  { latitude_deg: 47.397742, longitude_deg: 8.545594 },
  { latitude_deg: 47.397742, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.547194 },
  { latitude_deg: 47.396642, longitude_deg: 8.545594 },
];

const HOME_POSITION = {
  latitude_deg: 47.3972,
  longitude_deg: 8.5463,
  altitude_m: 408,
};

const PORTRAIT_CAMERA: CatalogCamera = {
  canonicalName: "Custom Portrait Cam",
  brand: "Custom",
  model: "Portrait Cam",
  sensorWidth_mm: 23.5,
  sensorHeight_mm: 15.6,
  imageWidth_px: 4000,
  imageHeight_px: 6000,
  focalLength_mm: 24,
  landscape: false,
  fixedOrientation: false,
};

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

afterEach(() => {
  localStorage.clear();
});

describe("useSurveyPlanner", () => {
  it("toggles survey mode explicitly", () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    expect(result.current.surveyMode).toBe(false);

    act(() => {
      result.current.enterSurveyMode();
    });

    expect(result.current.surveyMode).toBe(true);

    act(() => {
      result.current.exitSurveyMode();
    });

    expect(result.current.surveyMode).toBe(false);
    expect(result.current.isDrawing).toBe(false);
  });

  it("sets orientation from the selected camera defaults", () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    act(() => {
      result.current.createRegion(POLYGON);
      result.current.setCamera(PORTRAIT_CAMERA);
    });

    expect(result.current.selectedCamera?.canonicalName).toBe(PORTRAIT_CAMERA.canonicalName);
    expect(result.current.params.orientation).toBe("portrait");
    expect(result.current.activeRegion?.params.orientation).toBe("portrait");
  });

  it("keeps canGenerate false without both a polygon and a camera", () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    expect(result.current.canGenerate).toBe(false);

    act(() => {
      result.current.enterSurveyMode();
      result.current.setCamera(SURVEY_CAMERA);
    });

    expect(result.current.canGenerate).toBe(false);

    act(() => {
      result.current.setCamera(null);
      result.current.createRegion(POLYGON);
    });

    expect(result.current.canGenerate).toBe(false);
  });

  it("creates a region and exposes it through ordered region state", () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    act(() => {
      result.current.createRegion(POLYGON);
    });

    expect(result.current.allRegions).toHaveLength(1);
    expect(result.current.activeRegionId).toBe(result.current.allRegions[0]?.id ?? null);
    expect(result.current.activeRegion?.polygon).toEqual(POLYGON);
  });

  it("deletes the active region", () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    act(() => {
      result.current.createRegion(POLYGON);
    });

    const regionId = result.current.activeRegionId;
    expect(regionId).not.toBeNull();

    act(() => {
      result.current.deleteRegion(regionId as string);
    });

    expect(result.current.allRegions).toHaveLength(0);
    expect(result.current.activeRegion).toBeNull();
  });

  it("generates a survey and stores the result on the active region", async () => {
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
    }));

    act(() => {
      result.current.createRegion(POLYGON);
      result.current.setCamera(SURVEY_CAMERA);
    });

    expect(result.current.canGenerate).toBe(true);

    await act(async () => {
      await result.current.generate();
    });

    await waitFor(() => {
      expect(result.current.activeRegion?.generatedItems.length).toBeGreaterThan(0);
    });

    expect(result.current.activeRegion?.generatedStats).not.toBeNull();
    expect(result.current.activeRegion?.errors).toEqual([]);
    expect(result.current.formattedStats?.photoCount).not.toBe("—");
  });

  it("dissolves a generated region into mission items and forwards them to mission mutators", async () => {
    const insertGeneratedAfter = vi.fn();
    const { result } = renderHook(() => useSurveyPlanner({
      homePosition: HOME_POSITION,
      cruiseSpeed_mps: 14,
      missionMutators: {
        selectedIndex: 1,
        displayTotal: 3,
        insertGeneratedAfter,
      },
    }));

    act(() => {
      result.current.createRegion(POLYGON);
      result.current.setCamera(SURVEY_CAMERA);
    });

    await act(async () => {
      await result.current.generate();
    });

    const regionId = result.current.activeRegionId;
    expect(regionId).not.toBeNull();

    let dissolvedItemsLength = 0;
    act(() => {
      dissolvedItemsLength = result.current.dissolveRegion(regionId as string).length;
    });

    expect(dissolvedItemsLength).toBeGreaterThan(0);
    expect(result.current.allRegions).toHaveLength(0);
    expect(insertGeneratedAfter).toHaveBeenCalledTimes(1);
    expect(insertGeneratedAfter.mock.calls[0]?.[0]).toBe(1);
    expect(insertGeneratedAfter.mock.calls[0]?.[1]).toHaveLength(dissolvedItemsLength);
  });
});

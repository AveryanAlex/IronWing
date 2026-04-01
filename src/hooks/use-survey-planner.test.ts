// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as corridorScan from "../lib/corridor-scan";
import type { CatalogCamera } from "../lib/survey-camera-catalog";
import { useSurveyPlanner } from "./use-survey-planner";

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
    };
})();

Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
});

const POLYGON = [
    { latitude_deg: 47.397742, longitude_deg: 8.545594 },
    { latitude_deg: 47.397742, longitude_deg: 8.547194 },
    { latitude_deg: 47.396642, longitude_deg: 8.547194 },
    { latitude_deg: 47.396642, longitude_deg: 8.545594 },
];

const POLYLINE = [
    { latitude_deg: 47.397742, longitude_deg: 8.545594 },
    { latitude_deg: 47.397242, longitude_deg: 8.546394 },
    { latitude_deg: 47.396642, longitude_deg: 8.547194 },
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
    vi.restoreAllMocks();
});

function createCorridorRegionInHook(result: { current: ReturnType<typeof useSurveyPlanner> }, points: typeof POLYLINE) {
    act(() => {
        result.current.setPatternType("corridor");
        result.current.startDraw();
    });

    act(() => {
        points.forEach((point) => result.current.addVertex(point.latitude_deg, point.longitude_deg));
    });

    let region = null;
    act(() => {
        region = result.current.completeLine();
    });

    return region;
}

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

    it("keeps canGenerate false without both a region geometry and a camera", () => {
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

        expect(result.current.patternType).toBe("grid");
        expect(result.current.allRegions).toHaveLength(1);
        expect(result.current.activeRegionId).toBe(result.current.allRegions[0]?.id ?? null);
        expect(result.current.activeRegion?.patternType).toBe("grid");
        expect(result.current.activeRegion?.polygon).toEqual(POLYGON);
    });

    it("switching pattern type resets drawing state", () => {
        const { result } = renderHook(() => useSurveyPlanner({
            homePosition: HOME_POSITION,
            cruiseSpeed_mps: 14,
        }));

        act(() => {
            result.current.startDraw();
            result.current.addVertex(POLYLINE[0].latitude_deg, POLYLINE[0].longitude_deg);
            result.current.addVertex(POLYLINE[1].latitude_deg, POLYLINE[1].longitude_deg);
        });

        expect(result.current.isDrawing).toBe(true);
        expect(result.current.drawingVertices).toHaveLength(2);

        act(() => {
            result.current.setPatternType("corridor");
        });

        expect(result.current.patternType).toBe("corridor");
        expect(result.current.isDrawing).toBe(false);
        expect(result.current.drawingVertices).toEqual([]);
        expect(result.current.params.leftWidth_m).toBe(50);
        expect(result.current.params.rightWidth_m).toBe(50);
    });

    it("completeLine creates a corridor region from 2 vertices", () => {
        const { result } = renderHook(() => useSurveyPlanner({
            homePosition: HOME_POSITION,
            cruiseSpeed_mps: 14,
        }));

        act(() => {
            result.current.setPatternType("corridor");
            result.current.startDraw();
        });

        act(() => {
            result.current.addVertex(POLYLINE[0].latitude_deg, POLYLINE[0].longitude_deg);
            result.current.addVertex(POLYLINE[1].latitude_deg, POLYLINE[1].longitude_deg);
        });

        let region = null;
        act(() => {
            region = result.current.completeLine();
        });

        expect(region).not.toBeNull();
        expect(result.current.isDrawing).toBe(false);
        expect(result.current.activeRegion?.patternType).toBe("corridor");
        expect(result.current.activeRegion?.polygon).toEqual([]);
        expect(result.current.activeRegion?.polyline).toEqual(POLYLINE.slice(0, 2));
        expect(result.current.activeRegion?.params.leftWidth_m).toBe(50);
        expect(result.current.activeRegion?.params.rightWidth_m).toBe(50);
    });

    it("corridor canGenerate requires a polyline, camera, and positive widths", () => {
        const { result } = renderHook(() => useSurveyPlanner({
            homePosition: HOME_POSITION,
            cruiseSpeed_mps: 14,
        }));

        createCorridorRegionInHook(result, POLYLINE.slice(0, 2));

        act(() => {
            result.current.setCamera(SURVEY_CAMERA);
        });

        expect(result.current.canGenerate).toBe(true);

        act(() => {
            result.current.setParam("leftWidth_m", 0);
        });
        expect(result.current.canGenerate).toBe(false);

        act(() => {
            result.current.setParam("leftWidth_m", 40);
            result.current.setParam("rightWidth_m", -5);
        });
        expect(result.current.canGenerate).toBe(false);

        act(() => {
            result.current.setParam("rightWidth_m", 60);
        });
        expect(result.current.canGenerate).toBe(true);
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

    it("selecting a corridor region restores the planner pattern type", () => {
        const { result } = renderHook(() => useSurveyPlanner({
            homePosition: HOME_POSITION,
            cruiseSpeed_mps: 14,
        }));

        act(() => {
            result.current.createRegion(POLYGON);
        });
        const gridRegionId = result.current.activeRegionId as string;

        createCorridorRegionInHook(result, POLYLINE);
        const corridorRegionId = result.current.activeRegionId as string;

        act(() => {
            result.current.selectRegion(gridRegionId);
        });
        expect(result.current.patternType).toBe("grid");
        expect(result.current.activeRegion?.patternType).toBe("grid");

        act(() => {
            result.current.selectRegion(corridorRegionId);
        });
        expect(result.current.patternType).toBe("corridor");
        expect(result.current.activeRegion?.patternType).toBe("corridor");
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

    it("dispatches corridor generation for corridor regions", async () => {
        const generateCorridorSpy = vi.spyOn(corridorScan, "generateCorridor").mockResolvedValue({
            ok: true,
            items: [{
                command: {
                    Do: {
                        CamTriggerDistance: {
                            meters: 12,
                            trigger_now: true,
                        },
                    },
                },
                current: false,
                autocontinue: true,
            }],
            transects: [[
                { latitude_deg: POLYLINE[0].latitude_deg, longitude_deg: POLYLINE[0].longitude_deg },
                { latitude_deg: POLYLINE[1].latitude_deg, longitude_deg: POLYLINE[1].longitude_deg },
            ]],
            crosshatchTransects: [],
            stats: {
                gsd_m: 0.02,
                photoCount: 10,
                area_m2: 1500,
                triggerDistance_m: 12,
                laneSpacing_m: 18,
                laneCount: 3,
                crosshatchLaneCount: 0,
            },
            params: {
                polyline: POLYLINE,
                camera: SURVEY_CAMERA,
                orientation: "landscape",
                altitude_m: 50,
                sideOverlap_pct: 70,
                frontOverlap_pct: 80,
                leftWidth_m: 40,
                rightWidth_m: 60,
                turnaroundDistance_m: 0,
                terrainFollow: false,
                captureMode: "distance",
            },
            corridorPolygon: [
                POLYLINE[0],
                POLYLINE[1],
                POLYLINE[2],
                POLYLINE[0],
            ],
        });

        const { result } = renderHook(() => useSurveyPlanner({
            homePosition: HOME_POSITION,
            cruiseSpeed_mps: 14,
        }));

        createCorridorRegionInHook(result, POLYLINE);

        act(() => {
            result.current.setCamera(SURVEY_CAMERA);
            result.current.setParam("leftWidth_m", 40);
            result.current.setParam("rightWidth_m", 60);
        });

        await act(async () => {
            await result.current.generate();
        });

        expect(generateCorridorSpy).toHaveBeenCalledTimes(1);
        expect(generateCorridorSpy).toHaveBeenCalledWith(expect.objectContaining({
            polyline: POLYLINE,
            leftWidth_m: 40,
            rightWidth_m: 60,
            camera: SURVEY_CAMERA,
        }));
        expect(result.current.activeRegion?.generatedStats?.crosshatchLaneCount).toBe(0);
        expect(result.current.activeRegion?.corridorPolygon).toEqual([
            POLYLINE[0],
            POLYLINE[1],
            POLYLINE[2],
            POLYLINE[0],
        ]);
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

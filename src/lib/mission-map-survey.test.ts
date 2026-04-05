import { describe, expect, it } from "vitest";

import { localXYToLatLon, type GeoRef } from "./mission-coordinates";
import {
  buildMissionMapSurveyModel,
  minimumSurveyPointCount,
  setSurveyGeometryPoints,
  surveyGeometryKind,
} from "./mission-map-survey";
import { FOOTPRINT_LOD_THRESHOLD } from "./survey-preview";
import { getBuiltinCameras } from "./survey-camera-catalog";
import { createSurveyDraftExtension, createSurveyRegion, createStructureRegion, type SurveyRegion } from "./survey-region";
import type { GeoPoint2d } from "./mavkit-types";

const TEST_REF: GeoRef = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
};

const BUILTIN_CAMERA = getBuiltinCameras().find((camera) => camera.canonicalName === "DJI Mavic 3E") ?? getBuiltinCameras()[0]!;

function pointFromOffset(x_m: number, y_m: number, ref: GeoRef = TEST_REF): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(ref, x_m, y_m);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

function makeGridRegion(overrides: Partial<SurveyRegion> = {}): SurveyRegion {
  const region = createSurveyRegion([
    pointFromOffset(-40, -40),
    pointFromOffset(40, -40),
    pointFromOffset(40, 40),
    pointFromOffset(-40, 40),
  ]);

  return {
    ...region,
    ...overrides,
    params: {
      ...region.params,
      ...overrides.params,
    },
    polygon: overrides.polygon ?? region.polygon,
    polyline: overrides.polyline ?? region.polyline,
    generatedTransects: overrides.generatedTransects ?? region.generatedTransects,
    generatedCrosshatch: overrides.generatedCrosshatch ?? region.generatedCrosshatch,
    generatedLayers: overrides.generatedLayers ?? region.generatedLayers,
    generatedStats: overrides.generatedStats ?? region.generatedStats,
    manualEdits: overrides.manualEdits ?? region.manualEdits,
    camera: overrides.camera ?? region.camera,
    cameraId: overrides.cameraId ?? region.cameraId,
    corridorPolygon: overrides.corridorPolygon ?? region.corridorPolygon,
  };
}

function withSurvey(region: SurveyRegion) {
  const survey = createSurveyDraftExtension();
  survey.surveyRegions.set(region.id, region);
  survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });
  return survey;
}

describe("mission-map-survey", () => {
  it("builds selected vertex handles plus preview features from generated survey data", () => {
    const region = makeGridRegion({
      camera: BUILTIN_CAMERA,
      cameraId: BUILTIN_CAMERA.canonicalName,
      generatedTransects: [
        [pointFromOffset(-20, -30), pointFromOffset(-20, 30)],
        [pointFromOffset(20, -30), pointFromOffset(20, 30)],
      ],
      generatedCrosshatch: [
        [pointFromOffset(-30, 0), pointFromOffset(30, 0)],
      ],
      generatedStats: {
        gsd_m: 0.02,
        photoCount: 8,
        area_m2: 6_400,
        triggerDistance_m: 20,
        laneSpacing_m: 18,
        laneCount: 2,
        crosshatchLaneCount: 1,
      },
    });

    const model = buildMissionMapSurveyModel({
      survey: withSurvey(region),
      selectedRegionId: region.id,
    });

    expect(model.regionHandles).toHaveLength(1);
    expect(model.vertexHandles).toHaveLength(region.polygon.length);
    expect(model.counts.previewFeatures).toBeGreaterThan(0);
    expect(model.counts.previewFeatureKinds).toMatchObject({
      survey_transect: 2,
      survey_crosshatch: 1,
    });
    expect(
      Object.keys(model.counts.previewFeatureKinds).some((kind) => kind === "survey_footprint" || kind === "survey_swath_band"),
    ).toBe(true);
    expect(model.warnings).toEqual([]);
  });

  it("keeps incomplete polygons visible as draft geometry instead of crashing the map seam", () => {
    const region = makeGridRegion();
    const incomplete = setSurveyGeometryPoints(region, region.polygon.slice(0, 2));

    const model = buildMissionMapSurveyModel({
      survey: withSurvey(incomplete),
      selectedRegionId: incomplete.id,
    });

    expect(surveyGeometryKind(incomplete)).toBe("polygon");
    expect(minimumSurveyPointCount(incomplete.patternType)).toBe(3);
    expect(model.geoJson.features.some((feature) => feature.properties.kind === "survey_polygon_draft")).toBe(true);
    expect(model.referenceCoordinates).toHaveLength(3);
    expect(model.vertexHandles).toHaveLength(2);
    expect(model.warnings.some((warning) => warning.includes("incomplete polygon"))).toBe(true);
  });

  it("drops only preview overlays when generated data lacks a resolved camera", () => {
    const region = makeGridRegion({
      camera: null,
      cameraId: null,
      generatedTransects: [
        [pointFromOffset(-20, -30), pointFromOffset(-20, 30)],
      ],
      generatedStats: {
        gsd_m: 0.02,
        photoCount: 8,
        area_m2: 6_400,
        triggerDistance_m: 20,
        laneSpacing_m: 18,
        laneCount: 1,
        crosshatchLaneCount: 0,
      },
    });

    const model = buildMissionMapSurveyModel({
      survey: withSurvey(region),
      selectedRegionId: region.id,
    });

    expect(model.counts.previewFeatureKinds.survey_transect).toBe(1);
    expect(model.counts.previewFeatureKinds.survey_footprint ?? 0).toBe(0);
    expect(model.counts.previewFeatureKinds.survey_swath_band ?? 0).toBe(0);
    expect(model.regionHandles).toHaveLength(1);
    expect(model.warnings.some((warning) => warning.includes("resolved camera"))).toBe(true);
  });

  it("switches dense overlays to swath-band LOD and keeps structure orbit previews inspectable", () => {
    const region = makeGridRegion({
      camera: BUILTIN_CAMERA,
      cameraId: BUILTIN_CAMERA.canonicalName,
      generatedTransects: [
        [pointFromOffset(-20, -40), pointFromOffset(-20, 40)],
      ],
      generatedStats: {
        gsd_m: 0.02,
        photoCount: FOOTPRINT_LOD_THRESHOLD,
        area_m2: 6_400,
        triggerDistance_m: 12,
        laneSpacing_m: 18,
        laneCount: 1,
        crosshatchLaneCount: 0,
      },
    });

    const structure = createStructureRegion([
      pointFromOffset(-25, -25),
      pointFromOffset(25, -25),
      pointFromOffset(25, 25),
      pointFromOffset(-25, 25),
    ]);
    structure.generatedLayers = [
      {
        altitude_m: 55,
        gimbalPitch_deg: -35,
        orbitPoints: [
          pointFromOffset(-30, 0),
          pointFromOffset(0, 30),
          pointFromOffset(30, 0),
          pointFromOffset(0, -30),
          pointFromOffset(-30, 0),
        ],
        photoCount: 10,
      },
    ];

    const survey = createSurveyDraftExtension();
    survey.surveyRegions.set(region.id, region);
    survey.surveyRegions.set(structure.id, structure);
    survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });
    survey.surveyRegionOrder.push({ regionId: structure.id, position: 1 });

    const model = buildMissionMapSurveyModel({
      survey,
      selectedRegionId: structure.id,
    });

    expect(model.counts.previewFeatureKinds.survey_swath_band).toBe(1);
    expect(model.counts.previewFeatureKinds.survey_footprint ?? 0).toBe(0);
    expect(model.counts.previewFeatureKinds.survey_orbit).toBe(1);
    expect(model.vertexHandles).toHaveLength(structure.polygon.length);
  });
});

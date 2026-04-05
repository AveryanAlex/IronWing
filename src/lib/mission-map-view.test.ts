import { describe, expect, it } from "vitest";

import type { TypedDraftItem } from "./mission-draft-typed";
import {
  buildMissionMapView,
  missionMapMarkerIdForUiId,
  resolveMissionMapDrag,
  resolveMissionMapFenceRadiusHandleDrag,
  resolveMissionMapFenceVertexHandleDrag,
  resolveMissionMapSurveyHandleDrag,
  type MissionMapSelection,
} from "./mission-map-view";
import type { TypedDraftItem } from "./mission-draft-typed";
import {
  defaultGeoPoint3d,
  type FenceRegion,
  type HomePosition,
  type MissionCommand,
  type MissionItem,
} from "./mavkit-types";
import { latLonFromBearingDistance } from "./mission-coordinates";
import { createSurveyDraftExtension, hydrateSurveyRegion } from "./survey-region";

function makeMissionItem(command: MissionCommand, current = false): MissionItem {
  return {
    command,
    current,
    autocontinue: true,
  };
}

function makeDraftItem(options: {
  uiId: number;
  index: number;
  latitude_deg: number | null;
  longitude_deg: number | null;
  altitude_m?: number | null;
  readOnly?: boolean;
  current?: boolean;
}): TypedDraftItem {
  const latitude_deg = options.latitude_deg ?? 47.4;
  const longitude_deg = options.longitude_deg ?? 8.55;

  return {
    uiId: options.uiId,
    index: options.index,
    document: makeMissionItem({
      Nav: {
        Waypoint: {
          position: defaultGeoPoint3d(latitude_deg, longitude_deg, options.altitude_m ?? 30),
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    }, options.current),
    readOnly: options.readOnly ?? false,
    preview: {
      latitude_deg: options.latitude_deg,
      longitude_deg: options.longitude_deg,
      altitude_m: options.altitude_m ?? 30,
    },
  };
}

function waypoint(index: number, uiId: number, lat: number, lon: number, current = false): TypedDraftItem {
  return makeDraftItem({
    uiId,
    index,
    latitude_deg: lat,
    longitude_deg: lon,
    current,
  });
}

function polygonRegion(vertices: Array<{ latitude_deg: number; longitude_deg: number }>, inclusion = true): FenceRegion {
  return inclusion
    ? {
      inclusion_polygon: {
        vertices,
        inclusion_group: 0,
      },
    }
    : {
      exclusion_polygon: {
        vertices,
      },
    };
}

function circleRegion(lat: number, lon: number, radius_m: number, inclusion = true): FenceRegion {
  return inclusion
    ? {
      inclusion_circle: {
        center: { latitude_deg: lat, longitude_deg: lon },
        radius_m,
        inclusion_group: 0,
      },
    }
    : {
      exclusion_circle: {
        center: { latitude_deg: lat, longitude_deg: lon },
        radius_m,
      },
    };
}

function makeFenceDraftItem(options: {
  uiId: number;
  index: number;
  region: FenceRegion;
  latitude_deg: number;
  longitude_deg: number;
}): TypedDraftItem {
  return {
    uiId: options.uiId,
    index: options.index,
    document: options.region,
    readOnly: false,
    preview: {
      latitude_deg: options.latitude_deg,
      longitude_deg: options.longitude_deg,
      altitude_m: null,
    },
  };
}

function selection(selection: MissionMapSelection = { kind: "home" }): MissionMapSelection {
  return selection;
}

describe("buildMissionMapView", () => {
  const home: HomePosition = {
    latitude_deg: 47.397742,
    longitude_deg: 8.545594,
    altitude_m: 488,
  };

  it("returns an empty map state for an empty draft", () => {
    const view = buildMissionMapView({
      home: null,
      missionItems: [],
      survey: createSurveyDraftExtension(),
      selection: selection(),
    });

    expect(view.state).toBe("empty");
    expect(view.viewport).toBeNull();
    expect(view.counts.markers).toBe(0);
    expect(view.counts.missionFeatures).toBe(0);
    expect(view.counts.surveyFeatures).toBe(0);
  });

  it("derives home and mission markers plus path features from the same planner draft", () => {
    const target = latLonFromBearingDistance(home, 90, 120);
    const view = buildMissionMapView({
      home,
      missionItems: [waypoint(0, 11, target.lat, target.lon, true)],
      survey: createSurveyDraftExtension(),
      selection: selection({ kind: "mission-item", uiId: 11 }),
    });

    expect(view.state).toBe("ready");
    expect(view.viewport).not.toBeNull();
    expect(view.counts.markers).toBe(2);
    expect(view.counts.missionFeatures).toBe(2);
    expect(view.counts.missionFeatureKinds).toMatchObject({
      straight: 1,
      label: 1,
    });
    expect(view.markers.find((marker) => marker.kind === "home")?.selected).toBe(false);
    expect(view.markers.find((marker) => marker.uiId === 11)).toMatchObject({
      selected: true,
      current: true,
      draggable: true,
    });
  });

  it("renders survey-only drafts and keeps missing cameras non-fatal", () => {
    const survey = createSurveyDraftExtension();
    const region = hydrateSurveyRegion({
      patternType: "grid",
      position: 0,
      polygon: [
        { latitude_deg: 47.3981, longitude_deg: 8.5451 },
        { latitude_deg: 47.3984, longitude_deg: 8.5463 },
        { latitude_deg: 47.3977, longitude_deg: 8.5468 },
      ],
      polyline: [],
      camera: null,
      params: {
        altitude_m: 55,
        sideOverlap_pct: 65,
        frontOverlap_pct: 80,
      },
      embeddedItems: [],
      qgcPassthrough: {},
      warnings: [],
    });

    survey.surveyRegions.set(region.id, region);
    survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });

    const view = buildMissionMapView({
      home: null,
      missionItems: [],
      survey,
      selection: selection({ kind: "survey-block", regionId: region.id }),
    });

    expect(view.state).toBe("ready");
    expect(view.counts.surveyFeatures).toBeGreaterThan(0);
    expect(view.surveyHandles).toHaveLength(1);
    expect(view.surveyHandles[0]).toMatchObject({
      regionId: region.id,
      selected: true,
      patternType: "grid",
    });
    expect(view.warnings).toEqual([]);
  });

  it("projects selected survey vertices and rejects stale vertex drags safely", () => {
    const survey = createSurveyDraftExtension();
    const region = hydrateSurveyRegion({
      patternType: "grid",
      position: 0,
      polygon: [
        { latitude_deg: 47.3981, longitude_deg: 8.5451 },
        { latitude_deg: 47.3984, longitude_deg: 8.5463 },
        { latitude_deg: 47.3977, longitude_deg: 8.5468 },
      ],
      polyline: [],
      camera: null,
      params: {
        altitude_m: 55,
        sideOverlap_pct: 65,
        frontOverlap_pct: 80,
      },
      embeddedItems: [],
      qgcPassthrough: {},
      warnings: [],
    });

    survey.surveyRegions.set(region.id, region);
    survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });

    const view = buildMissionMapView({
      home: null,
      missionItems: [],
      survey,
      selection: selection({ kind: "survey-block", regionId: region.id }),
    });

    expect(view.viewport).not.toBeNull();
    expect(view.surveyVertexHandles).toHaveLength(3);
    expect(view.counts.surveyVertexHandles).toBe(3);

    const firstHandle = view.surveyVertexHandles[0];
    const applied = resolveMissionMapSurveyHandleDrag(view, firstHandle.id, { x: 620, y: 280 });
    const rejected = resolveMissionMapSurveyHandleDrag(view, "missing-handle", { x: 620, y: 280 });

    expect(applied.status).toBe("applied");
    if (applied.status === "applied") {
      expect(applied.handle.regionId).toBe(region.id);
      expect(applied.latitude_deg).not.toBe(region.polygon[0]?.latitude_deg);
      expect(applied.longitude_deg).not.toBe(region.polygon[0]?.longitude_deg);
    }
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: "handle-not-found",
    });
  });

  it("keeps incomplete selected polygons inspectable through draft lines and vertex handles", () => {
    const survey = createSurveyDraftExtension();
    const region = hydrateSurveyRegion({
      patternType: "structure",
      position: 0,
      polygon: [
        { latitude_deg: 47.3981, longitude_deg: 8.5451 },
        { latitude_deg: 47.3984, longitude_deg: 8.5463 },
      ],
      polyline: [],
      camera: null,
      params: {
        altitude_m: 55,
        sideOverlap_pct: 65,
        frontOverlap_pct: 80,
      },
      embeddedItems: [],
      qgcPassthrough: {},
      warnings: [],
    });

    survey.surveyRegions.set(region.id, region);
    survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });

    const view = buildMissionMapView({
      home: null,
      missionItems: [],
      survey,
      selection: selection({ kind: "survey-block", regionId: region.id }),
    });

    expect(view.state).toBe("degraded");
    expect(view.viewport).not.toBeNull();
    expect(view.surveyLines.some((line) => line.kind === "survey_polygon_draft")).toBe(true);
    expect(view.surveyVertexHandles).toHaveLength(2);
    expect(view.warnings.some((warning) => warning.includes("incomplete polygon"))).toBe(true);
  });

  it("drops malformed survey geometry and degrades instead of crashing", () => {
    const survey = createSurveyDraftExtension();
    const region = hydrateSurveyRegion({
      patternType: "corridor",
      position: 0,
      polygon: [],
      polyline: [],
      camera: null,
      params: {
        altitude_m: 55,
        sideOverlap_pct: 65,
        frontOverlap_pct: 80,
      },
      embeddedItems: [],
      qgcPassthrough: {},
      warnings: [],
    });

    survey.surveyRegions.set(region.id, region);
    survey.surveyRegionOrder.push({ regionId: region.id, position: 0 });

    const view = buildMissionMapView({
      home: null,
      missionItems: [],
      survey,
      selection: selection(),
    });

    expect(view.state).toBe("degraded");
    expect(view.viewport).toBeNull();
    expect(view.counts.surveyFeatures).toBe(0);
    expect(view.surveyHandles).toHaveLength(0);
    expect(view.warnings[0]).toContain("no plottable geometry");
  });

  it("rejects read-only drag targets and resolves repeated waypoint drags on the same marker", () => {
    const readOnlyView = buildMissionMapView({
      home: null,
      missionItems: [makeDraftItem({
        uiId: 7,
        index: 0,
        latitude_deg: 47.4,
        longitude_deg: 8.55,
        readOnly: true,
      })],
      survey: createSurveyDraftExtension(),
      selection: selection({ kind: "mission-item", uiId: 7 }),
    });

    const rejected = resolveMissionMapDrag(
      readOnlyView,
      missionMapMarkerIdForUiId(7),
      { x: 900, y: 100 },
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: "marker-not-draggable",
    });

    const editableView = buildMissionMapView({
      home,
      missionItems: [waypoint(0, 8, 47.401, 8.552)],
      survey: createSurveyDraftExtension(),
      selection: selection({ kind: "mission-item", uiId: 8 }),
    });

    const firstMove = resolveMissionMapDrag(
      editableView,
      missionMapMarkerIdForUiId(8),
      { x: 700, y: 280 },
    );
    const secondMove = resolveMissionMapDrag(
      editableView,
      missionMapMarkerIdForUiId(8),
      { x: 820, y: 180 },
    );

    expect(firstMove.status).toBe("applied");
    expect(secondMove.status).toBe("applied");
    if (firstMove.status === "applied" && secondMove.status === "applied") {
      expect(secondMove.latitude_deg).not.toBe(firstMove.latitude_deg);
      expect(secondMove.longitude_deg).not.toBe(firstMove.longitude_deg);
      expect(secondMove.point.x).toBeGreaterThan(firstMove.point.x);
      expect(secondMove.point.y).toBeLessThan(firstMove.point.y);
    }
  });

  it("projects fence regions, return point truth, and fence drag handles in fence mode", () => {
    const polygon = polygonRegion([
      { latitude_deg: 47.3981, longitude_deg: 8.5451 },
      { latitude_deg: 47.3984, longitude_deg: 8.5461 },
      { latitude_deg: 47.3977, longitude_deg: 8.5468 },
      { latitude_deg: 47.3974, longitude_deg: 8.5456 },
    ]);
    const circle = circleRegion(47.3989, 8.5472, 80, false);

    const view = buildMissionMapView({
      mode: "fence",
      home,
      missionItems: [waypoint(0, 21, 47.3982, 8.5448)],
      survey: createSurveyDraftExtension(),
      selection: selection({ kind: "home" }),
      fenceDraftItems: [
        makeFenceDraftItem({ uiId: 301, index: 0, region: polygon, latitude_deg: 47.3979, longitude_deg: 8.5459 }),
        makeFenceDraftItem({ uiId: 302, index: 1, region: circle, latitude_deg: 47.3989, longitude_deg: 8.5472 }),
      ],
      fenceReturnPoint: { latitude_deg: 47.3995, longitude_deg: 8.5478 },
      fenceSelection: { kind: "region", regionUiId: 301 },
    });

    expect(view.mode).toBe("fence");
    expect(view.state).toBe("ready");
    expect(view.viewport).not.toBeNull();
    expect(view.counts.fenceFeatures).toBe(3);
    expect(view.fencePolygons).toHaveLength(2);
    expect(view.fenceRegionHandles).toHaveLength(2);
    expect(view.fenceVertexHandles).toHaveLength(4);
    expect(view.fenceRadiusHandles).toHaveLength(0);
    expect(view.fenceReturnPoint).toMatchObject({
      selected: false,
      latitude_deg: 47.3995,
      longitude_deg: 8.5478,
    });
    expect(view.fenceRegionHandles.find((handle) => handle.regionUiId === 301)?.selected).toBe(true);
  });

  it("resolves fence vertex and radius drags while rejecting stale fence handles safely", () => {
    const polygon = polygonRegion([
      { latitude_deg: 47.3981, longitude_deg: 8.5451 },
      { latitude_deg: 47.3984, longitude_deg: 8.5461 },
      { latitude_deg: 47.3977, longitude_deg: 8.5468 },
    ]);
    const circle = circleRegion(47.3989, 8.5472, 80, true);

    const polygonView = buildMissionMapView({
      mode: "fence",
      home: null,
      missionItems: [],
      survey: createSurveyDraftExtension(),
      selection: selection(),
      fenceDraftItems: [makeFenceDraftItem({ uiId: 401, index: 0, region: polygon, latitude_deg: 47.3981, longitude_deg: 8.546 })],
      fenceReturnPoint: null,
      fenceSelection: { kind: "region", regionUiId: 401 },
    });

    expect(polygonView.fenceVertexHandles).toHaveLength(3);
    const movedVertex = resolveMissionMapFenceVertexHandleDrag(polygonView, polygonView.fenceVertexHandles[0]!.id, { x: 640, y: 260 });
    const staleVertex = resolveMissionMapFenceVertexHandleDrag(polygonView, "missing-fence-vertex", { x: 640, y: 260 });

    expect(movedVertex.status).toBe("applied");
    if (movedVertex.status === "applied") {
      expect(movedVertex.latitude_deg).not.toBe(polygonView.fenceVertexHandles[0]!.latitude_deg);
      expect(movedVertex.longitude_deg).not.toBe(polygonView.fenceVertexHandles[0]!.longitude_deg);
    }
    expect(staleVertex).toMatchObject({
      status: "rejected",
      reason: "handle-not-found",
    });

    const circleView = buildMissionMapView({
      mode: "fence",
      home: null,
      missionItems: [],
      survey: createSurveyDraftExtension(),
      selection: selection(),
      fenceDraftItems: [makeFenceDraftItem({ uiId: 402, index: 0, region: circle, latitude_deg: 47.3989, longitude_deg: 8.5472 })],
      fenceReturnPoint: null,
      fenceSelection: { kind: "region", regionUiId: 402 },
    });

    expect(circleView.fenceRadiusHandles).toHaveLength(1);
    const movedRadius = resolveMissionMapFenceRadiusHandleDrag(circleView, circleView.fenceRadiusHandles[0]!.id, { x: 820, y: 140 });
    const staleRadius = resolveMissionMapFenceRadiusHandleDrag(circleView, "missing-fence-radius", { x: 820, y: 140 });

    expect(movedRadius.status).toBe("applied");
    if (movedRadius.status === "applied") {
      expect(movedRadius.radius_m).toBeGreaterThan(0);
      expect(movedRadius.radius_m).not.toBe(circleView.fenceRadiusHandles[0]!.radius_m);
    }
    expect(staleRadius).toMatchObject({
      status: "rejected",
      reason: "handle-not-found",
    });
  });

  it("drops malformed fence geometry and degrades instead of drawing the wrong region or return point", () => {
    const view = buildMissionMapView({
      mode: "fence",
      home: null,
      missionItems: [],
      survey: createSurveyDraftExtension(),
      selection: selection(),
      fenceDraftItems: [
        makeFenceDraftItem({
          uiId: 501,
          index: 0,
          region: circleRegion(47.3989, 8.5472, 0, false),
          latitude_deg: 47.3989,
          longitude_deg: 8.5472,
        }),
      ],
      fenceReturnPoint: { latitude_deg: 999, longitude_deg: 8.5478 },
      fenceSelection: { kind: "return-point" },
    });

    expect(view.state).toBe("degraded");
    expect(view.counts.fenceFeatures).toBe(0);
    expect(view.fenceReturnPoint).toBeNull();
    expect(view.warnings.some((warning) => warning.includes("invalid circle center or radius"))).toBe(true);
    expect(view.warnings.some((warning) => warning.includes("Fence return point was malformed"))).toBe(true);
  });
});

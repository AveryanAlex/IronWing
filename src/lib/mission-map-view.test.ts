import { describe, expect, it } from "vitest";

import type { TypedDraftItem } from "./mission-draft-typed";
import {
  buildMissionMapView,
  missionMapMarkerIdForUiId,
  resolveMissionMapDrag,
  type MissionMapSelection,
} from "./mission-map-view";
import { defaultGeoPoint3d, type HomePosition, type MissionCommand, type MissionItem } from "./mavkit-types";
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
});

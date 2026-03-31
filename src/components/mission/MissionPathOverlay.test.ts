import { describe, expect, it, vi } from "vitest";

import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import {
  defaultGeoPoint3d,
  type HomePosition,
  type MissionCommand,
  type MissionItem,
} from "../../lib/mavkit-types";
import { latLonFromBearingDistance } from "../../lib/mission-coordinates";
import { buildMissionRenderFeatures } from "../../lib/mission-path-render";
import {
  ensureMissionPathLayers,
  MISSION_PATH_LABEL_LAYER_ID,
  MISSION_PATH_LINE_LAYER_ID,
  MISSION_PATH_LOITER_ARROW_LAYER_ID,
  MISSION_PATH_LOITER_FILL_LAYER_ID,
  MISSION_PATH_LOITER_STROKE_LAYER_ID,
  MISSION_PATH_SOURCE_ID,
  missionRenderFeaturesToGeoJson,
  removeMissionPathLayers,
  updateMissionPathSource,
} from "./MissionPathOverlay";

function makeMissionItem(command: MissionCommand): MissionItem {
  return {
    command,
    current: false,
    autocontinue: true,
  };
}

function makeDraftItem(index: number, command: MissionCommand): TypedDraftItem {
  return {
    uiId: index + 1,
    index,
    document: makeMissionItem(command),
    readOnly: false,
    preview: {
      latitude_deg: null,
      longitude_deg: null,
      altitude_m: null,
    },
  };
}

function waypoint(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      Waypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s: 0,
        acceptance_radius_m: 1,
        pass_radius_m: 0,
        yaw_deg: 0,
      },
    },
  });
}

function splineWaypoint(index: number, lat: number, lon: number): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      SplineWaypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        hold_time_s: 0,
      },
    },
  });
}

function arcWaypoint(
  index: number,
  lat: number,
  lon: number,
  arc_angle_deg: number,
  direction: "Clockwise" | "CounterClockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      ArcWaypoint: {
        position: defaultGeoPoint3d(lat, lon, 30),
        arc_angle_deg,
        direction,
      },
    },
  });
}

function loiterTurns(
  index: number,
  lat: number,
  lon: number,
  radius_m: number,
  direction: "Clockwise" | "CounterClockwise" = "Clockwise",
): TypedDraftItem {
  return makeDraftItem(index, {
    Nav: {
      LoiterTurns: {
        position: defaultGeoPoint3d(lat, lon, 30),
        turns: 1,
        radius_m,
        direction,
        exit_xtrack: false,
      },
    },
  });
}

function offsetPoint(
  reference: Pick<HomePosition, "latitude_deg" | "longitude_deg">,
  bearing_deg: number,
  distance_m: number,
): { lat: number; lon: number } {
  return latLonFromBearingDistance(reference, bearing_deg, distance_m);
}

class MockGeoJSONSource {
  setData = vi.fn();
}

class MockMap {
  addSource = vi.fn((id: string) => {
    this.sources.set(id, new MockGeoJSONSource());
  });

  addLayer = vi.fn((layer: { id: string; layout?: Record<string, unknown> }) => {
    this.layers.set(layer.id, layer);
  });

  getSource(id: string) {
    return this.sources.get(id);
  }

  getLayer(id: string) {
    return this.layers.get(id);
  }

  removeSource = vi.fn((id: string) => {
    this.sources.delete(id);
  });

  removeLayer = vi.fn((id: string) => {
    this.layers.delete(id);
  });

  setLayoutProperty = vi.fn((id: string, name: string, value: unknown) => {
    const layer = this.layers.get(id);
    if (!layer) return;
    layer.layout = { ...(layer.layout ?? {}), [name]: value };
  });

  readonly sources = new Map<string, MockGeoJSONSource>();
  readonly layers = new Map<string, { id: string; layout?: Record<string, unknown> }>();
}

describe("missionRenderFeaturesToGeoJson", () => {
  const home: HomePosition = {
    latitude_deg: 47.3769,
    longitude_deg: 8.5417,
    altitude_m: 488,
  };

  it("converts straight, curved, loiter, and label render features into one FeatureCollection", () => {
    const wp1 = offsetPoint(home, 90, 100);
    const spline1 = offsetPoint(home, 60, 220);
    const arcTarget = offsetPoint(home, 45, 320);
    const loiterPoint = offsetPoint(home, 90, 430);

    const renderFeatures = buildMissionRenderFeatures(home, [
      waypoint(0, wp1.lat, wp1.lon),
      splineWaypoint(1, spline1.lat, spline1.lon),
      arcWaypoint(2, arcTarget.lat, arcTarget.lon, 60, "CounterClockwise"),
      loiterTurns(3, loiterPoint.lat, loiterPoint.lon, 80),
    ]);

    const geoJson = missionRenderFeaturesToGeoJson(renderFeatures);

    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.features).toHaveLength(
      renderFeatures.legs.length + renderFeatures.loiterCircles.length + renderFeatures.labels.length,
    );

    const lineFeatures = geoJson.features.filter(
      (feature) => feature.geometry.type === "LineString",
    );
    const polygonFeatures = geoJson.features.filter(
      (feature) => feature.geometry.type === "Polygon",
    );
    const pointFeatures = geoJson.features.filter(
      (feature) => feature.geometry.type === "Point",
    );

    expect(lineFeatures).toHaveLength(renderFeatures.legs.length);
    expect(polygonFeatures).toHaveLength(1);
    expect(pointFeatures).toHaveLength(renderFeatures.labels.length);

    const splineFeature = lineFeatures.find((feature) => feature.properties?.kind === "spline");
    expect(splineFeature).toBeDefined();
    expect((splineFeature?.geometry as GeoJSON.LineString).coordinates.length).toBeGreaterThan(2);
    expect(splineFeature?.properties).toMatchObject({
      kind: "spline",
      isSpline: true,
      isArc: false,
    });

    const arcFeature = lineFeatures.find((feature) => feature.properties?.kind === "arc");
    expect(arcFeature).toBeDefined();
    expect((arcFeature?.geometry as GeoJSON.LineString).coordinates.length).toBeGreaterThan(2);
    expect(arcFeature?.properties).toMatchObject({
      kind: "arc",
      isSpline: false,
      isArc: true,
    });

    expect(polygonFeatures[0]?.properties).toMatchObject({
      kind: "loiter",
      direction: "Clockwise",
      radius_m: 80,
      usesDefaultRadius: false,
      itemIndex: 3,
    });
    expect((polygonFeatures[0]?.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(65);

    const labelFeature = pointFeatures[0];
    expect(labelFeature?.properties).toMatchObject({
      kind: "label",
    });
    expect(String(labelFeature?.properties?.label)).toContain("°");
    expect(String(labelFeature?.properties?.label)).toContain("•");
  });
});

describe("MissionPathOverlay layer management", () => {
  it("adds the source and all overlay layers idempotently", () => {
    const map = new MockMap();

    ensureMissionPathLayers(map as never, false);
    ensureMissionPathLayers(map as never, true);

    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(5);
    expect(map.getSource(MISSION_PATH_SOURCE_ID)).toBeDefined();
    expect(map.getLayer(MISSION_PATH_LINE_LAYER_ID)).toBeDefined();
    expect(map.getLayer(MISSION_PATH_LOITER_FILL_LAYER_ID)).toBeDefined();
    expect(map.getLayer(MISSION_PATH_LOITER_STROKE_LAYER_ID)).toBeDefined();
    expect(map.getLayer(MISSION_PATH_LOITER_ARROW_LAYER_ID)).toBeDefined();
    expect(map.getLayer(MISSION_PATH_LABEL_LAYER_ID)).toBeDefined();
    expect(map.layers.get(MISSION_PATH_LABEL_LAYER_ID)?.layout?.visibility).toBe("visible");
  });

  it("updates the GeoJSON source and keeps label visibility in sync", () => {
    const map = new MockMap();
    ensureMissionPathLayers(map as never, true);

    const renderFeatures = buildMissionRenderFeatures(
      { latitude_deg: 47.3769, longitude_deg: 8.5417, altitude_m: 488 },
      [waypoint(0, 47.377, 8.543)],
    );

    updateMissionPathSource(map as never, renderFeatures, false);

    const source = map.getSource(MISSION_PATH_SOURCE_ID);
    expect(source?.setData).toHaveBeenCalledTimes(1);
    const [payload] = source?.setData.mock.calls[0] ?? [];
    expect(payload.type).toBe("FeatureCollection");
    expect(payload.features).toHaveLength(2);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      MISSION_PATH_LABEL_LAYER_ID,
      "visibility",
      "none",
    );
  });

  it("removes overlay layers before removing the source", () => {
    const map = new MockMap();
    ensureMissionPathLayers(map as never, true);

    removeMissionPathLayers(map as never);

    expect(map.removeLayer.mock.calls.map(([id]) => id)).toEqual([
      MISSION_PATH_LABEL_LAYER_ID,
      MISSION_PATH_LOITER_ARROW_LAYER_ID,
      MISSION_PATH_LOITER_STROKE_LAYER_ID,
      MISSION_PATH_LOITER_FILL_LAYER_ID,
      MISSION_PATH_LINE_LAYER_ID,
    ]);
    expect(map.removeSource).toHaveBeenCalledWith(MISSION_PATH_SOURCE_ID);
    expect(map.getLayer(MISSION_PATH_LABEL_LAYER_ID)).toBeUndefined();
    expect(map.getSource(MISSION_PATH_SOURCE_ID)).toBeUndefined();
  });
});

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { MissionRenderFeatures } from "../../lib/mission-path-render";

export const MISSION_PATH_SOURCE_ID = "mission-path";
export const MISSION_PATH_LINE_LAYER_ID = "mission-path-lines";
export const MISSION_PATH_LOITER_FILL_LAYER_ID = "mission-path-loiter-fill";
export const MISSION_PATH_LOITER_STROKE_LAYER_ID = "mission-path-loiter-stroke";
export const MISSION_PATH_LOITER_ARROW_LAYER_ID = "mission-path-loiter-arrows";
export const MISSION_PATH_LABEL_LAYER_ID = "mission-path-labels";

type MissionPathFeatureProperties = {
  kind: "straight" | "spline" | "arc" | "loiter" | "label";
  itemIndex?: number | null;
  fromItemIndex?: number | null;
  toItemIndex?: number | null;
  isSpline?: boolean;
  isArc?: boolean;
  isLandingLeg?: boolean;
  segmentStatus?: string;
  direction?: string;
  radius_m?: number;
  usesDefaultRadius?: boolean;
  label?: string;
  distanceText?: string;
  bearingText?: string;
  distance_m?: number;
  bearing_deg?: number;
};

function emptyMissionPathGeoJson(): GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionPathFeatureProperties> {
  return { type: "FeatureCollection", features: [] };
}

export function missionRenderFeaturesToGeoJson(
  features: MissionRenderFeatures,
): GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionPathFeatureProperties> {
  const geoJsonFeatures: GeoJSON.Feature<GeoJSON.Geometry, MissionPathFeatureProperties>[] = [];

  for (const leg of features.legs) {
    geoJsonFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: leg.coordinates,
      },
      properties: {
        kind: leg.kind,
        fromItemIndex: leg.from.itemIndex,
        toItemIndex: leg.to.itemIndex,
        isSpline: leg.isSpline,
        isArc: leg.isArc,
        isLandingLeg: leg.isLandingLeg,
        segmentStatus: leg.segmentStatus,
      },
    });
  }

  for (const circle of features.loiterCircles) {
    geoJsonFeatures.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: circle.coordinates,
      },
      properties: {
        kind: circle.kind,
        itemIndex: circle.itemIndex,
        direction: circle.direction,
        radius_m: circle.radius_m,
        usesDefaultRadius: circle.usesDefaultRadius,
      },
    });
  }

  for (const label of features.labels) {
    geoJsonFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: label.coordinate,
      },
      properties: {
        kind: label.kind,
        itemIndex: label.itemIndex,
        label: label.text,
        distanceText: label.distanceText,
        bearingText: label.bearingText,
        distance_m: label.distance_m,
        bearing_deg: label.bearing_deg,
        isSpline: label.isSpline,
        isArc: label.isArc,
        isLandingLeg: label.isLandingLeg,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: geoJsonFeatures,
  };
}

/** Ensure the mission path source and layers exist on the map. Idempotent. */
export function ensureMissionPathLayers(
  map: MapLibreMap,
  showLabels = true,
): void {
  if (!map.getSource(MISSION_PATH_SOURCE_ID)) {
    map.addSource(MISSION_PATH_SOURCE_ID, {
      type: "geojson",
      data: emptyMissionPathGeoJson(),
    });
  }

  if (!map.getLayer(MISSION_PATH_LINE_LAYER_ID)) {
    map.addLayer({
      id: MISSION_PATH_LINE_LAYER_ID,
      type: "line",
      source: MISSION_PATH_SOURCE_ID,
      filter: ["match", ["get", "kind"], ["straight", "spline", "arc"], true, false],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "isLandingLeg"], false],
          "#f59e0b",
          "#78d6ff",
        ],
        "line-width": [
          "case",
          ["==", ["get", "segmentStatus"], "active"], 5,
          4,
        ],
        "line-opacity": [
          "case",
          ["==", ["get", "segmentStatus"], "completed"], 0.35,
          ["==", ["get", "segmentStatus"], "active"], 1,
          0.85,
        ],
      },
    } as any);
  }

  if (!map.getLayer(MISSION_PATH_LOITER_FILL_LAYER_ID)) {
    map.addLayer({
      id: MISSION_PATH_LOITER_FILL_LAYER_ID,
      type: "fill",
      source: MISSION_PATH_SOURCE_ID,
      filter: ["==", ["get", "kind"], "loiter"],
      paint: {
        "fill-color": "#78d6ff",
        "fill-opacity": 0.08,
      },
    } as any);
  }

  if (!map.getLayer(MISSION_PATH_LOITER_STROKE_LAYER_ID)) {
    map.addLayer({
      id: MISSION_PATH_LOITER_STROKE_LAYER_ID,
      type: "line",
      source: MISSION_PATH_SOURCE_ID,
      filter: ["==", ["get", "kind"], "loiter"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#78d6ff",
        "line-width": 1.5,
        "line-dasharray": [4, 3],
      },
    } as any);
  }

  if (!map.getLayer(MISSION_PATH_LOITER_ARROW_LAYER_ID)) {
    map.addLayer({
      id: MISSION_PATH_LOITER_ARROW_LAYER_ID,
      type: "symbol",
      source: MISSION_PATH_SOURCE_ID,
      filter: ["==", ["get", "kind"], "loiter"],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 80,
        "text-field": "▸",
        "text-size": 14,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-rotation-alignment": "map",
        "text-keep-upright": false,
      },
      paint: {
        "text-color": "#78d6ff",
      },
    } as any);
  }

  if (!map.getLayer(MISSION_PATH_LABEL_LAYER_ID)) {
    map.addLayer({
      id: MISSION_PATH_LABEL_LAYER_ID,
      type: "symbol",
      source: MISSION_PATH_SOURCE_ID,
      filter: ["==", ["get", "kind"], "label"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "center",
        visibility: showLabels ? "visible" : "none",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(15, 23, 42, 0.95)",
        "text-halo-width": 1.25,
      },
    } as any);
  }

  if (map.getLayer(MISSION_PATH_LABEL_LAYER_ID)) {
    map.setLayoutProperty(
      MISSION_PATH_LABEL_LAYER_ID,
      "visibility",
      showLabels ? "visible" : "none",
    );
  }
}

/** Update the mission path GeoJSON source data. */
export function updateMissionPathSource(
  map: MapLibreMap,
  features: MissionRenderFeatures,
  showLabels = true,
): void {
  const source = map.getSource(MISSION_PATH_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  source.setData(missionRenderFeaturesToGeoJson(features));

  if (map.getLayer(MISSION_PATH_LABEL_LAYER_ID)) {
    map.setLayoutProperty(
      MISSION_PATH_LABEL_LAYER_ID,
      "visibility",
      showLabels ? "visible" : "none",
    );
  }
}

/** Remove mission path layers and source from the map. */
export function removeMissionPathLayers(map: MapLibreMap): void {
  for (const layerId of [
    MISSION_PATH_LABEL_LAYER_ID,
    MISSION_PATH_LOITER_ARROW_LAYER_ID,
    MISSION_PATH_LOITER_STROKE_LAYER_ID,
    MISSION_PATH_LOITER_FILL_LAYER_ID,
    MISSION_PATH_LINE_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  if (map.getSource(MISSION_PATH_SOURCE_ID)) {
    map.removeSource(MISSION_PATH_SOURCE_ID);
  }
}

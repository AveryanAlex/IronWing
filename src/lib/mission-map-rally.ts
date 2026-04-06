import type { GeoRef } from "./mission-coordinates";
import type { TypedDraftItem } from "./mission-draft-typed";
import { geoPoint3dAltitude, geoPoint3dLatLon, type GeoPoint3d } from "./mavkit-types";

export type MissionMapRallySelection =
  | { kind: "none" }
  | { kind: "point"; pointUiId: number | null };

export type MissionMapRallyGeoJsonProperties = {
  source: "rally";
  kind: "rally_point";
  uiId?: number | null;
  label?: string;
  selected?: boolean;
  draggable?: boolean;
  readOnly?: boolean;
  altitudeFrame?: "msl" | "rel_home" | "terrain";
};

export type MissionMapRallyMarkerCandidate = {
  id: string;
  kind: "rally-point";
  label: string;
  latitude_deg: number;
  longitude_deg: number;
  draggable: boolean;
  selected: boolean;
  current: boolean;
  readOnly: boolean;
  uiId: number;
  index: number;
  altitudeFrame: "msl" | "rel_home" | "terrain";
  altitude_m: number;
};

export type MissionMapRallyCounts = {
  pointCount: number;
  featureCount: number;
  selectedPointUiId: number | null;
  frameCounts: Record<"msl" | "rel_home" | "terrain", number>;
};

export type MissionMapRallyModel = {
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Point, MissionMapRallyGeoJsonProperties>;
  markerCandidates: MissionMapRallyMarkerCandidate[];
  warnings: string[];
  referenceCoordinates: GeoRef[];
  counts: MissionMapRallyCounts;
};

export function missionMapRallyMarkerIdForUiId(uiId: number): string {
  return `rally-${uiId}`;
}

export function buildMissionMapRallyModel(input: {
  points: TypedDraftItem[];
  selection: MissionMapRallySelection;
}): MissionMapRallyModel {
  const warnings = new Set<string>();
  const markerCandidates: MissionMapRallyMarkerCandidate[] = [];
  const features: Array<GeoJSON.Feature<GeoJSON.Point, MissionMapRallyGeoJsonProperties>> = [];
  const referenceCoordinates: GeoRef[] = [];
  const selection = normalizeRallySelection(input.selection, input.points);
  const frameCounts: MissionMapRallyCounts["frameCounts"] = {
    msl: 0,
    rel_home: 0,
    terrain: 0,
  };

  for (const pointItem of input.points) {
    const point = pointItem.document as GeoPoint3d;
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(point);
    if (!isValidGeoPoint({ latitude_deg, longitude_deg })) {
      warnings.add(`Rally point ${pointItem.index + 1} was malformed, so IronWing left it out of the active map render instead of selecting or moving the wrong point.`);
      continue;
    }

    const altitude = geoPoint3dAltitude(point);
    frameCounts[altitude.frame] += 1;
    referenceCoordinates.push({ latitude_deg, longitude_deg });

    const marker = {
      id: missionMapRallyMarkerIdForUiId(pointItem.uiId),
      kind: "rally-point" as const,
      label: `R${pointItem.index + 1}`,
      latitude_deg,
      longitude_deg,
      draggable: !pointItem.readOnly,
      selected: selection.kind === "point" && selection.pointUiId === pointItem.uiId,
      current: false,
      readOnly: pointItem.readOnly,
      uiId: pointItem.uiId,
      index: pointItem.index,
      altitudeFrame: altitude.frame,
      altitude_m: altitude.value,
    } satisfies MissionMapRallyMarkerCandidate;

    markerCandidates.push(marker);
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [longitude_deg, latitude_deg],
      },
      properties: {
        source: "rally",
        kind: "rally_point",
        uiId: pointItem.uiId,
        label: marker.label,
        selected: marker.selected,
        draggable: marker.draggable,
        readOnly: marker.readOnly,
        altitudeFrame: marker.altitudeFrame,
      },
    });
  }

  return {
    geoJson: {
      type: "FeatureCollection",
      features,
    },
    markerCandidates,
    warnings: [...warnings],
    referenceCoordinates,
    counts: {
      pointCount: input.points.length,
      featureCount: features.length,
      selectedPointUiId: selection.kind === "point" ? selection.pointUiId : null,
      frameCounts,
    },
  };
}

export function normalizeRallySelection(
  selection: MissionMapRallySelection,
  points: TypedDraftItem[],
): MissionMapRallySelection {
  if (selection.kind === "none") {
    return selection;
  }

  return points.some((item) => item.uiId === selection.pointUiId)
    ? selection
    : { kind: "none" };
}

function isValidGeoPoint(point: { latitude_deg: number; longitude_deg: number } | null | undefined): point is GeoRef {
  return !!point
    && Number.isFinite(point.latitude_deg)
    && Number.isFinite(point.longitude_deg)
    && point.latitude_deg >= -90
    && point.latitude_deg <= 90
    && point.longitude_deg >= -180
    && point.longitude_deg <= 180;
}

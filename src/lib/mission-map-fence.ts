import type { GeoRef } from "./mission-coordinates";
import { localXYToLatLon } from "./mission-coordinates";
import type { TypedDraftItem } from "./mission-draft-typed";
import type { FenceRegion, GeoPoint2d } from "./mavkit-types";

const METERS_PER_DEG_LAT = 111_320;
const CIRCLE_VERTEX_COUNT = 48;

export type MissionMapFenceSelection =
  | { kind: "none" }
  | { kind: "region"; regionUiId: number | null }
  | { kind: "return-point" };

export type MissionMapFenceGeoJsonProperties = {
  source: "fence";
  kind: string;
  regionUiId?: number | null;
  selected?: boolean;
  label?: string;
  inclusion?: boolean;
  geometryKind?: "polygon" | "circle";
  returnPoint?: boolean;
};

export type MissionMapFenceRegionHandleCandidate = {
  id: string;
  regionUiId: number;
  label: string;
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
  inclusion: boolean;
  geometryKind: "polygon" | "circle";
  draggable: boolean;
};

export type MissionMapFenceVertexHandleCandidate = {
  id: string;
  regionUiId: number;
  index: number;
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
};

export type MissionMapFenceRadiusHandleCandidate = {
  id: string;
  regionUiId: number;
  latitude_deg: number;
  longitude_deg: number;
  radius_m: number;
  selected: boolean;
};

export type MissionMapFenceReturnPointCandidate = {
  id: "fence-return-point";
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
};

export type MissionMapFenceCounts = {
  regionCount: number;
  featureCount: number;
  regionHandles: number;
  vertexHandles: number;
  radiusHandles: number;
  hasReturnPoint: boolean;
  featureKinds: Record<string, number>;
};

export type MissionMapFenceModel = {
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapFenceGeoJsonProperties>;
  regionHandles: MissionMapFenceRegionHandleCandidate[];
  vertexHandles: MissionMapFenceVertexHandleCandidate[];
  radiusHandles: MissionMapFenceRadiusHandleCandidate[];
  returnPoint: MissionMapFenceReturnPointCandidate | null;
  warnings: string[];
  referenceCoordinates: GeoRef[];
  counts: MissionMapFenceCounts;
};

export function buildMissionMapFenceModel(input: {
  regions: TypedDraftItem[];
  returnPoint: GeoPoint2d | null;
  selection: MissionMapFenceSelection;
}): MissionMapFenceModel {
  const warnings = new Set<string>();
  const features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapFenceGeoJsonProperties>> = [];
  const regionHandles: MissionMapFenceRegionHandleCandidate[] = [];
  const vertexHandles: MissionMapFenceVertexHandleCandidate[] = [];
  const radiusHandles: MissionMapFenceRadiusHandleCandidate[] = [];
  const featureKinds: Record<string, number> = {};
  const referenceCoordinates: GeoRef[] = [];
  const selection = normalizeFenceSelection(input.selection, input.regions, input.returnPoint);

  for (const regionItem of input.regions) {
    const region = regionItem.document as FenceRegion;
    const descriptor = describeRegion(region);
    const selected = selection.kind === "region" && selection.regionUiId === regionItem.uiId;
    const pushFeature = (
      feature: GeoJSON.Feature<GeoJSON.Geometry, MissionMapFenceGeoJsonProperties>,
      kind: string,
    ) => {
      features.push(feature);
      featureKinds[kind] = (featureKinds[kind] ?? 0) + 1;
    };

    if (descriptor.geometryKind === "polygon") {
      const validVertices = sanitizePoints(
        descriptor.vertices,
        `Fence region ${regionItem.index + 1}`,
        warnings,
        "vertex",
      );
      validVertices.forEach((point) => referenceCoordinates.push(point));

      if (validVertices.length >= 3) {
        pushFeature(makePolygonFeature(regionItem.uiId, descriptor, selected, validVertices), descriptor.kind);
      } else if (validVertices.length >= 2) {
        pushFeature(makeLineFeature(regionItem.uiId, descriptor, selected, validVertices, `${descriptor.kind}_draft`), `${descriptor.kind}_draft`);
        warnings.add(`Fence region ${regionItem.index + 1} has an incomplete polygon, so IronWing kept only the valid draft edge visible on the planner map.`);
      } else {
        warnings.add(`Fence region ${regionItem.index + 1} has no plottable polygon vertices, so IronWing kept the remaining planner geometry visible.`);
      }

      const handlePoint = averagePoint(validVertices);
      if (handlePoint) {
        referenceCoordinates.push(handlePoint);
        regionHandles.push({
          id: `fence-region-${regionItem.uiId}`,
          regionUiId: regionItem.uiId,
          label: `${descriptor.inclusion ? "I" : "E"}${regionItem.index + 1}`,
          latitude_deg: handlePoint.latitude_deg,
          longitude_deg: handlePoint.longitude_deg,
          selected,
          inclusion: descriptor.inclusion,
          geometryKind: "polygon",
          draggable: false,
        });
      }

      if (selected) {
        validVertices.forEach((point, index) => {
          vertexHandles.push({
            id: `fence-vertex-${regionItem.uiId}-${index}`,
            regionUiId: regionItem.uiId,
            index,
            latitude_deg: point.latitude_deg,
            longitude_deg: point.longitude_deg,
            selected,
          });
        });
      }

      continue;
    }

    const center = isValidGeoPoint(descriptor.center) ? descriptor.center : null;
    const radius_m = Number.isFinite(descriptor.radius_m) ? descriptor.radius_m : NaN;
    if (!center || !Number.isFinite(radius_m) || radius_m <= 0) {
      warnings.add(`Fence region ${regionItem.index + 1} had an invalid circle center or radius, so IronWing left it out of the active fence render instead of drawing the wrong area.`);
      continue;
    }

    const polygon = circleToPolygonPoints(center, radius_m);
    polygon.forEach((point) => referenceCoordinates.push(point));
    pushFeature(makePolygonFeature(regionItem.uiId, descriptor, selected, polygon), descriptor.kind);
    referenceCoordinates.push(center);

    regionHandles.push({
      id: `fence-region-${regionItem.uiId}`,
      regionUiId: regionItem.uiId,
      label: `${descriptor.inclusion ? "I" : "E"}${regionItem.index + 1}`,
      latitude_deg: center.latitude_deg,
      longitude_deg: center.longitude_deg,
      selected,
      inclusion: descriptor.inclusion,
      geometryKind: "circle",
      draggable: true,
    });

    if (selected) {
      const radiusHandle = circleRadiusHandlePoint(center, radius_m);
      referenceCoordinates.push(radiusHandle);
      radiusHandles.push({
        id: `fence-radius-${regionItem.uiId}`,
        regionUiId: regionItem.uiId,
        latitude_deg: radiusHandle.latitude_deg,
        longitude_deg: radiusHandle.longitude_deg,
        radius_m,
        selected,
      });
    }
  }

  const returnPoint = isValidGeoPoint(input.returnPoint)
    ? {
      id: "fence-return-point" as const,
      latitude_deg: input.returnPoint.latitude_deg,
      longitude_deg: input.returnPoint.longitude_deg,
      selected: selection.kind === "return-point",
    }
    : null;

  if (input.returnPoint && !returnPoint) {
    warnings.add("Fence return point was malformed, so IronWing left it out of the active map render instead of drawing the wrong position.");
  }

  if (returnPoint) {
    referenceCoordinates.push(returnPoint);
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [returnPoint.longitude_deg, returnPoint.latitude_deg],
      },
      properties: {
        source: "fence",
        kind: "fence_return_point",
        selected: returnPoint.selected,
        label: "R",
        returnPoint: true,
      },
    });
    featureKinds.fence_return_point = (featureKinds.fence_return_point ?? 0) + 1;
  }

  return {
    geoJson: {
      type: "FeatureCollection",
      features,
    },
    regionHandles,
    vertexHandles,
    radiusHandles,
    returnPoint,
    warnings: [...warnings],
    referenceCoordinates,
    counts: {
      regionCount: input.regions.length,
      featureCount: features.length,
      regionHandles: regionHandles.length,
      vertexHandles: vertexHandles.length,
      radiusHandles: radiusHandles.length,
      hasReturnPoint: returnPoint !== null,
      featureKinds,
    },
  };
}

export function normalizeFenceSelection(
  selection: MissionMapFenceSelection,
  regions: TypedDraftItem[],
  returnPoint: GeoPoint2d | null,
): MissionMapFenceSelection {
  if (selection.kind === "return-point") {
    return isValidGeoPoint(returnPoint) ? selection : { kind: "none" };
  }

  if (selection.kind === "region") {
    return regions.some((item) => item.uiId === selection.regionUiId) ? selection : { kind: "none" };
  }

  return selection;
}

function describeRegion(region: FenceRegion): {
  kind: string;
  geometryKind: "polygon" | "circle";
  inclusion: boolean;
  vertices: GeoPoint2d[];
  center: GeoPoint2d | null;
  radius_m: number;
} {
  if ("inclusion_polygon" in region) {
    return {
      kind: "fence_inclusion_polygon",
      geometryKind: "polygon",
      inclusion: true,
      vertices: region.inclusion_polygon.vertices,
      center: null,
      radius_m: 0,
    };
  }

  if ("exclusion_polygon" in region) {
    return {
      kind: "fence_exclusion_polygon",
      geometryKind: "polygon",
      inclusion: false,
      vertices: region.exclusion_polygon.vertices,
      center: null,
      radius_m: 0,
    };
  }

  if ("inclusion_circle" in region) {
    return {
      kind: "fence_inclusion_circle",
      geometryKind: "circle",
      inclusion: true,
      vertices: [],
      center: region.inclusion_circle.center,
      radius_m: region.inclusion_circle.radius_m,
    };
  }

  return {
    kind: "fence_exclusion_circle",
    geometryKind: "circle",
    inclusion: false,
    vertices: [],
    center: region.exclusion_circle.center,
    radius_m: region.exclusion_circle.radius_m,
  };
}

function sanitizePoints(
  points: GeoPoint2d[],
  label: string,
  warnings: Set<string>,
  pointLabel: string,
): GeoPoint2d[] {
  const valid: GeoPoint2d[] = [];
  let dropped = 0;

  for (const point of points) {
    if (!isValidGeoPoint(point)) {
      dropped += 1;
      continue;
    }

    valid.push({
      latitude_deg: point.latitude_deg,
      longitude_deg: point.longitude_deg,
    });
  }

  if (dropped > 0) {
    warnings.add(`${label} dropped ${dropped} malformed ${pointLabel}${dropped === 1 ? "" : "s"} before IronWing projected the fence overlay.`);
  }

  return valid;
}

function makePolygonFeature(
  regionUiId: number,
  descriptor: ReturnType<typeof describeRegion>,
  selected: boolean,
  points: GeoPoint2d[],
): GeoJSON.Feature<GeoJSON.Polygon, MissionMapFenceGeoJsonProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [closeRing(points).map(toGeoJsonCoordinate)],
    },
    properties: {
      source: "fence",
      kind: descriptor.kind,
      regionUiId,
      selected,
      inclusion: descriptor.inclusion,
      geometryKind: descriptor.geometryKind,
    },
  };
}

function makeLineFeature(
  regionUiId: number,
  descriptor: ReturnType<typeof describeRegion>,
  selected: boolean,
  points: GeoPoint2d[],
  kind: string,
): GeoJSON.Feature<GeoJSON.LineString, MissionMapFenceGeoJsonProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: points.map(toGeoJsonCoordinate),
    },
    properties: {
      source: "fence",
      kind,
      regionUiId,
      selected,
      inclusion: descriptor.inclusion,
      geometryKind: descriptor.geometryKind,
    },
  };
}

function circleToPolygonPoints(center: GeoPoint2d, radius_m: number): GeoPoint2d[] {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((center.latitude_deg * Math.PI) / 180);
  const ring: GeoPoint2d[] = [];

  for (let index = 0; index < CIRCLE_VERTEX_COUNT; index += 1) {
    const angle = (2 * Math.PI * index) / CIRCLE_VERTEX_COUNT;
    const dLat = (radius_m * Math.cos(angle)) / METERS_PER_DEG_LAT;
    const dLon = metersPerDegLon === 0 ? 0 : (radius_m * Math.sin(angle)) / metersPerDegLon;
    ring.push({
      latitude_deg: center.latitude_deg + dLat,
      longitude_deg: center.longitude_deg + dLon,
    });
  }

  return closeRing(ring);
}

function circleRadiusHandlePoint(center: GeoPoint2d, radius_m: number): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(center, radius_m, 0);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

function averagePoint(points: GeoPoint2d[]): GeoPoint2d | null {
  if (points.length === 0) {
    return null;
  }

  const totals = points.reduce(
    (sum, point) => ({
      latitude_deg: sum.latitude_deg + point.latitude_deg,
      longitude_deg: sum.longitude_deg + point.longitude_deg,
    }),
    { latitude_deg: 0, longitude_deg: 0 },
  );

  return {
    latitude_deg: totals.latitude_deg / points.length,
    longitude_deg: totals.longitude_deg / points.length,
  };
}

function closeRing(points: GeoPoint2d[]): GeoPoint2d[] {
  if (points.length === 0) {
    return [];
  }

  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) {
    return ring;
  }

  if (first.latitude_deg !== last.latitude_deg || first.longitude_deg !== last.longitude_deg) {
    ring.push({ ...first });
  }

  return ring;
}

function toGeoJsonCoordinate(point: GeoPoint2d): [number, number] {
  return [point.longitude_deg, point.latitude_deg];
}

function isValidGeoPoint(point: GeoPoint2d | null | undefined): point is GeoPoint2d {
  return !!point
    && Number.isFinite(point.latitude_deg)
    && Number.isFinite(point.longitude_deg)
    && point.latitude_deg >= -90
    && point.latitude_deg <= 90
    && point.longitude_deg >= -180
    && point.longitude_deg <= 180;
}

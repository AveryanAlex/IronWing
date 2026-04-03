import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import { latLonToLocalXY, localXYToLatLon } from "../../lib/mission-coordinates";
import type { GeoPoint2d } from "../../lib/mavkit-types";
import {
  surveyTransectsToGeoJson,
  type SurveyTransectFeatureProperties,
} from "../../lib/survey-preview";
import type { SurveyTransect } from "../../lib/survey-grid";

export const SURVEY_POLYGON_SOURCE = "survey-polygon";
export const SURVEY_POLYGON_FILL_LAYER = "survey-polygon-fill";
export const SURVEY_POLYGON_LINE_LAYER = "survey-polygon-line";
export const SURVEY_TRANSECT_SOURCE = "survey-transects";
export const SURVEY_TRANSECT_LAYER = "survey-transects-line";
export const SURVEY_COVERAGE_SOURCE = "survey-coverage";
export const SURVEY_COVERAGE_FILL_LAYER = "survey-coverage-fill";
export const SURVEY_COVERAGE_LINE_LAYER = "survey-coverage-line";
export const SURVEY_CENTERLINE_SOURCE = "survey-centerline";
export const SURVEY_CENTERLINE_LAYER = "survey-centerline-line";
export const SURVEY_ORBIT_RING_SOURCE = "survey-orbit-rings";
export const SURVEY_ORBIT_RING_LAYER = "survey-orbit-rings-line";
export const SURVEY_ORBIT_LABEL_SOURCE = "survey-orbit-labels";
export const SURVEY_ORBIT_LABEL_LAYER = "survey-orbit-labels-symbol";

type LocalPoint = { x: number; y: number };

type SurveyPolygonFeatureProperties = {
  kind: "survey_region";
};

type SurveyCoverageFeatureProperties = {
  kind: "coverage";
  crosshatch: boolean;
  laneSpacing_m: number;
};

type SurveyCenterlineFeatureProperties = {
  kind: "centerline";
};

type SurveyOrbitRingFeatureProperties = {
  kind: "orbit_ring";
  layerIndex: number;
  altitude_m: number;
  opacity: number;
  color: string;
};

type SurveyOrbitLabelFeatureProperties = {
  kind: "orbit_label";
  layerIndex: number;
  altitude_m: number;
  label: string;
};

export type SurveyOverlayData = {
  patternType?: "grid" | "corridor" | "structure";
  polygon: GeoPoint2d[];
  centerline?: GeoPoint2d[];
  corridorPolygon?: GeoPoint2d[];
  transects: SurveyTransect[];
  crosshatchTransects: SurveyTransect[];
  laneSpacing_m: number;
  layerSpacing_m?: number;
  orbitRings?: GeoPoint2d[][];
  orbitLabels?: Array<{ point: GeoPoint2d; altitude_m: number }>;
};

declare global {
  interface Window {
    __IRONWING_SURVEY_DEBUG__?: {
      patternType?: "grid" | "corridor" | "structure";
      polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties>;
      transectsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyTransectFeatureProperties>;
      coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties>;
      centerlineGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyCenterlineFeatureProperties>;
      orbitRingsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyOrbitRingFeatureProperties>;
      orbitLabelsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point, SurveyOrbitLabelFeatureProperties>;
      surveyUpdateCount: number;
    };
  }
}

function emptyPolygonCollection<T extends Record<string, unknown>>(): GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  T
> {
  return { type: "FeatureCollection", features: [] };
}

function emptyTransectCollection(): GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  SurveyTransectFeatureProperties
> {
  return { type: "FeatureCollection", features: [] };
}

function emptyLineCollection<T extends Record<string, unknown>>(): GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  T
> {
  return { type: "FeatureCollection", features: [] };
}

function emptyPointCollection<T extends Record<string, unknown>>(): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  T
> {
  return { type: "FeatureCollection", features: [] };
}

function closeRing(points: LocalPoint[]): LocalPoint[] {
  if (points.length === 0) {
    return [];
  }

  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!last || last.x !== first?.x || last.y !== first?.y) {
    ring.push({ ...first });
  }
  return ring;
}

function averageReference(points: GeoPoint2d[]): GeoPoint2d {
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

function toLocalPoints(points: GeoPoint2d[], reference: GeoPoint2d): LocalPoint[] {
  return points.map((point) => {
    const { x_m, y_m } = latLonToLocalXY(reference, point.latitude_deg, point.longitude_deg);
    return { x: x_m, y: y_m };
  });
}

function toGeoRing(points: LocalPoint[], reference: GeoPoint2d): [number, number][] {
  return closeRing(points).map((point) => {
    const { lat, lon } = localXYToLatLon(reference, point.x, point.y);
    return [lon, lat];
  });
}

function cross(origin: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function uniqueLocalPoints(points: LocalPoint[]): LocalPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function convexHull(points: LocalPoint[]): LocalPoint[] {
  if (points.length <= 2) {
    return [...points];
  }

  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const lower: LocalPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: LocalPoint[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function signedArea(points: LocalPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const point = points[index];
    if (!point || !next) {
      continue;
    }
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function normalize(vector: LocalPoint): LocalPoint {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function lineIntersection(
  aPoint: LocalPoint,
  aDirection: LocalPoint,
  bPoint: LocalPoint,
  bDirection: LocalPoint,
): LocalPoint | null {
  const denominator = aDirection.x * bDirection.y - aDirection.y * bDirection.x;
  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const delta = { x: bPoint.x - aPoint.x, y: bPoint.y - aPoint.y };
  const t = (delta.x * bDirection.y - delta.y * bDirection.x) / denominator;
  return {
    x: aPoint.x + aDirection.x * t,
    y: aPoint.y + aDirection.y * t,
  };
}

function bufferConvexHull(points: LocalPoint[], buffer_m: number): LocalPoint[] {
  if (points.length === 0) {
    return [];
  }

  if (points.length === 1) {
    const point = points[0]!;
    return [
      { x: point.x - buffer_m, y: point.y - buffer_m },
      { x: point.x + buffer_m, y: point.y - buffer_m },
      { x: point.x + buffer_m, y: point.y + buffer_m },
      { x: point.x - buffer_m, y: point.y + buffer_m },
    ];
  }

  if (points.length === 2) {
    const [start, end] = points;
    const direction = normalize({ x: end!.x - start!.x, y: end!.y - start!.y });
    const normal = { x: direction.y, y: -direction.x };
    return [
      { x: start!.x - direction.x * buffer_m + normal.x * buffer_m, y: start!.y - direction.y * buffer_m + normal.y * buffer_m },
      { x: end!.x + direction.x * buffer_m + normal.x * buffer_m, y: end!.y + direction.y * buffer_m + normal.y * buffer_m },
      { x: end!.x + direction.x * buffer_m - normal.x * buffer_m, y: end!.y + direction.y * buffer_m - normal.y * buffer_m },
      { x: start!.x - direction.x * buffer_m - normal.x * buffer_m, y: start!.y - direction.y * buffer_m - normal.y * buffer_m },
    ];
  }

  const hull = signedArea(points) >= 0 ? [...points] : [...points].reverse();

  return hull.map((point, index) => {
    const previous = hull[(index - 1 + hull.length) % hull.length]!;
    const next = hull[(index + 1) % hull.length]!;

    const previousDirection = normalize({ x: point.x - previous.x, y: point.y - previous.y });
    const nextDirection = normalize({ x: next.x - point.x, y: next.y - point.y });

    const previousNormal = { x: previousDirection.y, y: -previousDirection.x };
    const nextNormal = { x: nextDirection.y, y: -nextDirection.x };

    const previousOffsetPoint = {
      x: previous.x + previousNormal.x * buffer_m,
      y: previous.y + previousNormal.y * buffer_m,
    };
    const currentPreviousOffsetPoint = {
      x: point.x + previousNormal.x * buffer_m,
      y: point.y + previousNormal.y * buffer_m,
    };
    const currentNextOffsetPoint = {
      x: point.x + nextNormal.x * buffer_m,
      y: point.y + nextNormal.y * buffer_m,
    };
    const nextOffsetPoint = {
      x: next.x + nextNormal.x * buffer_m,
      y: next.y + nextNormal.y * buffer_m,
    };

    const intersection = lineIntersection(
      previousOffsetPoint,
      { x: currentPreviousOffsetPoint.x - previousOffsetPoint.x, y: currentPreviousOffsetPoint.y - previousOffsetPoint.y },
      currentNextOffsetPoint,
      { x: nextOffsetPoint.x - currentNextOffsetPoint.x, y: nextOffsetPoint.y - currentNextOffsetPoint.y },
    );

    if (intersection) {
      return intersection;
    }

    const bisector = normalize({
      x: previousNormal.x + nextNormal.x,
      y: previousNormal.y + nextNormal.y,
    });
    return {
      x: point.x + bisector.x * buffer_m,
      y: point.y + bisector.y * buffer_m,
    };
  });
}

function polygonToFeature<T extends Record<string, unknown>>(
  polygon: GeoPoint2d[],
  properties: T,
): GeoJSON.Feature<GeoJSON.Polygon, T> | null {
  if (polygon.length < 3) {
    return null;
  }

  const ring: [number, number][] = polygon.map((point) => [point.longitude_deg, point.latitude_deg]);
  if (ring.length > 0) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(first);
    }
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties,
  };
}

function centerlineToFeature(
  line: GeoPoint2d[],
): GeoJSON.Feature<GeoJSON.LineString, SurveyCenterlineFeatureProperties> | null {
  if (line.length < 2) {
    return null;
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: line.map((point) => [point.longitude_deg, point.latitude_deg]),
    },
    properties: {
      kind: "centerline",
    },
  };
}

function ringToCoordinates(ring: GeoPoint2d[]): [number, number][] {
  const coordinates = ring.map((point) => [point.longitude_deg, point.latitude_deg] as [number, number]);
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push(first);
  }

  return coordinates;
}

function orbitRingColor(layerIndex: number, layerCount: number): string {
  const palette = ["#c084fc", "#a855f7", "#8b5cf6", "#7c3aed", "#6d28d9"];
  if (layerCount <= 1) {
    return palette[0]!;
  }

  const ratio = Math.max(0, Math.min(1, layerIndex / Math.max(layerCount - 1, 1)));
  return palette[Math.min(palette.length - 1, Math.round(ratio * (palette.length - 1)))]!;
}

function orbitRingOpacity(layerIndex: number, layerCount: number): number {
  if (layerCount <= 1) {
    return 0.95;
  }

  return 0.45 + (layerIndex / Math.max(layerCount - 1, 1)) * 0.45;
}

function altitudeLabel(altitude_m: number): string {
  return `${Math.round(altitude_m).toLocaleString()} m`;
}

function orbitRingsToGeoJson(
  orbitRings: GeoPoint2d[][],
  orbitLabels: Array<{ point: GeoPoint2d; altitude_m: number }>,
): GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyOrbitRingFeatureProperties> {
  const features = orbitRings.flatMap((ring, layerIndex) => {
    if (ring.length < 2) {
      return [];
    }

    const altitude_m = orbitLabels[layerIndex]?.altitude_m ?? 0;
    return [{
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: ringToCoordinates(ring),
      },
      properties: {
        kind: "orbit_ring",
        layerIndex,
        altitude_m,
        opacity: orbitRingOpacity(layerIndex, orbitRings.length),
        color: orbitRingColor(layerIndex, orbitRings.length),
      },
    } satisfies GeoJSON.Feature<GeoJSON.LineString, SurveyOrbitRingFeatureProperties>];
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function orbitLabelsToGeoJson(
  orbitLabels: Array<{ point: GeoPoint2d; altitude_m: number }>,
): GeoJSON.FeatureCollection<GeoJSON.Point, SurveyOrbitLabelFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: orbitLabels.map(({ point, altitude_m }, layerIndex) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.longitude_deg, point.latitude_deg],
      },
      properties: {
        kind: "orbit_label",
        layerIndex,
        altitude_m,
        label: altitudeLabel(altitude_m),
      },
    })),
  };
}

export function computeCoveragePolygon(
  transects: SurveyTransect[],
  crosshatch: boolean,
  laneSpacing_m: number,
): GeoJSON.Feature<GeoJSON.Polygon, SurveyCoverageFeatureProperties> | null {
  const endpoints = transects.flatMap((transect) => {
    if (transect.length < 2) {
      return [];
    }
    return [transect[0]!, transect[transect.length - 1]!];
  });

  if (endpoints.length === 0) {
    return null;
  }

  const reference = averageReference(endpoints);
  const hull = convexHull(uniqueLocalPoints(toLocalPoints(endpoints, reference)));
  const buffer_m = Number.isFinite(laneSpacing_m) && laneSpacing_m > 0 ? laneSpacing_m / 2 : 0;
  const bufferedHull = bufferConvexHull(hull, buffer_m);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [toGeoRing(bufferedHull, reference)],
    },
    properties: {
      kind: "coverage",
      crosshatch,
      laneSpacing_m,
    },
  };
}

function publishSurveyDebugGeoJson(
  patternType: "grid" | "corridor" | "structure" | undefined,
  polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties>,
  transectsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyTransectFeatureProperties>,
  coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties>,
  centerlineGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyCenterlineFeatureProperties>,
  orbitRingsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyOrbitRingFeatureProperties>,
  orbitLabelsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point, SurveyOrbitLabelFeatureProperties>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const maybeMockWindow = window as Window & { __IRONWING_MOCK_PLATFORM__?: unknown };
  if (!maybeMockWindow.__IRONWING_MOCK_PLATFORM__) {
    return;
  }

  const previousUpdateCount = window.__IRONWING_SURVEY_DEBUG__?.surveyUpdateCount ?? 0;
  window.__IRONWING_SURVEY_DEBUG__ = {
    patternType,
    polygonGeoJson,
    transectsGeoJson,
    coverageGeoJson,
    centerlineGeoJson,
    orbitRingsGeoJson,
    orbitLabelsGeoJson,
    surveyUpdateCount: previousUpdateCount + 1,
  };
}

export function ensureSurveyLayers(map: MapLibreMap): void {
  if (!map.getSource(SURVEY_POLYGON_SOURCE)) {
    map.addSource(SURVEY_POLYGON_SOURCE, {
      type: "geojson",
      data: emptyPolygonCollection<SurveyPolygonFeatureProperties>(),
    });
  }

  if (!map.getSource(SURVEY_TRANSECT_SOURCE)) {
    map.addSource(SURVEY_TRANSECT_SOURCE, {
      type: "geojson",
      data: emptyTransectCollection(),
    });
  }

  if (!map.getSource(SURVEY_COVERAGE_SOURCE)) {
    map.addSource(SURVEY_COVERAGE_SOURCE, {
      type: "geojson",
      data: emptyPolygonCollection<SurveyCoverageFeatureProperties>(),
    });
  }

  if (!map.getSource(SURVEY_CENTERLINE_SOURCE)) {
    map.addSource(SURVEY_CENTERLINE_SOURCE, {
      type: "geojson",
      data: emptyLineCollection<SurveyCenterlineFeatureProperties>(),
    });
  }

  if (!map.getSource(SURVEY_ORBIT_RING_SOURCE)) {
    map.addSource(SURVEY_ORBIT_RING_SOURCE, {
      type: "geojson",
      data: emptyLineCollection<SurveyOrbitRingFeatureProperties>(),
    });
  }

  if (!map.getSource(SURVEY_ORBIT_LABEL_SOURCE)) {
    map.addSource(SURVEY_ORBIT_LABEL_SOURCE, {
      type: "geojson",
      data: emptyPointCollection<SurveyOrbitLabelFeatureProperties>(),
    });
  }

  if (!map.getLayer(SURVEY_POLYGON_FILL_LAYER)) {
    map.addLayer({
      id: SURVEY_POLYGON_FILL_LAYER,
      type: "fill",
      source: SURVEY_POLYGON_SOURCE,
      paint: {
        "fill-color": "#78d6ff",
        "fill-opacity": 0.08,
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_POLYGON_LINE_LAYER)) {
    map.addLayer({
      id: SURVEY_POLYGON_LINE_LAYER,
      type: "line",
      source: SURVEY_POLYGON_SOURCE,
      paint: {
        "line-color": "#78d6ff",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_COVERAGE_FILL_LAYER)) {
    map.addLayer({
      id: SURVEY_COVERAGE_FILL_LAYER,
      type: "fill",
      source: SURVEY_COVERAGE_SOURCE,
      paint: {
        "fill-color": ["case", ["get", "crosshatch"], "#22c55e", "#84cc16"],
        "fill-opacity": 0.18,
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_COVERAGE_LINE_LAYER)) {
    map.addLayer({
      id: SURVEY_COVERAGE_LINE_LAYER,
      type: "line",
      source: SURVEY_COVERAGE_SOURCE,
      paint: {
        "line-color": ["case", ["get", "crosshatch"], "#22c55e", "#84cc16"],
        "line-width": 2,
        "line-opacity": 0.85,
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_CENTERLINE_LAYER)) {
    map.addLayer({
      id: SURVEY_CENTERLINE_LAYER,
      type: "line",
      source: SURVEY_CENTERLINE_SOURCE,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#78d6ff",
        "line-width": 2,
        "line-dasharray": [2, 2],
        "line-opacity": 0.85,
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_ORBIT_RING_LAYER)) {
    map.addLayer({
      id: SURVEY_ORBIT_RING_LAYER,
      type: "line",
      source: SURVEY_ORBIT_RING_SOURCE,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#8b5cf6"],
        "line-width": 2.5,
        "line-dasharray": [3, 2],
        "line-opacity": ["coalesce", ["get", "opacity"], 0.85],
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_ORBIT_LABEL_LAYER)) {
    map.addLayer({
      id: SURVEY_ORBIT_LABEL_LAYER,
      type: "symbol",
      source: SURVEY_ORBIT_LABEL_SOURCE,
      minzoom: 11,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "left",
        "text-offset": [0.9, 0],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#f5f3ff",
        "text-halo-color": "rgba(15, 23, 42, 0.95)",
        "text-halo-width": 1.25,
      },
    } as never);
  }

  if (!map.getLayer(SURVEY_TRANSECT_LAYER)) {
    map.addLayer({
      id: SURVEY_TRANSECT_LAYER,
      type: "line",
      source: SURVEY_TRANSECT_SOURCE,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["case", ["==", ["get", "kind"], "crosshatch"], "#22c55e", "#d9f99d"],
        "line-width": 2,
        "line-dasharray": [4, 3],
        "line-opacity": 0.9,
      },
    } as never);
  }
}

export function updateSurveyOverlay(map: MapLibreMap, data: SurveyOverlayData | null): void {
  const polygonSource = map.getSource(SURVEY_POLYGON_SOURCE) as GeoJSONSource | undefined;
  const transectSource = map.getSource(SURVEY_TRANSECT_SOURCE) as GeoJSONSource | undefined;
  const coverageSource = map.getSource(SURVEY_COVERAGE_SOURCE) as GeoJSONSource | undefined;
  const centerlineSource = map.getSource(SURVEY_CENTERLINE_SOURCE) as GeoJSONSource | undefined;
  const orbitRingSource = map.getSource(SURVEY_ORBIT_RING_SOURCE) as GeoJSONSource | undefined;
  const orbitLabelSource = map.getSource(SURVEY_ORBIT_LABEL_SOURCE) as GeoJSONSource | undefined;
  if (!polygonSource || !transectSource || !coverageSource || !centerlineSource || !orbitRingSource || !orbitLabelSource) {
    return;
  }

  const polygonFeature = data
    ? polygonToFeature<SurveyPolygonFeatureProperties>(data.polygon, { kind: "survey_region" })
    : null;
  const polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties> = polygonFeature
    ? { type: "FeatureCollection", features: [polygonFeature] }
    : emptyPolygonCollection<SurveyPolygonFeatureProperties>();

  const transectsGeoJson = data
    ? data.patternType === "structure"
      ? emptyTransectCollection()
      : surveyTransectsToGeoJson(data.transects, data.crosshatchTransects)
    : emptyTransectCollection();

  const coverageFeature = data
    ? data.patternType === "corridor"
      ? polygonToFeature<SurveyCoverageFeatureProperties>(
        data.corridorPolygon ?? [],
        {
          kind: "coverage",
          crosshatch: false,
          laneSpacing_m: data.laneSpacing_m,
        },
      )
      : data.patternType === "structure"
        ? null
        : computeCoveragePolygon(
          [...data.transects, ...data.crosshatchTransects],
          data.crosshatchTransects.length > 0,
          data.laneSpacing_m,
        )
    : null;
  const coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties> = coverageFeature
    ? { type: "FeatureCollection", features: [coverageFeature] }
    : emptyPolygonCollection<SurveyCoverageFeatureProperties>();

  const centerlineFeature = data?.patternType === "corridor"
    ? centerlineToFeature(data.centerline ?? [])
    : null;
  const centerlineGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyCenterlineFeatureProperties> = centerlineFeature
    ? { type: "FeatureCollection", features: [centerlineFeature] }
    : emptyLineCollection<SurveyCenterlineFeatureProperties>();

  const orbitRingsGeoJson = data?.patternType === "structure"
    ? orbitRingsToGeoJson(data.orbitRings ?? [], data.orbitLabels ?? [])
    : emptyLineCollection<SurveyOrbitRingFeatureProperties>();

  const orbitLabelsGeoJson = data?.patternType === "structure"
    ? orbitLabelsToGeoJson(data.orbitLabels ?? [])
    : emptyPointCollection<SurveyOrbitLabelFeatureProperties>();

  polygonSource.setData(polygonGeoJson);
  transectSource.setData(transectsGeoJson);
  coverageSource.setData(coverageGeoJson);
  centerlineSource.setData(centerlineGeoJson);
  orbitRingSource.setData(orbitRingsGeoJson);
  orbitLabelSource.setData(orbitLabelsGeoJson);
  publishSurveyDebugGeoJson(
    data?.patternType,
    polygonGeoJson,
    transectsGeoJson,
    coverageGeoJson,
    centerlineGeoJson,
    orbitRingsGeoJson,
    orbitLabelsGeoJson,
  );
}

export function removeSurveyLayers(map: MapLibreMap): void {
  for (const layerId of [
    SURVEY_TRANSECT_LAYER,
    SURVEY_ORBIT_LABEL_LAYER,
    SURVEY_ORBIT_RING_LAYER,
    SURVEY_CENTERLINE_LAYER,
    SURVEY_COVERAGE_LINE_LAYER,
    SURVEY_COVERAGE_FILL_LAYER,
    SURVEY_POLYGON_LINE_LAYER,
    SURVEY_POLYGON_FILL_LAYER,
  ]) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  for (const sourceId of [
    SURVEY_TRANSECT_SOURCE,
    SURVEY_ORBIT_LABEL_SOURCE,
    SURVEY_ORBIT_RING_SOURCE,
    SURVEY_CENTERLINE_SOURCE,
    SURVEY_COVERAGE_SOURCE,
    SURVEY_POLYGON_SOURCE,
  ]) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }
}

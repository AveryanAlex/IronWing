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

type LocalPoint = { x: number; y: number };

type SurveyPolygonFeatureProperties = {
  kind: "survey_region";
};

type SurveyCoverageFeatureProperties = {
  kind: "coverage";
  crosshatch: boolean;
  laneSpacing_m: number;
};

export type SurveyOverlayData = {
  polygon: GeoPoint2d[];
  transects: SurveyTransect[];
  crosshatchTransects: SurveyTransect[];
  laneSpacing_m: number;
};

declare global {
  interface Window {
    __IRONWING_SURVEY_DEBUG__?: {
      polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties>;
      transectsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyTransectFeatureProperties>;
      coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties>;
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

function polygonToFeature(
  polygon: GeoPoint2d[],
): GeoJSON.Feature<GeoJSON.Polygon, SurveyPolygonFeatureProperties> | null {
  if (polygon.length < 3) {
    return null;
  }

  const ring: [number, number][] = polygon.map((point) => [point.longitude_deg, point.latitude_deg]);
  ring.push(ring[0]!);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties: {
      kind: "survey_region",
    },
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
  polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties>,
  transectsGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString, SurveyTransectFeatureProperties>,
  coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties>,
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
    polygonGeoJson,
    transectsGeoJson,
    coverageGeoJson,
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
  if (!polygonSource || !transectSource || !coverageSource) {
    return;
  }

  const polygonFeature = data ? polygonToFeature(data.polygon) : null;
  const polygonGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyPolygonFeatureProperties> = polygonFeature
    ? { type: "FeatureCollection", features: [polygonFeature] }
    : emptyPolygonCollection<SurveyPolygonFeatureProperties>();

  const transectsGeoJson = data
    ? surveyTransectsToGeoJson(data.transects, data.crosshatchTransects)
    : emptyTransectCollection();

  const coverageFeature = data
    ? computeCoveragePolygon(
        [...data.transects, ...data.crosshatchTransects],
        data.crosshatchTransects.length > 0,
        data.laneSpacing_m,
      )
    : null;
  const coverageGeoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon, SurveyCoverageFeatureProperties> = coverageFeature
    ? { type: "FeatureCollection", features: [coverageFeature] }
    : emptyPolygonCollection<SurveyCoverageFeatureProperties>();

  polygonSource.setData(polygonGeoJson);
  transectSource.setData(transectsGeoJson);
  coverageSource.setData(coverageGeoJson);
  publishSurveyDebugGeoJson(polygonGeoJson, transectsGeoJson, coverageGeoJson);
}

export function removeSurveyLayers(map: MapLibreMap): void {
  for (const layerId of [
    SURVEY_TRANSECT_LAYER,
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
    SURVEY_COVERAGE_SOURCE,
    SURVEY_POLYGON_SOURCE,
  ]) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }
}

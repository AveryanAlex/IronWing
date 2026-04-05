import type { GeoRef } from "./mission-coordinates";
import type { GeoPoint2d } from "./mavkit-types";
import { imageFootprint } from "./survey-camera";
import { findCamera } from "./survey-camera-catalog";
import {
  shouldUseSwathLod,
  surveyFootprints,
  surveyPhotocenters,
  surveySwathBands,
  surveyTransectsToGeoJson,
} from "./survey-preview";
import type { SurveyDraftExtension, SurveyPatternType, SurveyRegion } from "./survey-region";

export type MissionMapSurveyGeoJsonProperties = {
  source: "survey";
  kind: string;
  regionId: string;
  selected: boolean;
  label?: string;
  preview?: boolean;
  previewSet?: "geometry" | "footprints" | "swath" | "transects" | "orbits";
};

export type MissionMapSurveyRegionHandleCandidate = {
  regionId: string;
  label: string;
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
  patternType: SurveyPatternType;
  featureCount: number;
};

export type MissionMapSurveyVertexHandleCandidate = {
  id: string;
  regionId: string;
  index: number;
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
  patternType: SurveyPatternType;
  geometryKind: "polygon" | "polyline";
};

export type MissionMapSurveyCounts = {
  regionCount: number;
  regionHandles: number;
  vertexHandles: number;
  previewFeatures: number;
  previewFeatureKinds: Record<string, number>;
};

export type MissionMapSurveyModel = {
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapSurveyGeoJsonProperties>;
  regionHandles: MissionMapSurveyRegionHandleCandidate[];
  vertexHandles: MissionMapSurveyVertexHandleCandidate[];
  warnings: string[];
  referenceCoordinates: GeoRef[];
  counts: MissionMapSurveyCounts;
};

export function minimumSurveyPointCount(patternType: SurveyPatternType): number {
  return patternType === "corridor" ? 2 : 3;
}

export function surveyGeometryKind(region: SurveyRegion): "polygon" | "polyline" {
  return region.patternType === "corridor" ? "polyline" : "polygon";
}

export function surveyGeometryPoints(region: SurveyRegion): GeoPoint2d[] {
  return surveyGeometryKind(region) === "polyline" ? region.polyline : region.polygon;
}

export function setSurveyGeometryPoints(region: SurveyRegion, points: GeoPoint2d[]): SurveyRegion {
  return surveyGeometryKind(region) === "polyline"
    ? { ...region, polyline: points }
    : { ...region, polygon: points };
}

export function buildMissionMapSurveyModel(input: {
  survey: SurveyDraftExtension;
  selectedRegionId: string | null;
}): MissionMapSurveyModel {
  const warnings = new Set<string>();
  const features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapSurveyGeoJsonProperties>> = [];
  const regionHandles: MissionMapSurveyRegionHandleCandidate[] = [];
  const vertexHandles: MissionMapSurveyVertexHandleCandidate[] = [];
  const referenceCoordinates: GeoRef[] = [];
  const previewFeatureKinds: Record<string, number> = {};

  const orderedBlocks = input.survey.surveyRegionOrder
    .map((block, index) => ({ block, index }))
    .sort((left, right) => left.block.position - right.block.position || left.index - right.index);

  for (const { block } of orderedBlocks) {
    const region = input.survey.surveyRegions.get(block.regionId);
    if (!region) {
      warnings.add(`Survey block ${block.regionId} is still referenced in order metadata but its geometry is missing.`);
      continue;
    }

    const selected = input.selectedRegionId === region.id;
    const pushCount = features.length;
    const validGeometry = sanitizePoints(
      surveyGeometryPoints(region),
      `Survey block ${region.id}`,
      warnings,
      region.patternType === "corridor" ? "centerline point" : "polygon vertex",
    );
    const validCorridorPolygon = sanitizePoints(
      region.corridorPolygon,
      `Survey block ${region.id}`,
      warnings,
      "corridor polygon point",
    );

    validGeometry.forEach((point) => referenceCoordinates.push(point));
    validCorridorPolygon.forEach((point) => referenceCoordinates.push(point));

    const vertexGeometryKind = surveyGeometryKind(region);
    if (selected) {
      for (const [index, point] of validGeometry.entries()) {
        vertexHandles.push({
          id: `${region.id}-${vertexGeometryKind}-${index}`,
          regionId: region.id,
          index,
          latitude_deg: point.latitude_deg,
          longitude_deg: point.longitude_deg,
          selected,
          patternType: region.patternType,
          geometryKind: vertexGeometryKind,
        });
      }
    }

    if (region.patternType === "corridor") {
      if (validGeometry.length >= 2) {
        features.push(makeLineFeature(region.id, selected, "survey_polyline", validGeometry));
      } else if (validGeometry.length > 0) {
        warnings.add(`Survey block ${region.id} has an incomplete centerline and only valid survey geometry will render.`);
      }

      if (validCorridorPolygon.length >= 3) {
        features.push(makePolygonFeature(region.id, selected, "survey_corridor", validCorridorPolygon));
      } else if (validCorridorPolygon.length > 0) {
        warnings.add(`Survey block ${region.id} has an incomplete corridor polygon and IronWing kept the rest of the map visible.`);
      }
    } else {
      if (validGeometry.length >= 3) {
        features.push(makePolygonFeature(region.id, selected, "survey_polygon", validGeometry));
      } else if (validGeometry.length >= 2) {
        features.push(makeLineFeature(region.id, selected, "survey_polygon_draft", validGeometry));
        warnings.add(`Survey block ${region.id} has an incomplete polygon and only valid geometry will remain visible on the map.`);
      } else if (validGeometry.length > 0) {
        warnings.add(`Survey block ${region.id} has an incomplete polygon and only valid geometry will remain visible on the map.`);
      }
    }

    const preview = buildSurveyPreviewFeatures(region, selected, warnings);
    preview.features.forEach((feature) => {
      features.push(feature);
      const kind = feature.properties.kind;
      previewFeatureKinds[kind] = (previewFeatureKinds[kind] ?? 0) + 1;
    });

    const handlePoint = resolveRegionHandlePoint(region, validGeometry, validCorridorPolygon, preview.referenceCoordinates);
    if (!handlePoint || features.length === pushCount) {
      warnings.add(`Survey block ${region.id} has no plottable geometry, so IronWing kept the last valid mission view visible around it.`);
      continue;
    }

    referenceCoordinates.push(handlePoint);
    regionHandles.push({
      regionId: region.id,
      label: region.patternType === "corridor"
        ? "C"
        : region.patternType === "structure"
          ? "S"
          : "G",
      latitude_deg: handlePoint.latitude_deg,
      longitude_deg: handlePoint.longitude_deg,
      selected,
      patternType: region.patternType,
      featureCount: features.length - pushCount,
    });
  }

  return {
    geoJson: {
      type: "FeatureCollection",
      features,
    },
    regionHandles,
    vertexHandles,
    warnings: [...warnings],
    referenceCoordinates,
    counts: {
      regionCount: orderedBlocks.length,
      regionHandles: regionHandles.length,
      vertexHandles: vertexHandles.length,
      previewFeatures: Object.values(previewFeatureKinds).reduce((sum, value) => sum + value, 0),
      previewFeatureKinds,
    },
  };
}

function buildSurveyPreviewFeatures(
  region: SurveyRegion,
  selected: boolean,
  warnings: Set<string>,
): {
  features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapSurveyGeoJsonProperties>>;
  referenceCoordinates: GeoRef[];
} {
  const features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapSurveyGeoJsonProperties>> = [];
  const referenceCoordinates: GeoRef[] = [];

  try {
    const transectsGeoJson = surveyTransectsToGeoJson(region.generatedTransects, region.generatedCrosshatch);
    for (const feature of transectsGeoJson.features) {
      const line = sanitizeLineCoordinates(
        feature.geometry.coordinates.map(([longitude_deg, latitude_deg]) => ({ latitude_deg, longitude_deg })),
        `Survey block ${region.id}`,
        warnings,
        feature.properties.kind === "crosshatch" ? "crosshatch point" : "transect point",
      );
      if (line.length < 2) {
        continue;
      }

      line.forEach((point) => referenceCoordinates.push(point));
      features.push(makeLineFeature(
        region.id,
        selected,
        feature.properties.kind === "crosshatch" ? "survey_crosshatch" : "survey_transect",
        line,
        {
          preview: true,
          previewSet: "transects",
          label: `${feature.properties.kind}-${feature.properties.index + 1}`,
        },
      ));
    }
  } catch (error) {
    warnings.add(`Survey block ${region.id} preview transects failed to render, so IronWing kept the authored region geometry visible.`);
    void error;
  }

  for (const [index, layer] of region.generatedLayers.entries()) {
    const orbit = sanitizeLineCoordinates(
      layer.orbitPoints,
      `Survey block ${region.id}`,
      warnings,
      "orbit point",
    );
    if (orbit.length < 2) {
      continue;
    }

    orbit.forEach((point) => referenceCoordinates.push(point));
    features.push(makeLineFeature(region.id, selected, "survey_orbit", orbit, {
      preview: true,
      previewSet: "orbits",
      label: `layer-${index + 1}`,
    }));
  }

  const generatedStats = region.generatedStats;
  if (!generatedStats || region.generatedTransects.length === 0) {
    return { features, referenceCoordinates };
  }

  const camera = resolvePreviewCamera(region);
  if (!camera) {
    warnings.add(`Survey block ${region.id} preview needs a resolved camera before footprint overlays can render. The underlying region remains visible.`);
    return { features, referenceCoordinates };
  }

  const triggerDistance_m = generatedStats.triggerDistance_m;
  if (!Number.isFinite(triggerDistance_m) || triggerDistance_m <= 0) {
    warnings.add(`Survey block ${region.id} preview is missing a usable trigger distance, so IronWing kept only the authored region and transects visible.`);
    return { features, referenceCoordinates };
  }

  const laneSpacing_m = "laneSpacing_m" in generatedStats && typeof generatedStats.laneSpacing_m === "number"
    ? generatedStats.laneSpacing_m
    : null;
  if (shouldUseSwathLod(generatedStats.photoCount)) {
    if (laneSpacing_m === null || !Number.isFinite(laneSpacing_m) || laneSpacing_m <= 0) {
      warnings.add(`Survey block ${region.id} preview is missing a usable lane spacing, so dense footprint overlays were skipped safely.`);
      return { features, referenceCoordinates };
    }

    try {
      const swathBands = surveySwathBands(
        region.generatedTransects,
        laneSpacing_m,
        resolveTrackAngle(region.generatedTransects, region.params.trackAngle_deg),
      );
      appendPreviewPolygons(features, referenceCoordinates, warnings, region, selected, swathBands, "survey_swath_band", "swath");
    } catch (error) {
      warnings.add(`Survey block ${region.id} swath-band preview failed, so IronWing kept the authored region and transects visible.`);
      void error;
    }

    return { features, referenceCoordinates };
  }

  try {
    const photocenters = surveyPhotocenters(region.generatedTransects, triggerDistance_m);
    const footprints = surveyFootprints(
      photocenters,
      imageFootprint(camera, region.params.altitude_m, region.params.orientation),
      resolveTrackAngle(region.generatedTransects, region.params.trackAngle_deg),
    );
    appendPreviewPolygons(features, referenceCoordinates, warnings, region, selected, footprints, "survey_footprint", "footprints");
  } catch (error) {
    warnings.add(`Survey block ${region.id} footprint preview failed, so IronWing kept the authored region and transects visible.`);
    void error;
  }

  return { features, referenceCoordinates };
}

function appendPreviewPolygons(
  features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapSurveyGeoJsonProperties>>,
  referenceCoordinates: GeoRef[],
  warnings: Set<string>,
  region: SurveyRegion,
  selected: boolean,
  previewFeatures: GeoJSON.Feature<GeoJSON.Polygon>[],
  kind: string,
  previewSet: MissionMapSurveyGeoJsonProperties["previewSet"],
): void {
  for (const previewFeature of previewFeatures) {
    const polygon = sanitizePolygonCoordinates(
      previewFeature.geometry.coordinates[0]?.map(([longitude_deg, latitude_deg]) => ({ latitude_deg, longitude_deg })) ?? [],
      `Survey block ${region.id}`,
      warnings,
      `${kind} point`,
    );
    if (polygon.length < 3) {
      continue;
    }

    polygon.forEach((point) => referenceCoordinates.push(point));
    features.push(makePolygonFeature(region.id, selected, kind, polygon, {
      preview: true,
      previewSet,
    }));
  }
}

function resolvePreviewCamera(region: SurveyRegion) {
  if (region.camera) {
    return region.camera;
  }

  if (!region.cameraId) {
    return null;
  }

  return findCamera(region.cameraId) ?? null;
}

function resolveTrackAngle(transects: GeoPoint2d[][], fallback_deg: number): number {
  for (const transect of transects) {
    const start = transect[0];
    const end = transect[transect.length - 1];
    if (!start || !end || !isValidGeoPoint(start) || !isValidGeoPoint(end)) {
      continue;
    }

    const deltaLon = end.longitude_deg - start.longitude_deg;
    const deltaLat = end.latitude_deg - start.latitude_deg;
    if (Math.abs(deltaLon) < 1e-9 && Math.abs(deltaLat) < 1e-9) {
      continue;
    }

    const angle_rad = Math.atan2(deltaLon, deltaLat);
    const angle_deg = (angle_rad * 180) / Math.PI;
    return Number.isFinite(angle_deg) ? angle_deg : fallback_deg;
  }

  return fallback_deg;
}

function resolveRegionHandlePoint(
  region: SurveyRegion,
  validGeometry: GeoPoint2d[],
  validCorridorPolygon: GeoPoint2d[],
  previewReferenceCoordinates: GeoRef[],
): GeoPoint2d | null {
  if (region.patternType === "corridor") {
    return averagePoint(validCorridorPolygon)
      ?? midpointOfPoints(validGeometry)
      ?? previewReferenceCoordinates[0]
      ?? validGeometry[0]
      ?? null;
  }

  return averagePoint(validGeometry)
    ?? previewReferenceCoordinates[0]
    ?? validGeometry[0]
    ?? null;
}

function sanitizeLineCoordinates(
  points: GeoPoint2d[],
  regionLabel: string,
  warnings: Set<string>,
  pointLabel: string,
): GeoPoint2d[] {
  return sanitizePoints(points, regionLabel, warnings, pointLabel);
}

function sanitizePolygonCoordinates(
  ring: GeoPoint2d[],
  regionLabel: string,
  warnings: Set<string>,
  pointLabel: string,
): GeoPoint2d[] {
  const points = sanitizePoints(ring, regionLabel, warnings, pointLabel);
  const closed = closeRing(points);
  return closed.length >= 4 ? closed : points;
}

function sanitizePoints(
  points: GeoPoint2d[],
  regionLabel: string,
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
    warnings.add(`${regionLabel} dropped ${dropped} malformed ${pointLabel}${dropped === 1 ? "" : "s"} before projecting the planner map.`);
  }

  return valid;
}

function makeLineFeature(
  regionId: string,
  selected: boolean,
  kind: string,
  points: GeoPoint2d[],
  extra: Omit<Partial<MissionMapSurveyGeoJsonProperties>, "source" | "kind" | "regionId" | "selected"> = {},
): GeoJSON.Feature<GeoJSON.LineString, MissionMapSurveyGeoJsonProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: points.map(toGeoJsonCoordinate),
    },
    properties: {
      source: "survey",
      kind,
      regionId,
      selected,
      ...extra,
    },
  };
}

function makePolygonFeature(
  regionId: string,
  selected: boolean,
  kind: string,
  points: GeoPoint2d[],
  extra: Omit<Partial<MissionMapSurveyGeoJsonProperties>, "source" | "kind" | "regionId" | "selected"> = {},
): GeoJSON.Feature<GeoJSON.Polygon, MissionMapSurveyGeoJsonProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [closeRing(points).map(toGeoJsonCoordinate)],
    },
    properties: {
      source: "survey",
      kind,
      regionId,
      selected,
      ...extra,
    },
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

function midpointOfPoints(points: GeoPoint2d[]): GeoPoint2d | null {
  if (points.length === 0) {
    return null;
  }

  return points[Math.floor((points.length - 1) / 2)] ?? null;
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

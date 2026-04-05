import type { HomePosition } from "../mission";
import type { TypedDraftItem } from "./mission-draft-typed";
import {
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";
import type { GeoPoint2d, MissionItem } from "./mavkit-types";
import { commandPosition } from "./mavkit-types";
import {
  buildMissionRenderFeatures,
  type MissionRenderCoordinate,
  type MissionRenderFeatures,
} from "./mission-path-render";
import type { SurveyDraftExtension, SurveyPatternType } from "./survey-region";

export const MISSION_MAP_VIEWBOX_SIZE = 1000;
export const MISSION_MAP_HOME_MARKER_ID = "home";

const MIN_SPAN_M = 40;
const PADDING_RATIO = 0.12;
const MIN_PADDING_M = 20;

type MissionMapGeoJsonProperties = {
  source: "mission" | "survey";
  kind: string;
  itemIndex?: number | null;
  uiId?: number | null;
  regionId?: string;
  label?: string;
  selected?: boolean;
  current?: boolean;
  draggable?: boolean;
  readOnly?: boolean;
};

export type MissionMapSelection =
  | { kind: "home" }
  | { kind: "mission-item"; uiId: number | null }
  | { kind: "survey-block"; regionId: string | null };

export type MissionMapPoint = {
  x: number;
  y: number;
};

export type MissionMapViewport = {
  reference: GeoRef;
  minX_m: number;
  maxX_m: number;
  minY_m: number;
  maxY_m: number;
  viewBoxSize: number;
};

export type MissionMapMarker = {
  id: string;
  kind: "home" | "mission-item";
  label: string;
  latitude_deg: number;
  longitude_deg: number;
  point: MissionMapPoint;
  draggable: boolean;
  selected: boolean;
  current: boolean;
  readOnly: boolean;
  uiId: number | null;
  index: number | null;
};

export type MissionMapSurveyHandle = {
  regionId: string;
  label: string;
  point: MissionMapPoint;
  selected: boolean;
  patternType: SurveyPatternType;
  featureCount: number;
};

export type MissionMapLineFeature = {
  id: string;
  kind: string;
  points: MissionMapPoint[];
  selected: boolean;
  itemIndex: number | null;
  regionId: string | null;
};

export type MissionMapPolygonFeature = {
  id: string;
  kind: string;
  rings: MissionMapPoint[][];
  selected: boolean;
  itemIndex: number | null;
  regionId: string | null;
};

export type MissionMapLabelFeature = {
  id: string;
  text: string;
  point: MissionMapPoint;
  itemIndex: number | null;
};

export type MissionMapFeatureCounts = {
  markers: number;
  surveyHandles: number;
  missionFeatures: number;
  surveyFeatures: number;
  missionFeatureKinds: Record<string, number>;
  surveyFeatureKinds: Record<string, number>;
};

export type MissionMapDragResolution =
  | {
    status: "applied";
    marker: MissionMapMarker;
    point: MissionMapPoint;
    latitude_deg: number;
    longitude_deg: number;
  }
  | {
    status: "rejected";
    reason: "marker-not-found" | "marker-not-draggable" | "viewport-unavailable";
    message: string;
  };

export type MissionMapView = {
  state: "empty" | "ready" | "degraded";
  selection: MissionMapSelection;
  viewport: MissionMapViewport | null;
  markers: MissionMapMarker[];
  surveyHandles: MissionMapSurveyHandle[];
  missionLines: MissionMapLineFeature[];
  missionPolygons: MissionMapPolygonFeature[];
  missionLabels: MissionMapLabelFeature[];
  surveyLines: MissionMapLineFeature[];
  surveyPolygons: MissionMapPolygonFeature[];
  missionGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  surveyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  warnings: string[];
  counts: MissionMapFeatureCounts;
};

export type MissionMapViewInput = {
  home: HomePosition | null;
  missionItems: TypedDraftItem[];
  survey: SurveyDraftExtension;
  selection: MissionMapSelection;
  currentSeq?: number | null;
};

type SurveyHandleCandidate = {
  regionId: string;
  label: string;
  latitude_deg: number;
  longitude_deg: number;
  selected: boolean;
  patternType: SurveyPatternType;
  featureCount: number;
};

type SurveyBuildResult = {
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  handles: SurveyHandleCandidate[];
};

export function missionMapMarkerIdForUiId(uiId: number): string {
  return `mission-${uiId}`;
}

export function buildMissionMapView(input: MissionMapViewInput): MissionMapView {
  const warnings: string[] = [];
  const currentSeq = input.currentSeq ?? input.missionItems.find((item) => (item.document as MissionItem).current)?.index ?? null;
  const renderFeatures = buildMissionRenderFeatures(input.home, input.missionItems, {
    currentSeq: currentSeq ?? undefined,
  });
  const missionGeoJson = missionRenderFeaturesToGeoJson(renderFeatures);
  const survey = buildSurveyGeoJson(input.survey, input.selection, warnings);
  const markerCandidates = buildMarkerCandidates(input, warnings);
  const reference = resolveReference(input.home, markerCandidates, missionGeoJson, survey.geoJson);
  const viewport = reference
    ? buildMissionMapViewport(reference, collectAllCoordinates(markerCandidates, missionGeoJson, survey.geoJson))
    : null;

  const markers = viewport
    ? markerCandidates.map((marker) => ({
      ...marker,
      point: projectMissionMapCoordinate(viewport, {
        latitude_deg: marker.latitude_deg,
        longitude_deg: marker.longitude_deg,
      }),
    }))
    : [];

  const surveyHandles = viewport
    ? survey.handles.map((handle) => ({
      ...handle,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const missionLines = viewport ? projectMissionLines(viewport, renderFeatures) : [];
  const missionPolygons = viewport ? projectMissionPolygons(viewport, renderFeatures) : [];
  const missionLabels = viewport ? projectMissionLabels(viewport, renderFeatures) : [];
  const { lines: surveyLines, polygons: surveyPolygons } = viewport
    ? projectSurveyFeatures(viewport, survey.geoJson)
    : { lines: [], polygons: [] };

  const hasRenderableGeometry = markers.length > 0
    || surveyHandles.length > 0
    || missionGeoJson.features.length > 0
    || survey.geoJson.features.length > 0;

  return {
    state: hasRenderableGeometry
      ? warnings.length > 0 ? "degraded" : "ready"
      : warnings.length > 0 ? "degraded" : "empty",
    selection: input.selection,
    viewport,
    markers,
    surveyHandles,
    missionLines,
    missionPolygons,
    missionLabels,
    surveyLines,
    surveyPolygons,
    missionGeoJson,
    surveyGeoJson: survey.geoJson,
    warnings,
    counts: {
      markers: markers.length,
      surveyHandles: surveyHandles.length,
      missionFeatures: missionGeoJson.features.length,
      surveyFeatures: survey.geoJson.features.length,
      missionFeatureKinds: countFeatureKinds(missionGeoJson),
      surveyFeatureKinds: countFeatureKinds(survey.geoJson),
    },
  };
}

export function clampMissionMapPoint(viewport: MissionMapViewport, point: MissionMapPoint): MissionMapPoint {
  return {
    x: clamp(point.x, 0, viewport.viewBoxSize),
    y: clamp(point.y, 0, viewport.viewBoxSize),
  };
}

export function unprojectMissionMapPoint(
  viewport: MissionMapViewport,
  point: MissionMapPoint,
): { latitude_deg: number; longitude_deg: number } {
  const nextPoint = clampMissionMapPoint(viewport, point);
  const xRatio = viewport.viewBoxSize === 0 ? 0 : nextPoint.x / viewport.viewBoxSize;
  const yRatio = viewport.viewBoxSize === 0 ? 0 : 1 - nextPoint.y / viewport.viewBoxSize;
  const x_m = viewport.minX_m + (viewport.maxX_m - viewport.minX_m) * xRatio;
  const y_m = viewport.minY_m + (viewport.maxY_m - viewport.minY_m) * yRatio;
  const { lat, lon } = localXYToLatLon(viewport.reference, x_m, y_m);

  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

export function resolveMissionMapDrag(
  view: MissionMapView,
  markerId: string,
  point: MissionMapPoint,
): MissionMapDragResolution {
  const marker = view.markers.find((candidate) => candidate.id === markerId);
  if (!marker) {
    return {
      status: "rejected",
      reason: "marker-not-found",
      message: "Ignored a stale drag because the marker is no longer present in the active map view.",
    };
  }

  if (!view.viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the drag because the map viewport has no valid geometry yet.",
    };
  }

  if (!marker.draggable) {
    return {
      status: "rejected",
      reason: "marker-not-draggable",
      message: "Ignored the drag because this surface is read-only on the planner map.",
    };
  }

  const clampedPoint = clampMissionMapPoint(view.viewport, point);
  const coordinate = unprojectMissionMapPoint(view.viewport, clampedPoint);

  return {
    status: "applied",
    marker,
    point: clampedPoint,
    ...coordinate,
  };
}

export function buildMissionMapViewport(reference: GeoRef, coordinates: GeoRef[]): MissionMapViewport | null {
  if (coordinates.length === 0) {
    return null;
  }

  const localPoints = coordinates.map((coordinate) => latLonToLocalXY(reference, coordinate.latitude_deg, coordinate.longitude_deg));
  let minX = Math.min(...localPoints.map((point) => point.x_m));
  let maxX = Math.max(...localPoints.map((point) => point.x_m));
  let minY = Math.min(...localPoints.map((point) => point.y_m));
  let maxY = Math.max(...localPoints.map((point) => point.y_m));

  if (maxX - minX < MIN_SPAN_M) {
    const midpoint = (maxX + minX) / 2;
    minX = midpoint - MIN_SPAN_M / 2;
    maxX = midpoint + MIN_SPAN_M / 2;
  }

  if (maxY - minY < MIN_SPAN_M) {
    const midpoint = (maxY + minY) / 2;
    minY = midpoint - MIN_SPAN_M / 2;
    maxY = midpoint + MIN_SPAN_M / 2;
  }

  const padding = Math.max(Math.max(maxX - minX, maxY - minY) * PADDING_RATIO, MIN_PADDING_M);
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;
  if (width > height) {
    const delta = (width - height) / 2;
    minY -= delta;
    maxY += delta;
  } else if (height > width) {
    const delta = (height - width) / 2;
    minX -= delta;
    maxX += delta;
  }

  return {
    reference,
    minX_m: minX,
    maxX_m: maxX,
    minY_m: minY,
    maxY_m: maxY,
    viewBoxSize: MISSION_MAP_VIEWBOX_SIZE,
  };
}

export function projectMissionMapCoordinate(
  viewport: MissionMapViewport,
  coordinate: { latitude_deg: number; longitude_deg: number },
): MissionMapPoint {
  const local = latLonToLocalXY(viewport.reference, coordinate.latitude_deg, coordinate.longitude_deg);
  const xRatio = (local.x_m - viewport.minX_m) / (viewport.maxX_m - viewport.minX_m);
  const yRatio = (local.y_m - viewport.minY_m) / (viewport.maxY_m - viewport.minY_m);

  return clampMissionMapPoint(viewport, {
    x: xRatio * viewport.viewBoxSize,
    y: (1 - yRatio) * viewport.viewBoxSize,
  });
}

function buildMarkerCandidates(
  input: MissionMapViewInput,
  warnings: string[],
): Array<Omit<MissionMapMarker, "point">> {
  const markers: Array<Omit<MissionMapMarker, "point">> = [];

  if (input.home) {
    markers.push({
      id: MISSION_MAP_HOME_MARKER_ID,
      kind: "home",
      label: "H",
      latitude_deg: input.home.latitude_deg,
      longitude_deg: input.home.longitude_deg,
      draggable: true,
      selected: input.selection.kind === "home",
      current: false,
      readOnly: false,
      uiId: null,
      index: null,
    });
  }

  for (const item of input.missionItems) {
    if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
      const position = commandPosition((item.document as MissionItem).command);
      if (position) {
        warnings.push(`Mission item ${item.index + 1} exposed a positional command but did not produce a plottable marker.`);
      }
      continue;
    }

    markers.push({
      id: missionMapMarkerIdForUiId(item.uiId),
      kind: "mission-item",
      label: String(item.index + 1),
      latitude_deg: item.preview.latitude_deg,
      longitude_deg: item.preview.longitude_deg,
      draggable: !item.readOnly,
      selected: input.selection.kind === "mission-item" && input.selection.uiId === item.uiId,
      current: (item.document as MissionItem).current,
      readOnly: item.readOnly,
      uiId: item.uiId,
      index: item.index,
    });
  }

  return markers;
}

function buildSurveyGeoJson(
  survey: SurveyDraftExtension,
  selection: MissionMapSelection,
  warnings: string[],
): SurveyBuildResult {
  const features: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapGeoJsonProperties>> = [];
  const handles: SurveyHandleCandidate[] = [];
  const orderedBlocks = [...survey.surveyRegionOrder].sort(
    (left, right) => left.position - right.position || left.regionId.localeCompare(right.regionId),
  );

  for (const block of orderedBlocks) {
    const region = survey.surveyRegions.get(block.regionId);
    if (!region) {
      warnings.push(`Survey block ${block.regionId} is still referenced in order metadata but its geometry is missing.`);
      continue;
    }

    const selected = selection.kind === "survey-block" && selection.regionId === region.id;
    const pushCount = features.length;
    let handleLatitude_deg: number | null = null;
    let handleLongitude_deg: number | null = null;

    const tryHandleCoordinate = (coordinate: GeoPoint2d | null) => {
      if (handleLatitude_deg === null && handleLongitude_deg === null && coordinate) {
        handleLatitude_deg = coordinate.latitude_deg;
        handleLongitude_deg = coordinate.longitude_deg;
      }
    };

    if (region.polygon.length >= 3) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [closeRing(region.polygon).map(toGeoJsonCoordinate)],
        },
        properties: {
          source: "survey",
          kind: "survey_polygon",
          regionId: region.id,
          selected,
        },
      });
      tryHandleCoordinate(averagePoint(region.polygon));
    } else if (region.patternType !== "corridor" && region.polygon.length > 0) {
      warnings.push(`Survey block ${region.id} has an incomplete polygon and only valid geometry will remain visible on the map.`);
    }

    if (region.corridorPolygon.length >= 3) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [closeRing(region.corridorPolygon).map(toGeoJsonCoordinate)],
        },
        properties: {
          source: "survey",
          kind: "survey_corridor",
          regionId: region.id,
          selected,
        },
      });
      tryHandleCoordinate(averagePoint(region.corridorPolygon));
    } else if (region.corridorPolygon.length > 0) {
      warnings.push(`Survey block ${region.id} has an incomplete corridor polygon and IronWing kept the rest of the map visible.`);
    }

    if (region.polyline.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: region.polyline.map(toGeoJsonCoordinate),
        },
        properties: {
          source: "survey",
          kind: "survey_polyline",
          regionId: region.id,
          selected,
        },
      });
      tryHandleCoordinate(midpointOfPoints(region.polyline));
    } else if (region.patternType === "corridor" && region.polyline.length > 0) {
      warnings.push(`Survey block ${region.id} has an incomplete centerline and only valid survey geometry will render.`);
    }

    region.generatedTransects.forEach((transect, index) => {
      if (transect.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: transect.map(toGeoJsonCoordinate),
        },
        properties: {
          source: "survey",
          kind: "survey_transect",
          regionId: region.id,
          selected,
          label: `transect-${index + 1}`,
        },
      });
      tryHandleCoordinate(midpointOfPoints(transect));
    });

    region.generatedCrosshatch.forEach((transect, index) => {
      if (transect.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: transect.map(toGeoJsonCoordinate),
        },
        properties: {
          source: "survey",
          kind: "survey_crosshatch",
          regionId: region.id,
          selected,
          label: `crosshatch-${index + 1}`,
        },
      });
      tryHandleCoordinate(midpointOfPoints(transect));
    });

    region.generatedLayers.forEach((layer, index) => {
      if (layer.orbitPoints.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: closeRing(layer.orbitPoints).map(toGeoJsonCoordinate),
        },
        properties: {
          source: "survey",
          kind: "survey_orbit",
          regionId: region.id,
          selected,
          label: `layer-${index + 1}`,
        },
      });
      tryHandleCoordinate(midpointOfPoints(layer.orbitPoints));
    });

    const featureCount = features.length - pushCount;
    if (handleLatitude_deg === null || handleLongitude_deg === null || featureCount === 0) {
      warnings.push(`Survey block ${region.id} has no plottable geometry, so IronWing kept the last valid mission view visible around it.`);
      continue;
    }

    handles.push({
      regionId: region.id,
      label: region.patternType === "corridor"
        ? "C"
        : region.patternType === "structure"
          ? "S"
          : "G",
      latitude_deg: handleLatitude_deg,
      longitude_deg: handleLongitude_deg,
      selected,
      patternType: region.patternType,
      featureCount,
    });
  }

  return {
    geoJson: {
      type: "FeatureCollection",
      features,
    },
    handles,
  };
}

function projectMissionLines(viewport: MissionMapViewport, features: MissionRenderFeatures): MissionMapLineFeature[] {
  return features.legs
    .filter((leg) => leg.coordinates.length >= 2)
    .map((leg, index) => ({
      id: `mission-leg-${leg.to.itemIndex ?? `home-${index}`}`,
      kind: leg.kind,
      points: leg.coordinates.map((coordinate) => projectRenderCoordinate(viewport, coordinate)),
      selected: false,
      itemIndex: leg.to.itemIndex,
      regionId: null,
    }));
}

function projectMissionPolygons(viewport: MissionMapViewport, features: MissionRenderFeatures): MissionMapPolygonFeature[] {
  return features.loiterCircles
    .filter((circle) => circle.coordinates[0]?.length >= 4)
    .map((circle) => ({
      id: `mission-loiter-${circle.itemIndex}`,
      kind: circle.kind,
      rings: circle.coordinates.map((ring) => ring.map((coordinate) => projectRenderCoordinate(viewport, coordinate))),
      selected: false,
      itemIndex: circle.itemIndex,
      regionId: null,
    }));
}

function projectMissionLabels(viewport: MissionMapViewport, features: MissionRenderFeatures): MissionMapLabelFeature[] {
  return features.labels.map((label) => ({
    id: `mission-label-${label.itemIndex ?? "home"}`,
    text: label.text,
    point: projectRenderCoordinate(viewport, label.coordinate),
    itemIndex: label.itemIndex,
  }));
}

function projectSurveyFeatures(
  viewport: MissionMapViewport,
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
): {
  lines: MissionMapLineFeature[];
  polygons: MissionMapPolygonFeature[];
} {
  const lines: MissionMapLineFeature[] = [];
  const polygons: MissionMapPolygonFeature[] = [];

  for (const [index, feature] of geoJson.features.entries()) {
    if (feature.geometry.type === "LineString") {
      if (feature.geometry.coordinates.length < 2) {
        continue;
      }

      lines.push({
        id: `survey-line-${feature.properties?.regionId ?? index}-${feature.properties?.kind ?? "line"}`,
        kind: feature.properties?.kind ?? "survey_line",
        points: feature.geometry.coordinates.map(([longitude_deg, latitude_deg]) => projectMissionMapCoordinate(viewport, {
          latitude_deg,
          longitude_deg,
        })),
        selected: feature.properties?.selected ?? false,
        itemIndex: feature.properties?.itemIndex ?? null,
        regionId: feature.properties?.regionId ?? null,
      });
      continue;
    }

    if (feature.geometry.type === "Polygon") {
      polygons.push({
        id: `survey-polygon-${feature.properties?.regionId ?? index}-${feature.properties?.kind ?? "polygon"}`,
        kind: feature.properties?.kind ?? "survey_polygon",
        rings: feature.geometry.coordinates.map((ring) => ring.map(([longitude_deg, latitude_deg]) => projectMissionMapCoordinate(viewport, {
          latitude_deg,
          longitude_deg,
        }))),
        selected: feature.properties?.selected ?? false,
        itemIndex: feature.properties?.itemIndex ?? null,
        regionId: feature.properties?.regionId ?? null,
      });
    }
  }

  return { lines, polygons };
}

function missionRenderFeaturesToGeoJson(
  features: MissionRenderFeatures,
): GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties> {
  const geoJsonFeatures: Array<GeoJSON.Feature<GeoJSON.Geometry, MissionMapGeoJsonProperties>> = [];

  for (const leg of features.legs) {
    geoJsonFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: leg.coordinates,
      },
      properties: {
        source: "mission",
        kind: leg.kind,
        itemIndex: leg.to.itemIndex,
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
        source: "mission",
        kind: circle.kind,
        itemIndex: circle.itemIndex,
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
        source: "mission",
        kind: label.kind,
        itemIndex: label.itemIndex,
        label: label.text,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: geoJsonFeatures,
  };
}

function countFeatureKinds(
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
): Record<string, number> {
  return geoJson.features.reduce<Record<string, number>>((counts, feature) => {
    const kind = feature.properties?.kind;
    if (!kind) {
      return counts;
    }

    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

function collectAllCoordinates(
  markers: Array<Omit<MissionMapMarker, "point">>,
  missionGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  surveyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
): GeoRef[] {
  const coordinates: GeoRef[] = markers.map((marker) => ({
    latitude_deg: marker.latitude_deg,
    longitude_deg: marker.longitude_deg,
  }));

  appendFeatureCollectionCoordinates(missionGeoJson, coordinates);
  appendFeatureCollectionCoordinates(surveyGeoJson, coordinates);
  return coordinates;
}

function resolveReference(
  home: HomePosition | null,
  markers: Array<Omit<MissionMapMarker, "point">>,
  missionGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  surveyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
): GeoRef | null {
  if (home) {
    return {
      latitude_deg: home.latitude_deg,
      longitude_deg: home.longitude_deg,
    };
  }

  const marker = markers[0];
  if (marker) {
    return {
      latitude_deg: marker.latitude_deg,
      longitude_deg: marker.longitude_deg,
    };
  }

  const allCoordinates = collectAllCoordinates([], missionGeoJson, surveyGeoJson);
  return allCoordinates[0] ?? null;
}

function appendFeatureCollectionCoordinates(
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  coordinates: GeoRef[],
) {
  for (const feature of geoJson.features) {
    appendGeometryCoordinates(feature.geometry, coordinates);
  }
}

function appendGeometryCoordinates(geometry: GeoJSON.Geometry, coordinates: GeoRef[]) {
  if (geometry.type === "Point") {
    const [longitude_deg, latitude_deg] = geometry.coordinates;
    coordinates.push({ latitude_deg, longitude_deg });
    return;
  }

  if (geometry.type === "LineString" || geometry.type === "MultiPoint") {
    geometry.coordinates.forEach(([longitude_deg, latitude_deg]) => {
      coordinates.push({ latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") {
    geometry.coordinates.flat().forEach(([longitude_deg, latitude_deg]) => {
      coordinates.push({ latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.flat(2).forEach(([longitude_deg, latitude_deg]) => {
      coordinates.push({ latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child) => appendGeometryCoordinates(child, coordinates));
  }
}

function projectRenderCoordinate(
  viewport: MissionMapViewport,
  coordinate: MissionRenderCoordinate,
): MissionMapPoint {
  return projectMissionMapCoordinate(viewport, {
    latitude_deg: coordinate[1],
    longitude_deg: coordinate[0],
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

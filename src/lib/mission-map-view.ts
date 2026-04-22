import type { HomePosition } from "../mission";
import type { TypedDraftItem } from "./mission-draft-typed";
import type { GeoPoint2d, MissionItem } from "./mavkit-types";
import { commandPosition } from "./mavkit-types";
import {
  buildMissionMapFenceModel,
  type MissionMapFenceSelection,
} from "./mission-map-fence";
import {
  buildMissionMapRallyModel,
  type MissionMapRallySelection,
} from "./mission-map-rally";
import {
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";
import { haversineM } from "./geo-utils";
import {
  buildMissionRenderFeatures,
  type MissionRenderCoordinate,
  type MissionRenderFeatures,
} from "./mission-path-render";
import { buildMissionMapSurveyModel } from "./mission-map-survey";
import type { SurveyDraftExtension, SurveyPatternType } from "./survey-region";

export const MISSION_MAP_VIEWBOX_SIZE = 1000;
export const MISSION_MAP_HOME_MARKER_ID = "home";

const MIN_SPAN_M = 40;
const PADDING_RATIO = 0.12;
const MIN_PADDING_M = 20;

type MissionMapGeoJsonProperties = {
  source: "mission" | "survey" | "fence" | "rally";
  kind: string;
  itemIndex?: number | null;
  uiId?: number | null;
  regionId?: string;
  regionUiId?: number | null;
  label?: string;
  selected?: boolean;
  current?: boolean;
  draggable?: boolean;
  readOnly?: boolean;
};

export type MissionMapMode = "mission" | "fence" | "rally";

export type MissionMapSelection =
  | { kind: "home" }
  | { kind: "mission-item"; uiId: number | null }
  | { kind: "survey-block"; regionId: string | null }
  | { kind: "rally-point"; uiId: number | null };

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
  kind: "home" | "mission-item" | "rally-point";
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

export type MissionMapSurveyVertexHandle = {
  id: string;
  regionId: string;
  index: number;
  point: MissionMapPoint;
  selected: boolean;
  patternType: SurveyPatternType;
  geometryKind: "polygon" | "polyline";
};

export type MissionMapFenceRegionHandle = {
  id: string;
  regionUiId: number;
  label: string;
  point: MissionMapPoint;
  selected: boolean;
  inclusion: boolean;
  geometryKind: "polygon" | "circle";
  draggable: boolean;
  latitude_deg: number;
  longitude_deg: number;
};

export type MissionMapFenceVertexHandle = {
  id: string;
  regionUiId: number;
  index: number;
  point: MissionMapPoint;
  selected: boolean;
  latitude_deg: number;
  longitude_deg: number;
};

export type MissionMapFenceRadiusHandle = {
  id: string;
  regionUiId: number;
  point: MissionMapPoint;
  selected: boolean;
  radius_m: number;
  centerLatitude_deg: number;
  centerLongitude_deg: number;
};

export type MissionMapFenceReturnPoint = {
  id: string;
  point: MissionMapPoint;
  selected: boolean;
  latitude_deg: number;
  longitude_deg: number;
};

export type MissionMapLineFeature = {
  id: string;
  kind: string;
  points: MissionMapPoint[];
  selected: boolean;
  itemIndex: number | null;
  regionId: string | null;
  regionUiId: number | null;
};

export type MissionMapPolygonFeature = {
  id: string;
  kind: string;
  rings: MissionMapPoint[][];
  selected: boolean;
  itemIndex: number | null;
  regionId: string | null;
  regionUiId: number | null;
};

export type MissionMapLabelFeature = {
  id: string;
  text: string;
  point: MissionMapPoint;
  itemIndex: number | null;
};

export type MissionMapFeatureCounts = {
  markers: number;
  rallyMarkers: number;
  surveyHandles: number;
  surveyVertexHandles: number;
  fenceRegionHandles: number;
  fenceVertexHandles: number;
  fenceRadiusHandles: number;
  fenceHasReturnPoint: boolean;
  missionFeatures: number;
  surveyFeatures: number;
  surveyPreviewFeatures: number;
  fenceFeatures: number;
  rallyFeatures: number;
  missionFeatureKinds: Record<string, number>;
  surveyFeatureKinds: Record<string, number>;
  surveyPreviewFeatureKinds: Record<string, number>;
  fenceFeatureKinds: Record<string, number>;
  rallyFeatureKinds: Record<string, number>;
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

export type MissionMapSurveyHandleDragResolution =
  | {
    status: "applied";
    handle: MissionMapSurveyVertexHandle;
    point: MissionMapPoint;
    latitude_deg: number;
    longitude_deg: number;
  }
  | {
    status: "rejected";
    reason: "handle-not-found" | "viewport-unavailable";
    message: string;
  };

export type MissionMapFenceHandleDragResolution =
  | {
    status: "applied";
    point: MissionMapPoint;
    latitude_deg: number;
    longitude_deg: number;
  }
  | {
    status: "rejected";
    reason: "handle-not-found" | "handle-not-draggable" | "viewport-unavailable";
    message: string;
  };

export type MissionMapFenceRadiusDragResolution =
  | {
    status: "applied";
    handle: MissionMapFenceRadiusHandle;
    point: MissionMapPoint;
    radius_m: number;
  }
  | {
    status: "rejected";
    reason: "handle-not-found" | "viewport-unavailable" | "radius-invalid";
    message: string;
  };

export type MissionMapView = {
  mode: MissionMapMode;
  state: "empty" | "ready" | "degraded";
  selection: MissionMapSelection;
  fenceSelection: MissionMapFenceSelection;
  viewport: MissionMapViewport | null;
  markers: MissionMapMarker[];
  surveyHandles: MissionMapSurveyHandle[];
  surveyVertexHandles: MissionMapSurveyVertexHandle[];
  fenceRegionHandles: MissionMapFenceRegionHandle[];
  fenceVertexHandles: MissionMapFenceVertexHandle[];
  fenceRadiusHandles: MissionMapFenceRadiusHandle[];
  fenceReturnPoint: MissionMapFenceReturnPoint | null;
  missionLines: MissionMapLineFeature[];
  missionPolygons: MissionMapPolygonFeature[];
  missionLabels: MissionMapLabelFeature[];
  surveyLines: MissionMapLineFeature[];
  surveyPolygons: MissionMapPolygonFeature[];
  fenceLines: MissionMapLineFeature[];
  fencePolygons: MissionMapPolygonFeature[];
  missionGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  surveyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  fenceGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  rallyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>;
  warnings: string[];
  counts: MissionMapFeatureCounts;
};

export type MissionMapViewInput = {
  mode?: MissionMapMode;
  home: HomePosition | null;
  missionItems: TypedDraftItem[];
  survey: SurveyDraftExtension;
  selection: MissionMapSelection;
  fenceDraftItems?: TypedDraftItem[];
  fenceReturnPoint?: GeoPoint2d | null;
  fenceSelection?: MissionMapFenceSelection;
  rallyDraftItems?: TypedDraftItem[];
  rallySelection?: MissionMapRallySelection;
  currentSeq?: number | null;
};

export function missionMapMarkerIdForUiId(uiId: number): string {
  return `mission-${uiId}`;
}

export function buildMissionMapView(input: MissionMapViewInput): MissionMapView {
  const warnings: string[] = [];
  const mode = input.mode ?? "mission";
  const currentSeq = input.currentSeq ?? input.missionItems.find((item) => (item.document as MissionItem).current)?.index ?? null;
  const renderFeatures = buildMissionRenderFeatures(input.home, input.missionItems, {
    currentSeq: currentSeq ?? undefined,
  });
  const missionGeoJson = missionRenderFeaturesToGeoJson(renderFeatures);
  const selectedSurveyRegionId = input.selection.kind === "survey-block" ? input.selection.regionId : null;
  const survey = buildMissionMapSurveyModel({
    survey: input.survey,
    selectedRegionId: selectedSurveyRegionId,
  });
  const rallySelection = input.rallySelection ?? { kind: "none" };
  const rally = mode === "rally"
    ? buildMissionMapRallyModel({
      points: input.rallyDraftItems ?? [],
      selection: rallySelection,
    })
    : buildMissionMapRallyModel({
      points: [],
      selection: { kind: "none" },
    });
  const markerCandidates = mode === "rally"
    ? buildRallyMarkerCandidates(input.home, input.selection, rally)
    : buildMarkerCandidates(input, warnings);
  const fenceSelection = input.fenceSelection ?? { kind: "none" };
  const fence = mode === "fence"
    ? buildMissionMapFenceModel({
      regions: input.fenceDraftItems ?? [],
      returnPoint: input.fenceReturnPoint ?? null,
      selection: fenceSelection,
    })
    : buildMissionMapFenceModel({
      regions: [],
      returnPoint: null,
      selection: { kind: "none" },
    });
  warnings.push(...survey.warnings, ...fence.warnings, ...rally.warnings);

  const reference = resolveReference(
    input.home,
    markerCandidates,
    missionGeoJson,
    survey.geoJson,
    fence.geoJson,
    rally.geoJson,
    survey.referenceCoordinates,
    fence.referenceCoordinates,
    rally.referenceCoordinates,
  );
  const viewport = reference
    ? buildMissionMapViewport(
      reference,
      collectAllCoordinates(
        markerCandidates,
        missionGeoJson,
        survey.geoJson,
        fence.geoJson,
        rally.geoJson,
        survey.referenceCoordinates,
        fence.referenceCoordinates,
        rally.referenceCoordinates,
      ),
    )
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
    ? survey.regionHandles.map((handle) => ({
      ...handle,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const surveyVertexHandles = viewport
    ? survey.vertexHandles.map((handle) => ({
      ...handle,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const fenceRegionHandles = viewport
    ? fence.regionHandles.map((handle) => ({
      ...handle,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const fenceVertexHandles = viewport
    ? fence.vertexHandles.map((handle) => ({
      ...handle,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const fenceRadiusHandles = viewport
    ? fence.radiusHandles.map((handle) => ({
      ...handle,
      centerLatitude_deg: fence.regionHandles.find((regionHandle) => regionHandle.regionUiId === handle.regionUiId)?.latitude_deg ?? handle.latitude_deg,
      centerLongitude_deg: fence.regionHandles.find((regionHandle) => regionHandle.regionUiId === handle.regionUiId)?.longitude_deg ?? handle.longitude_deg,
      point: projectMissionMapCoordinate(viewport, handle),
    }))
    : [];

  const fenceReturnPoint = viewport && fence.returnPoint
    ? {
      ...fence.returnPoint,
      point: projectMissionMapCoordinate(viewport, fence.returnPoint),
    }
    : null;

  const missionLines = viewport ? projectMissionLines(viewport, renderFeatures) : [];
  const missionPolygons = viewport ? projectMissionPolygons(viewport, renderFeatures) : [];
  const missionLabels = viewport ? projectMissionLabels(viewport, renderFeatures) : [];
  const { lines: surveyLines, polygons: surveyPolygons } = viewport
    ? projectOverlayFeatures(viewport, survey.geoJson, "survey")
    : { lines: [], polygons: [] };
  const { lines: fenceLines, polygons: fencePolygons } = viewport
    ? projectOverlayFeatures(viewport, fence.geoJson, "fence")
    : { lines: [], polygons: [] };

  const hasRenderableGeometry = markers.length > 0
    || surveyHandles.length > 0
    || surveyVertexHandles.length > 0
    || fenceRegionHandles.length > 0
    || fenceVertexHandles.length > 0
    || fenceRadiusHandles.length > 0
    || fenceReturnPoint !== null
    || missionGeoJson.features.length > 0
    || survey.geoJson.features.length > 0
    || fence.geoJson.features.length > 0
    || rally.geoJson.features.length > 0;

  return {
    mode,
    state: hasRenderableGeometry
      ? warnings.length > 0 ? "degraded" : "ready"
      : warnings.length > 0 ? "degraded" : "empty",
    selection: input.selection,
    fenceSelection,
    viewport,
    markers,
    surveyHandles,
    surveyVertexHandles,
    fenceRegionHandles,
    fenceVertexHandles,
    fenceRadiusHandles,
    fenceReturnPoint,
    missionLines,
    missionPolygons,
    missionLabels,
    surveyLines,
    surveyPolygons,
    fenceLines,
    fencePolygons,
    missionGeoJson,
    surveyGeoJson: survey.geoJson,
    fenceGeoJson: fence.geoJson,
    rallyGeoJson: rally.geoJson,
    warnings,
    counts: {
      markers: markers.length,
      rallyMarkers: markers.filter((marker) => marker.kind === "rally-point").length,
      surveyHandles: surveyHandles.length,
      surveyVertexHandles: surveyVertexHandles.length,
      fenceRegionHandles: fenceRegionHandles.length,
      fenceVertexHandles: fenceVertexHandles.length,
      fenceRadiusHandles: fenceRadiusHandles.length,
      fenceHasReturnPoint: fenceReturnPoint !== null,
      missionFeatures: missionGeoJson.features.length,
      surveyFeatures: survey.geoJson.features.length,
      surveyPreviewFeatures: survey.counts.previewFeatures,
      fenceFeatures: fence.geoJson.features.length,
      rallyFeatures: rally.geoJson.features.length,
      missionFeatureKinds: countFeatureKinds(missionGeoJson),
      surveyFeatureKinds: countFeatureKinds(survey.geoJson),
      surveyPreviewFeatureKinds: survey.counts.previewFeatureKinds,
      fenceFeatureKinds: fence.counts.featureKinds,
      rallyFeatureKinds: countFeatureKinds(rally.geoJson),
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

export function reprojectMissionMapPoint(
  point: MissionMapPoint,
  fromViewport: MissionMapViewport,
  toViewport: MissionMapViewport,
): MissionMapPoint {
  const clampedPoint = clampMissionMapPoint(fromViewport, point);
  const xRatio = fromViewport.viewBoxSize === 0 ? 0 : clampedPoint.x / fromViewport.viewBoxSize;
  const yRatio = fromViewport.viewBoxSize === 0 ? 0 : 1 - clampedPoint.y / fromViewport.viewBoxSize;
  const x_m = fromViewport.minX_m + (fromViewport.maxX_m - fromViewport.minX_m) * xRatio;
  const y_m = fromViewport.minY_m + (fromViewport.maxY_m - fromViewport.minY_m) * yRatio;
  const nextXRatio = toViewport.maxX_m === toViewport.minX_m
    ? 0
    : (x_m - toViewport.minX_m) / (toViewport.maxX_m - toViewport.minX_m);
  const nextYRatio = toViewport.maxY_m === toViewport.minY_m
    ? 0
    : (y_m - toViewport.minY_m) / (toViewport.maxY_m - toViewport.minY_m);

  return clampMissionMapPoint(toViewport, {
    x: nextXRatio * toViewport.viewBoxSize,
    y: (1 - nextYRatio) * toViewport.viewBoxSize,
  });
}

export function adaptMissionMapViewportToAspectRatio(
  viewport: MissionMapViewport,
  aspectRatio: number,
): MissionMapViewport {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return viewport;
  }

  const currentWidth_m = viewport.maxX_m - viewport.minX_m;
  const currentHeight_m = viewport.maxY_m - viewport.minY_m;
  if (currentWidth_m <= 0 || currentHeight_m <= 0) {
    return viewport;
  }

  const currentAspectRatio = currentWidth_m / currentHeight_m;
  if (Math.abs(currentAspectRatio - aspectRatio) < Number.EPSILON) {
    return viewport;
  }

  const centerX_m = (viewport.minX_m + viewport.maxX_m) / 2;
  const centerY_m = (viewport.minY_m + viewport.maxY_m) / 2;

  if (aspectRatio > currentAspectRatio) {
    const nextWidth_m = currentHeight_m * aspectRatio;
    return {
      ...viewport,
      minX_m: centerX_m - nextWidth_m / 2,
      maxX_m: centerX_m + nextWidth_m / 2,
    };
  }

  const nextHeight_m = currentWidth_m / aspectRatio;
  return {
    ...viewport,
    minY_m: centerY_m - nextHeight_m / 2,
    maxY_m: centerY_m + nextHeight_m / 2,
  };
}

function resolveDragViewport(
  view: MissionMapView,
  viewportOverride?: MissionMapViewport | null,
): MissionMapViewport | null {
  return viewportOverride ?? view.viewport;
}

export function resolveMissionMapDrag(
  view: MissionMapView,
  markerId: string,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapDragResolution {
  const marker = view.markers.find((candidate) => candidate.id === markerId);
  if (!marker) {
    return {
      status: "rejected",
      reason: "marker-not-found",
      message: "Ignored a stale drag because the marker is no longer present in the active map view.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
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

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);

  return {
    status: "applied",
    marker,
    point: clampedPoint,
    ...coordinate,
  };
}

export function resolveMissionMapSurveyHandleDrag(
  view: MissionMapView,
  handleId: string,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapSurveyHandleDragResolution {
  const handle = view.surveyVertexHandles.find((candidate) => candidate.id === handleId);
  if (!handle) {
    return {
      status: "rejected",
      reason: "handle-not-found",
      message: "Ignored a stale survey-handle drag because that vertex is no longer present in the active map view.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the survey-handle drag because the map viewport has no valid geometry yet.",
    };
  }

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);

  return {
    status: "applied",
    handle,
    point: clampedPoint,
    ...coordinate,
  };
}

export function resolveMissionMapFenceVertexHandleDrag(
  view: MissionMapView,
  handleId: string,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapFenceHandleDragResolution {
  const handle = view.fenceVertexHandles.find((candidate) => candidate.id === handleId);
  if (!handle) {
    return {
      status: "rejected",
      reason: "handle-not-found",
      message: "Ignored a stale fence-vertex drag because that vertex is no longer present in the active map view.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the fence-vertex drag because the map viewport has no valid geometry yet.",
    };
  }

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);

  return {
    status: "applied",
    point: clampedPoint,
    ...coordinate,
  };
}

export function resolveMissionMapFenceRegionHandleDrag(
  view: MissionMapView,
  handleId: string,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapFenceHandleDragResolution {
  const handle = view.fenceRegionHandles.find((candidate) => candidate.id === handleId);
  if (!handle) {
    return {
      status: "rejected",
      reason: "handle-not-found",
      message: "Ignored a stale fence-region drag because that handle is no longer present in the active map view.",
    };
  }

  if (!handle.draggable) {
    return {
      status: "rejected",
      reason: "handle-not-draggable",
      message: "Ignored the drag because this fence region is not movable from its current map handle.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the fence-region drag because the map viewport has no valid geometry yet.",
    };
  }

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);

  return {
    status: "applied",
    point: clampedPoint,
    ...coordinate,
  };
}

export function resolveMissionMapFenceRadiusHandleDrag(
  view: MissionMapView,
  handleId: string,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapFenceRadiusDragResolution {
  const handle = view.fenceRadiusHandles.find((candidate) => candidate.id === handleId);
  if (!handle) {
    return {
      status: "rejected",
      reason: "handle-not-found",
      message: "Ignored a stale fence-radius drag because that handle is no longer present in the active map view.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the fence-radius drag because the map viewport has no valid geometry yet.",
    };
  }

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);
  const radius_m = haversineM(
    handle.centerLatitude_deg,
    handle.centerLongitude_deg,
    coordinate.latitude_deg,
    coordinate.longitude_deg,
  );

  if (!Number.isFinite(radius_m) || radius_m <= 0) {
    return {
      status: "rejected",
      reason: "radius-invalid",
      message: "Ignored the fence-radius drag because the resulting radius was not valid.",
    };
  }

  return {
    status: "applied",
    handle,
    point: clampedPoint,
    radius_m,
  };
}

export function resolveMissionMapFenceReturnPointDrag(
  view: MissionMapView,
  point: MissionMapPoint,
  viewportOverride?: MissionMapViewport | null,
): MissionMapFenceHandleDragResolution {
  if (!view.fenceReturnPoint) {
    return {
      status: "rejected",
      reason: "handle-not-found",
      message: "Ignored a stale fence return-point drag because the return point is no longer present in the active map view.",
    };
  }

  const viewport = resolveDragViewport(view, viewportOverride);
  if (!viewport) {
    return {
      status: "rejected",
      reason: "viewport-unavailable",
      message: "Ignored the fence return-point drag because the map viewport has no valid geometry yet.",
    };
  }

  const clampedPoint = clampMissionMapPoint(viewport, point);
  const coordinate = unprojectMissionMapPoint(viewport, clampedPoint);

  return {
    status: "applied",
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

function buildRallyMarkerCandidates(
  home: HomePosition | null,
  selection: MissionMapSelection,
  rally: ReturnType<typeof buildMissionMapRallyModel>,
): Array<Omit<MissionMapMarker, "point">> {
  const markers: Array<Omit<MissionMapMarker, "point">> = [];

  if (home) {
    markers.push({
      id: MISSION_MAP_HOME_MARKER_ID,
      kind: "home",
      label: "H",
      latitude_deg: home.latitude_deg,
      longitude_deg: home.longitude_deg,
      draggable: true,
      selected: selection.kind === "home",
      current: false,
      readOnly: false,
      uiId: null,
      index: null,
    });
  }

  for (const marker of rally.markerCandidates) {
    markers.push(marker);
  }

  return markers;
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
      regionUiId: null,
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
      regionUiId: null,
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

function projectOverlayFeatures(
  viewport: MissionMapViewport,
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  prefix: "survey" | "fence",
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
        id: `${prefix}-line-${feature.properties?.regionId ?? feature.properties?.regionUiId ?? "regionless"}-${feature.properties?.kind ?? "line"}-${index}`,
        kind: feature.properties?.kind ?? `${prefix}_line`,
        points: feature.geometry.coordinates.map(([longitude_deg, latitude_deg]) => projectMissionMapCoordinate(viewport, {
          latitude_deg,
          longitude_deg,
        })),
        selected: feature.properties?.selected ?? false,
        itemIndex: feature.properties?.itemIndex ?? null,
        regionId: feature.properties?.regionId ?? null,
        regionUiId: feature.properties?.regionUiId ?? null,
      });
      continue;
    }

    if (feature.geometry.type === "Polygon") {
      polygons.push({
        id: `${prefix}-polygon-${feature.properties?.regionId ?? feature.properties?.regionUiId ?? "regionless"}-${feature.properties?.kind ?? "polygon"}-${index}`,
        kind: feature.properties?.kind ?? `${prefix}_polygon`,
        rings: feature.geometry.coordinates.map((ring) => ring.map(([longitude_deg, latitude_deg]) => projectMissionMapCoordinate(viewport, {
          latitude_deg,
          longitude_deg,
        }))),
        selected: feature.properties?.selected ?? false,
        itemIndex: feature.properties?.itemIndex ?? null,
        regionId: feature.properties?.regionId ?? null,
        regionUiId: feature.properties?.regionUiId ?? null,
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
  fenceGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  rallyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  surveyCoordinates: GeoRef[] = [],
  fenceCoordinates: GeoRef[] = [],
  rallyCoordinates: GeoRef[] = [],
): GeoRef[] {
  const coordinates: GeoRef[] = markers.map((marker) => ({
    latitude_deg: marker.latitude_deg,
    longitude_deg: marker.longitude_deg,
  }));

  appendFeatureCollectionCoordinates(missionGeoJson, coordinates);
  appendFeatureCollectionCoordinates(surveyGeoJson, coordinates);
  appendFeatureCollectionCoordinates(fenceGeoJson, coordinates);
  appendFeatureCollectionCoordinates(rallyGeoJson, coordinates);
  surveyCoordinates.forEach((coordinate) => {
    if (isFiniteGeoRef(coordinate)) {
      coordinates.push({ ...coordinate });
    }
  });
  fenceCoordinates.forEach((coordinate) => {
    if (isFiniteGeoRef(coordinate)) {
      coordinates.push({ ...coordinate });
    }
  });
  rallyCoordinates.forEach((coordinate) => {
    if (isFiniteGeoRef(coordinate)) {
      coordinates.push({ ...coordinate });
    }
  });
  return coordinates;
}

function resolveReference(
  home: HomePosition | null,
  markers: Array<Omit<MissionMapMarker, "point">>,
  missionGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  surveyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  fenceGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  rallyGeoJson: GeoJSON.FeatureCollection<GeoJSON.Geometry, MissionMapGeoJsonProperties>,
  surveyCoordinates: GeoRef[] = [],
  fenceCoordinates: GeoRef[] = [],
  rallyCoordinates: GeoRef[] = [],
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

  const allCoordinates = collectAllCoordinates(
    [],
    missionGeoJson,
    surveyGeoJson,
    fenceGeoJson,
    rallyGeoJson,
    surveyCoordinates,
    fenceCoordinates,
    rallyCoordinates,
  );
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
    pushFiniteGeoRef(coordinates, { latitude_deg, longitude_deg });
    return;
  }

  if (geometry.type === "LineString" || geometry.type === "MultiPoint") {
    geometry.coordinates.forEach(([longitude_deg, latitude_deg]) => {
      pushFiniteGeoRef(coordinates, { latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") {
    geometry.coordinates.flat().forEach(([longitude_deg, latitude_deg]) => {
      pushFiniteGeoRef(coordinates, { latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.flat(2).forEach(([longitude_deg, latitude_deg]) => {
      pushFiniteGeoRef(coordinates, { latitude_deg, longitude_deg });
    });
    return;
  }

  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child) => appendGeometryCoordinates(child, coordinates));
  }
}

function isFiniteGeoRef(coordinate: GeoRef | null | undefined): coordinate is GeoRef {
  return !!coordinate
    && Number.isFinite(coordinate.latitude_deg)
    && Number.isFinite(coordinate.longitude_deg)
    && coordinate.latitude_deg >= -90
    && coordinate.latitude_deg <= 90
    && coordinate.longitude_deg >= -180
    && coordinate.longitude_deg <= 180;
}

function pushFiniteGeoRef(coordinates: GeoRef[], coordinate: GeoRef): void {
  if (isFiniteGeoRef(coordinate)) {
    coordinates.push(coordinate);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

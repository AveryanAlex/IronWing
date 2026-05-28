import type {
  MissionMapFenceRadiusHandle,
  MissionMapFenceRegionHandle,
  MissionMapFenceReturnPoint,
  MissionMapFenceVertexHandle,
  MissionMapLabelFeature,
  MissionMapLineFeature,
  MissionMapMarker,
  MissionMapPoint,
  MissionMapPolygonFeature,
  MissionMapSurveyHandle,
  MissionMapSurveyVertexHandle,
} from "../../lib/mission-map-view";

type PointRemapper = (point: MissionMapPoint) => MissionMapPoint;

export function remapLineFeatures(
  features: MissionMapLineFeature[],
  remapPoint: PointRemapper,
): MissionMapLineFeature[] {
  return features.map((feature) => ({
    ...feature,
    points: feature.points.map((point) => remapPoint(point)),
  }));
}

export function remapPolygonFeatures(
  features: MissionMapPolygonFeature[],
  remapPoint: PointRemapper,
): MissionMapPolygonFeature[] {
  return features.map((feature) => ({
    ...feature,
    rings: feature.rings.map((ring) => ring.map((point) => remapPoint(point))),
  }));
}

export function remapLabelFeatures(
  features: MissionMapLabelFeature[],
  remapPoint: PointRemapper,
): MissionMapLabelFeature[] {
  return features.map((feature) => ({
    ...feature,
    point: remapPoint(feature.point),
  }));
}

export function remapMarkers(
  markers: MissionMapMarker[],
  remapPoint: PointRemapper,
): MissionMapMarker[] {
  return markers.map((marker) => ({
    ...marker,
    point: remapPoint(marker.point),
  }));
}

export function remapSurveyHandles(
  handles: MissionMapSurveyHandle[],
  remapPoint: PointRemapper,
): MissionMapSurveyHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

export function remapSurveyVertexHandles(
  handles: MissionMapSurveyVertexHandle[],
  remapPoint: PointRemapper,
): MissionMapSurveyVertexHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

export function remapFenceRegionHandles(
  handles: MissionMapFenceRegionHandle[],
  remapPoint: PointRemapper,
): MissionMapFenceRegionHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

export function remapFenceVertexHandles(
  handles: MissionMapFenceVertexHandle[],
  remapPoint: PointRemapper,
): MissionMapFenceVertexHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

export function remapFenceRadiusHandles(
  handles: MissionMapFenceRadiusHandle[],
  remapPoint: PointRemapper,
): MissionMapFenceRadiusHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

export function remapFenceReturnPoint(
  fenceReturnPoint: MissionMapFenceReturnPoint | null,
  remapPoint: PointRemapper,
): MissionMapFenceReturnPoint | null {
  if (!fenceReturnPoint) {
    return null;
  }

  return {
    ...fenceReturnPoint,
    point: remapPoint(fenceReturnPoint.point),
  };
}

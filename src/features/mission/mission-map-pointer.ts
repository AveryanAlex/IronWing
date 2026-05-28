import type { Map as MapLibreMap } from "maplibre-gl";
import {
  unprojectMissionMapPoint,
  type MissionMapPoint,
  type MissionMapViewport,
} from "../../lib/mission-map-view";

export type SurfaceDrawableBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PointerMapCoordinate = {
  point: MissionMapPoint;
  latitude_deg: number;
  longitude_deg: number;
  projectedByBasemap: boolean;
};

type PointerEventLike = Pick<MouseEvent, "clientX" | "clientY">;

export function readSurfaceDrawableBox(surfaceElement: HTMLElement | null): SurfaceDrawableBox | null {
  if (!surfaceElement) {
    return null;
  }

  const rect = surfaceElement.getBoundingClientRect();
  const width = surfaceElement.clientWidth > 0 ? surfaceElement.clientWidth : rect.width;
  const height = surfaceElement.clientHeight > 0 ? surfaceElement.clientHeight : rect.height;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    left: rect.left + surfaceElement.clientLeft,
    top: rect.top + surfaceElement.clientTop,
    width,
    height,
  };
}

export function pointerOffset(
  event: PointerEventLike,
  surfaceElement: HTMLElement | null,
): MissionMapPoint | null {
  const rect = readSurfaceDrawableBox(surfaceElement);
  if (!rect) {
    return null;
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function projectedPointFromPointer(
  event: PointerEventLike,
  surfaceElement: HTMLElement | null,
  viewport: MissionMapViewport | null,
): MissionMapPoint | null {
  if (!viewport) {
    return null;
  }

  const rect = readSurfaceDrawableBox(surfaceElement);
  if (!rect) {
    return null;
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * viewport.viewBoxSize,
    y: ((event.clientY - rect.top) / rect.height) * viewport.viewBoxSize,
  };
}

export function coordinateFromPointer({
  event,
  surfaceElement,
  viewport,
  basemap,
  overlayUsesBasemapProjection,
}: {
  event: PointerEventLike;
  surfaceElement: HTMLElement | null;
  viewport: MissionMapViewport | null;
  basemap: MapLibreMap | null;
  overlayUsesBasemapProjection: boolean;
}): PointerMapCoordinate | null {
  const offset = pointerOffset(event, surfaceElement);
  if (offset && basemap && overlayUsesBasemapProjection && typeof basemap.unproject === "function") {
    const lngLat = basemap.unproject([offset.x, offset.y]);
    return {
      point: offset,
      latitude_deg: lngLat.lat,
      longitude_deg: lngLat.lng,
      projectedByBasemap: true,
    };
  }

  const point = projectedPointFromPointer(event, surfaceElement, viewport);
  if (!point || !viewport) {
    return null;
  }

  const coordinate = unprojectMissionMapPoint(viewport, point);
  return {
    point,
    ...coordinate,
    projectedByBasemap: false,
  };
}

export function coordinateFromMapCenter({
  basemap,
  overlayUsesBasemapProjection,
  overlayViewBox,
  viewport,
}: {
  basemap: MapLibreMap | null;
  overlayUsesBasemapProjection: boolean;
  overlayViewBox: { width: number; height: number };
  viewport: MissionMapViewport | null;
}): PointerMapCoordinate | null {
  if (basemap && overlayUsesBasemapProjection && typeof basemap.getCenter === "function") {
    const center = basemap.getCenter();
    return {
      point: {
        x: overlayViewBox.width / 2,
        y: overlayViewBox.height / 2,
      },
      latitude_deg: center.lat,
      longitude_deg: center.lng,
      projectedByBasemap: true,
    };
  }

  if (!viewport) {
    return null;
  }

  const point = {
    x: viewport.viewBoxSize / 2,
    y: viewport.viewBoxSize / 2,
  };
  return {
    point,
    ...unprojectMissionMapPoint(viewport, point),
    projectedByBasemap: false,
  };
}

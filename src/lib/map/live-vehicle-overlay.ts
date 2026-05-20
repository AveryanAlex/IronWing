import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import {
  createMarkerMotion,
  unwrapAngleDeg,
  type LngLatTuple,
} from "../map-marker-motion";
import { createVehicleMarkerElement, setVehicleMarkerHeading, setVehicleMarkerIcon } from "./markers";
import type { VehicleIconKind } from "../overview/vehicle-icon";

type MarkerFactory = (element: HTMLElement) => Marker;

export type LiveVehicleOverlaySync = {
  map: MapLibreMap | null;
  lngLat: LngLatTuple | null;
  headingDeg?: number | null;
  iconKind?: VehicleIconKind;
};

export function createLiveVehicleOverlay(createMarker: MarkerFactory) {
  const motion = createMarkerMotion();
  let marker: Marker | null = null;
  let attached = false;
  let renderedHeadingDeg: number | null = null;
  let renderedIconKind: VehicleIconKind | null = null;

  function ensureMarker(iconKind?: VehicleIconKind): Marker {
    if (!marker) {
      marker = createMarker(createVehicleMarkerElement({ iconKind }));
      renderedIconKind = iconKind ?? null;
      return marker;
    }

    if (iconKind && renderedIconKind !== iconKind) {
      renderedIconKind = iconKind;
      setVehicleMarkerIcon(marker.getElement(), { iconKind });
      if (renderedHeadingDeg != null) {
        setVehicleMarkerHeading(marker.getElement(), renderedHeadingDeg);
      }
    }

    return marker;
  }

  function sync({ map, lngLat, headingDeg, iconKind }: LiveVehicleOverlaySync) {
    if (!map || !lngLat) {
      if (marker && attached) {
        marker.remove();
        attached = false;
      }
      motion.reset();
      renderedHeadingDeg = null;
      return;
    }

    const currentMarker = ensureMarker(iconKind);
    if (attached) {
      motion.animateTo(currentMarker, lngLat);
    } else {
      motion.setInstant(currentMarker, lngLat);
      currentMarker.addTo(map);
      attached = true;
    }

    applyHeading(headingDeg);
  }

  function applyHeading(headingDeg?: number | null) {
    if (!marker || headingDeg == null) return;

    renderedHeadingDeg = unwrapAngleDeg(renderedHeadingDeg, headingDeg);
    setVehicleMarkerHeading(marker.getElement(), renderedHeadingDeg);
  }

  function remove() {
    motion.reset();
    marker?.remove();
    marker = null;
    attached = false;
    renderedHeadingDeg = null;
    renderedIconKind = null;
  }

  return {
    applyHeading,
    getMarker: () => marker,
    isAttached: () => attached,
    remove,
    resetMotion: motion.reset,
    sync,
  };
}

import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import { commandPosition, geoPoint3dLatLon, type MissionItem, type MissionPlan } from "../mavkit-types";
import type { TypedDraftItem, TypedDraftPreview } from "../mission-draft-typed";

export type MissionMarkerSpec = {
  index: number;
  latitude_deg: number;
  longitude_deg: number;
};

type MarkerFactory = (element: HTMLElement) => Marker;

type MissionMarkerOverlayOptions = {
  className?: string;
  interactive?: boolean;
  markerScale?: number;
};

export function missionPlanToDraftItems(
  plan: MissionPlan | null,
  fallbackPath: Array<{ lat: number; lon: number }> = [],
): TypedDraftItem[] {
  const items = plan?.items ?? fallbackPath.map(createMissionPathFallbackItem);
  return items.map((item, index) => ({
    uiId: index + 1,
    index,
    document: item,
    readOnly: false,
    preview: missionItemPreview(item),
  }));
}

export function missionPlanToMarkerSpecs(plan: MissionPlan | null): MissionMarkerSpec[] {
  if (!plan) {
    return [];
  }

  const specs: MissionMarkerSpec[] = [];
  plan.items.forEach((item, index) => {
    const coordinate = missionItemCoordinate(item);
    if (!coordinate) {
      return;
    }

    specs.push({ index, ...coordinate });
  });
  return specs;
}

export function createMissionMarkerOverlay(
  createMarker: MarkerFactory,
  options: MissionMarkerOverlayOptions = {},
) {
  const markers = new Map<number, Marker>();

  function sync(map: MapLibreMap | null, specs: MissionMarkerSpec[], currentIndex: number | null) {
    if (!map) {
      clear();
      return;
    }

    const expected = new Set(specs.map((spec) => spec.index));
    for (const [index, marker] of markers) {
      if (!expected.has(index)) {
        marker.remove();
        markers.delete(index);
      }
    }

    for (const spec of specs) {
      const lngLat: [number, number] = [spec.longitude_deg, spec.latitude_deg];
      let marker = markers.get(spec.index);
      if (!marker) {
        marker = createMarker(createMissionMarkerElement(spec.index, currentIndex, options));
        markers.set(spec.index, marker);
        marker.setLngLat(lngLat).addTo(map);
      } else {
        marker.setLngLat(lngLat);
      }

      updateMissionMarkerElement(marker.getElement(), spec.index, currentIndex, options);
    }
  }

  function clear() {
    for (const marker of markers.values()) {
      marker.remove();
    }
    markers.clear();
  }

  return {
    clear,
    sync,
  };
}

function createMissionMarkerElement(
  index: number,
  currentIndex: number | null,
  options: MissionMarkerOverlayOptions,
): HTMLElement {
  const element = options.interactive ?? true ? document.createElement("button") : document.createElement("div");
  if (element instanceof HTMLButtonElement) {
    element.type = "button";
  } else {
    element.setAttribute("role", "img");
  }
  element.addEventListener("click", (event) => event.stopPropagation());
  updateMissionMarkerElement(element, index, currentIndex, options);
  return element;
}

function updateMissionMarkerElement(
  element: HTMLElement,
  index: number,
  currentIndex: number | null,
  options: MissionMarkerOverlayOptions,
) {
  const isCurrent = currentIndex !== null && index === currentIndex;
  const isNext = currentIndex !== null && index === currentIndex + 1;
  element.className = [
    "mission-pin",
    options.className,
    isCurrent && "is-current",
    isNext && "is-next",
  ].filter(Boolean).join(" ");
  element.textContent = String(index + 1);
  element.setAttribute("aria-label", `Mission item ${index + 1}${isCurrent ? " current" : isNext ? " next" : ""}`);

  if (options.markerScale) {
    element.style.width = `${28 * options.markerScale}px`;
    element.style.height = `${28 * options.markerScale}px`;
    element.style.fontSize = `${12 * options.markerScale}px`;
  }
}

function missionItemPreview(item: MissionItem): TypedDraftPreview {
  const coordinate = missionItemCoordinate(item);
  return {
    latitude_deg: coordinate?.latitude_deg ?? null,
    longitude_deg: coordinate?.longitude_deg ?? null,
    altitude_m: null,
  };
}

function missionItemCoordinate(item: MissionItem): Omit<MissionMarkerSpec, "index"> | null {
  const position = commandPosition(item.command);
  if (!position) {
    return null;
  }

  const coordinate = geoPoint3dLatLon(position);
  if (!Number.isFinite(coordinate.latitude_deg) || !Number.isFinite(coordinate.longitude_deg)) {
    return null;
  }

  return coordinate;
}

function createMissionPathFallbackItem(point: { lat: number; lon: number }): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: {
            RelHome: {
              latitude_deg: point.lat,
              longitude_deg: point.lon,
              relative_alt_m: 25,
            },
          },
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

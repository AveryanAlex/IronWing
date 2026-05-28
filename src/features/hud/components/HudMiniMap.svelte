<script lang="ts">
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import type { HomePosition, MissionPlan } from "../../../mission";
import { buildMissionRenderFeatures } from "../../../lib/mission-path-render";
import {
  VEHICLE_MARKER_MOTION_MS,
  type LngLatTuple,
} from "../../../lib/map-marker-motion";
import {
  createHomeMarkerElement,
  ensureBuildingExtrusionLayer,
  ensureMissionPathLayers,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  updateMissionPathSource,
} from "../../../lib/map";
import { createLiveVehicleOverlay } from "../../../lib/map/live-vehicle-overlay";
import {
  createMissionMarkerOverlay,
  missionPlanToDraftItems,
  missionPlanToMarkerSpecs,
} from "../../../lib/map/mission-plan-overlay";
import BaseMap from "../../map/components/BaseMap.svelte";

type Props = {
  latitude: number;
  longitude: number;
  heading?: number;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  homeAltitude?: number | null;
  missionPlan?: MissionPlan | null;
  currentMissionIndex?: number | null;
};

let {
  latitude,
  longitude,
  heading = 0,
  homeLatitude,
  homeLongitude,
  homeAltitude,
  missionPlan = null,
  currentMissionIndex = null,
}: Props = $props();

const missionHome = $derived.by<HomePosition | null>(() => toHomePosition(homeLatitude, homeLongitude, homeAltitude));
const missionRenderItems = $derived.by(() => missionPlanToDraftItems(missionPlan));
const missionRenderFeatures = $derived.by(() =>
  buildMissionRenderFeatures(missionHome, missionRenderItems, { currentSeq: currentMissionIndex }),
);
const missionMarkerSpecs = $derived.by(() => missionPlanToMarkerSpecs(missionPlan));

let styleLoaded = $state(false);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let homeMarker: Marker | null = null;
const vehicleOverlay = createLiveVehicleOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
);
const missionMarkerOverlay = createMissionMarkerOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
  { className: "is-hud", interactive: false, markerScale: 0.68 },
);

function createMiniMapOptions() {
  return {
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: [longitude, latitude],
    zoom: 15,
    scrollZoom: true,
    touchZoomRotate: true,
    attributionControl: false,
  };
}

function handleMapReady(createdMap: MapLibreMap) {
  map = createdMap;
  styleLoaded = false;

  map.addControl(
    new maplibregl.NavigationControl({ showZoom: true, showCompass: false }),
    "top-right",
  );

  vehicleOverlay.sync({ map, lngLat: currentLngLat(), headingDeg: heading });
  syncHomeMarker();

  if (typeof map.on === "function") {
    map.on("load", syncMissionOverlay);
    map.on("style.load", syncMissionOverlay);
  }

  return () => {
    vehicleOverlay.remove();
    missionMarkerOverlay.clear();
    homeMarker?.remove();
    map = null;
    homeMarker = null;
    styleLoaded = false;
  };
}

// Sync vehicle position and heading
$effect(() => {
  const lngLat = currentLngLat();
  vehicleOverlay.sync({ map, lngLat, headingDeg: heading });
  map?.easeTo({
    center: lngLat,
    duration: VEHICLE_MARKER_MOTION_MS,
    easing: linearEasing,
  });
});

$effect(() => {
  vehicleOverlay.applyHeading(heading);
});

$effect(() => {
  syncHomeMarker();
});

$effect(() => {
  if (!styleLoaded || !map) return;
  updateMissionPathSource(map, missionRenderFeatures);
  missionMarkerOverlay.sync(map, missionMarkerSpecs, currentMissionIndex);
});

function currentLngLat(): LngLatTuple {
  return [longitude, latitude];
}

function linearEasing(progress: number): number {
  return progress;
}

function toHomePosition(latitude?: number | null, longitude?: number | null, altitude?: number | null): HomePosition | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude_deg: Number(latitude),
    longitude_deg: Number(longitude),
    altitude_m: Number.isFinite(altitude) ? Number(altitude) : 0,
  };
}

function syncMissionOverlay() {
  if (!map) return;

  ensureBuildingExtrusionLayer(map);
  ensureMissionPathLayers(map, true);
  updateMissionPathSource(map, missionRenderFeatures);
  missionMarkerOverlay.sync(map, missionMarkerSpecs, currentMissionIndex);
  styleLoaded = true;
}

function syncHomeMarker() {
  if (!map) return;

  if (!hasHomePosition()) {
    homeMarker?.remove();
    homeMarker = null;
    return;
  }

  const lngLat: LngLatTuple = [homeLongitude!, homeLatitude!];

  if (homeMarker) {
    homeMarker.setLngLat(lngLat);
    return;
  }

  homeMarker = new maplibregl.Marker({
    element: createHomeMarkerElement(),
    anchor: "center",
  })
    .setLngLat(lngLat)
    .addTo(map);
}

function hasHomePosition(): boolean {
  return typeof homeLatitude === "number"
    && typeof homeLongitude === "number"
    && Number.isFinite(homeLatitude)
    && Number.isFinite(homeLongitude);
}
</script>

<div class="hud-minimap__map size-full">
  <BaseMap options={createMiniMapOptions()} onMapReady={handleMapReady} />
</div>

<style>
  .hud-minimap__map :global(.maplibregl-ctrl-top-right) {
    top: 4px;
    right: 4px;
  }

  .hud-minimap__map :global(.maplibregl-ctrl-group) {
    overflow: hidden;
    border: 1px solid rgba(18, 185, 255, 0.35);
    background: rgba(7, 16, 24, 0.72);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
  }

  .hud-minimap__map :global(.maplibregl-ctrl button) {
    width: 24px;
    height: 24px;
  }
</style>

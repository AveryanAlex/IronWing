<script lang="ts">
import { onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";

import {
  createMarkerMotion,
  unwrapAngleDeg,
  type LngLatTuple,
} from "../../lib/map-marker-motion";
import {
  createHomeMarkerElement,
  createVehicleMarkerElement,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  setVehicleMarkerHeading,
} from "../../lib/map";

type Props = {
  latitude: number;
  longitude: number;
  heading?: number;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
};

let { latitude, longitude, heading = 0, homeLatitude, homeLongitude }: Props = $props();

let mapContainer = $state<HTMLDivElement | null>(null);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let homeMarker: Marker | null = null;
let renderedVehicleHeadingDeg: number | null = null;
const vehicleMotion = createMarkerMotion();

onMount(() => {
  if (!mapContainer) return;

  map = new maplibregl.Map({
    container: mapContainer,
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: [longitude, latitude],
    zoom: 15,
    attributionControl: false,
  });

  const vehicleEl = createVehicleMarkerElement();
  vehicleMarker = new maplibregl.Marker({ element: vehicleEl, anchor: "center" });
  vehicleMotion.setInstant(vehicleMarker, currentLngLat());
  vehicleMarker.addTo(map);
  applyVehicleHeading(heading);
  syncHomeMarker();

  return () => {
    vehicleMotion.reset();
    homeMarker?.remove();
    vehicleMarker?.remove();
    map?.remove();
    map = null;
    homeMarker = null;
    vehicleMarker = null;
    renderedVehicleHeadingDeg = null;
  };
});

// Sync vehicle position and heading
$effect(() => {
  if (!vehicleMarker) return;
  const lngLat = currentLngLat();
  vehicleMotion.animateTo(vehicleMarker, lngLat);
  map?.setCenter(lngLat);
});

$effect(() => {
  applyVehicleHeading(heading);
});

$effect(() => {
  syncHomeMarker();
});

function currentLngLat(): LngLatTuple {
  return [longitude, latitude];
}

function applyVehicleHeading(headingDeg: number) {
  if (!vehicleMarker) return;

  renderedVehicleHeadingDeg = unwrapAngleDeg(renderedVehicleHeadingDeg, headingDeg);
  setVehicleMarkerHeading(vehicleMarker.getElement(), renderedVehicleHeadingDeg);
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

<div bind:this={mapContainer} class="size-full"></div>

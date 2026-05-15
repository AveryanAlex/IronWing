<script lang="ts">
import { onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";

import {
  createMarkerMotion,
  unwrapAngleDeg,
  type LngLatTuple,
} from "../../lib/map-marker-motion";

type Props = {
  latitude: number;
  longitude: number;
  heading?: number;
};

let { latitude, longitude, heading = 0 }: Props = $props();

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

let mapContainer = $state<HTMLDivElement | null>(null);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let vehicleSvg: SVGSVGElement | null = null;
let renderedVehicleHeadingDeg: number | null = null;
const vehicleMotion = createMarkerMotion();

onMount(() => {
  if (!mapContainer) return;

  map = new maplibregl.Map({
    container: mapContainer,
    style: MAP_STYLE_URL,
    center: [longitude, latitude],
    zoom: 15,
    attributionControl: false,
  });

  // Vehicle marker
  const vehicleEl = document.createElement("div");
  vehicleEl.innerHTML = `<svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="10" fill="#12b9ff" stroke="#072035" stroke-width="2"/>
    <polygon points="16,4 20,16 16,13 12,16" fill="#fff"/>
  </svg>`;
  vehicleSvg = vehicleEl.querySelector("svg");

  vehicleMarker = new maplibregl.Marker({ element: vehicleEl, anchor: "center" });
  vehicleMotion.setInstant(vehicleMarker, currentLngLat());
  vehicleMarker.addTo(map);
  applyVehicleHeading(heading);

  return () => {
    vehicleMotion.reset();
    vehicleMarker?.remove();
    map?.remove();
    map = null;
    vehicleMarker = null;
    vehicleSvg = null;
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

function currentLngLat(): LngLatTuple {
  return [longitude, latitude];
}

function applyVehicleHeading(headingDeg: number) {
  if (!vehicleSvg) return;

  renderedVehicleHeadingDeg = unwrapAngleDeg(renderedVehicleHeadingDeg, headingDeg);
  vehicleSvg.style.transform = `rotate(${renderedVehicleHeadingDeg}deg)`;
}
</script>

<div bind:this={mapContainer} class="size-full"></div>

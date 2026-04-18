<script lang="ts">
import { onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap, type Marker, type GeoJSONSource } from "maplibre-gl";

type Props = {
  vehicleLat?: number;
  vehicleLon?: number;
  vehicleHeading?: number;
  homeLat?: number;
  homeLon?: number;
  missionPath?: Array<{ lat: number; lon: number }>;
};

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const MISSION_PATH_SOURCE_ID = "overview-mission-path";
const MISSION_PATH_LAYER_ID = "overview-mission-path-line";

let {
  vehicleLat,
  vehicleLon,
  vehicleHeading = 0,
  homeLat,
  homeLon,
  missionPath = [],
}: Props = $props();

let mapContainer = $state<HTMLDivElement | null>(null);

// Held as plain variables rather than $state to avoid reactive proxy wrapping
// of MapLibre's internal object graph, which would break its methods.
let map: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let homeMarker: Marker | null = null;
let vehicleSvg: SVGSVGElement | null = null;
let styleLoaded = $state(false);

onMount(() => {
  if (!mapContainer) return;

  const initialCenter: [number, number] =
    vehicleLat !== undefined && vehicleLon !== undefined
      ? [vehicleLon, vehicleLat]
      : [0, 0];

  map = new maplibregl.Map({
    container: mapContainer,
    style: MAP_STYLE_URL,
    center: initialCenter,
    zoom: 15,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  // Vehicle marker: circle with a heading arrow
  const vehicleEl = document.createElement("div");
  vehicleEl.className = "vehicle-marker";
  vehicleEl.innerHTML = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="10" fill="#12b9ff" stroke="#072035" stroke-width="2"/>
    <polygon points="16,4 20,16 16,13 12,16" fill="#fff"/>
  </svg>`;
  vehicleSvg = vehicleEl.querySelector("svg");

  vehicleMarker = new maplibregl.Marker({ element: vehicleEl, anchor: "center" });
  if (vehicleLat !== undefined && vehicleLon !== undefined) {
    vehicleMarker.setLngLat([vehicleLon, vehicleLat]).addTo(map);
  }

  // Home marker: solid green circle
  const homeEl = document.createElement("div");
  homeEl.style.cssText =
    "width:20px;height:20px;border-radius:50%;background:#57e38b;border:2px solid #072035;box-shadow:0 2px 6px rgba(0,0,0,0.35);";

  homeMarker = new maplibregl.Marker({ element: homeEl, anchor: "center" });
  if (homeLat !== undefined && homeLon !== undefined) {
    homeMarker.setLngLat([homeLon, homeLat]).addTo(map);
  }

  map.on("load", () => {
    if (!map) return;

    map.addSource(MISSION_PATH_SOURCE_ID, {
      type: "geojson",
      data: buildPathGeoJson(missionPath),
    });

    map.addLayer({
      id: MISSION_PATH_LAYER_ID,
      type: "line",
      source: MISSION_PATH_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "rgba(241, 245, 249, 0.82)",
        "line-width": 2,
      },
    });

    // Signal that the style/layers are ready so $effects can update sources
    styleLoaded = true;
  });

  return () => {
    vehicleMarker?.remove();
    homeMarker?.remove();
    map?.remove();
    map = null;
    vehicleMarker = null;
    homeMarker = null;
    vehicleSvg = null;
    styleLoaded = false;
  };
});

// Sync vehicle position and heading whenever props change
$effect(() => {
  if (!vehicleMarker || vehicleLat === undefined || vehicleLon === undefined) return;
  vehicleMarker.setLngLat([vehicleLon, vehicleLat]);
  if (vehicleSvg) {
    vehicleSvg.style.transform = `rotate(${vehicleHeading}deg)`;
  }
});

// Sync home marker position whenever props change
$effect(() => {
  if (!homeMarker || homeLat === undefined || homeLon === undefined) return;
  homeMarker.setLngLat([homeLon, homeLat]);
});

// Sync mission path GeoJSON source whenever path or style readiness changes
$effect(() => {
  if (!styleLoaded || !map) return;
  const source = map.getSource(MISSION_PATH_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildPathGeoJson(missionPath));
});

function buildPathGeoJson(
  path: Array<{ lat: number; lon: number }>,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: path.map((point) => [point.lon, point.lat]),
    },
  };
}
</script>

<div bind:this={mapContainer} class="overview-map-container"></div>

<style>
  .overview-map-container {
    width: 100%;
    height: 100%;
  }
</style>

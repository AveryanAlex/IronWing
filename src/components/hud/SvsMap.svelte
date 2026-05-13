<script lang="ts">
import { onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

type Props = {
  latitude_deg: number;
  longitude_deg: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  altitude_m: number;
};

let { latitude_deg, longitude_deg, heading_deg, pitch_deg, roll_deg, altitude_m }: Props = $props();

const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

let mapContainer = $state<HTMLDivElement | null>(null);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let styleLoaded = $state(false);

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

onMount(() => {
  if (!mapContainer) return;

  map = new maplibregl.Map({
    container: mapContainer,
    style: BASE_STYLE_URL,
    center: [longitude_deg, latitude_deg],
    zoom: 14,
    pitch: 75,
    maxPitch: 85,
    interactive: false,
    attributionControl: false,
  });

  map.on("style.load", () => {
    if (!map) return;

    // Satellite raster source
    map.addSource("satelliteSource", {
      type: "raster",
      tiles: [SATELLITE_TILE_URL],
      tileSize: 256,
      maxzoom: 15,
    });

    // Terrain DEM source
    map.addSource("terrainSource", {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 13,
      encoding: "terrarium",
    });

    // Hillshade source (same DEM)
    map.addSource("hillshadeSource", {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 13,
      encoding: "terrarium",
    });

    // Satellite layer
    map.addLayer({
      id: "satellite",
      type: "raster",
      source: "satelliteSource",
      paint: { "raster-opacity": 1.0 },
    });

    // Hillshade layer
    map.addLayer({
      id: "hills",
      type: "hillshade",
      source: "hillshadeSource",
      paint: {
        "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "#000",
      },
    });

    // Enable 3D terrain
    map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });

    // Atmospheric effects
    map.setSky({
      "sky-color": "#199EF3",
      "sky-horizon-blend": 0.7,
      "horizon-color": "#f0f8ff",
      "fog-color": "#9ec7e8",
      "fog-ground-blend": 0.6,
      "atmosphere-blend": 0.8,
    });

    styleLoaded = true;
  });

  return () => {
    map?.remove();
    map = null;
    styleLoaded = false;
  };
});

// Camera tracking: update on every telemetry change
$effect(() => {
  if (!map || !styleLoaded) return;

  map.jumpTo({
    center: [longitude_deg, latitude_deg],
    zoom: clamp(16.5 - Math.log2(Math.max(10, altitude_m) / 30), 11, 17),
    bearing: heading_deg,
    pitch: clamp(75 - pitch_deg, 20, 85),
    roll: roll_deg,
  });
});
</script>

<div bind:this={mapContainer} class="size-full"></div>

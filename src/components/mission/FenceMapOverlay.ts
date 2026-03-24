import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { FenceRegion, GeoPoint2d } from "../../lib/mavkit-types";

const FENCE_SOURCE = "fence-regions";
const FENCE_FILL_LAYER = "fence-fill";
const FENCE_LINE_INCLUSION_LAYER = "fence-line-inclusion";
const FENCE_LINE_EXCLUSION_LAYER = "fence-line-exclusion";

const METERS_PER_DEG_LAT = 111320;

/** Generate a circle polygon approximation from center + radius. */
export function circleToPolygon(
  center: GeoPoint2d,
  radius_m: number,
  numVertices = 64,
): GeoJSON.Polygon {
  const metersPerDegLon =
    METERS_PER_DEG_LAT * Math.cos((center.latitude_deg * Math.PI) / 180);

  const coordinates: [number, number][] = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = (2 * Math.PI * i) / numVertices;
    const dLat = (radius_m * Math.cos(angle)) / METERS_PER_DEG_LAT;
    const dLon = (radius_m * Math.sin(angle)) / metersPerDegLon;
    coordinates.push([
      center.longitude_deg + dLon,
      center.latitude_deg + dLat,
    ]);
  }
  // Close the ring
  coordinates.push(coordinates[0]);

  return { type: "Polygon", coordinates: [coordinates] };
}

type FenceFeatureProperties = {
  regionIndex: number;
  isExclusion: boolean;
  isSelected: boolean;
  inclusionGroup: number | null;
};

/** Convert FenceRegion[] to a GeoJSON FeatureCollection for MapLibre. */
export function fenceRegionsToGeoJson(
  regions: FenceRegion[],
  selectedIndex: number | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const isSelected = i === selectedIndex;

    if ("inclusion_polygon" in region) {
      const { vertices, inclusion_group } = region.inclusion_polygon;
      features.push({
        type: "Feature",
        geometry: verticesToPolygon(vertices),
        properties: {
          regionIndex: i,
          isExclusion: false,
          isSelected,
          inclusionGroup: inclusion_group,
        } satisfies FenceFeatureProperties,
      });
    } else if ("exclusion_polygon" in region) {
      const { vertices } = region.exclusion_polygon;
      features.push({
        type: "Feature",
        geometry: verticesToPolygon(vertices),
        properties: {
          regionIndex: i,
          isExclusion: true,
          isSelected,
          inclusionGroup: null,
        } satisfies FenceFeatureProperties,
      });
    } else if ("inclusion_circle" in region) {
      const { center, radius_m, inclusion_group } = region.inclusion_circle;
      features.push({
        type: "Feature",
        geometry: circleToPolygon(center, radius_m),
        properties: {
          regionIndex: i,
          isExclusion: false,
          isSelected,
          inclusionGroup: inclusion_group,
        } satisfies FenceFeatureProperties,
      });
    } else if ("exclusion_circle" in region) {
      const { center, radius_m } = region.exclusion_circle;
      features.push({
        type: "Feature",
        geometry: circleToPolygon(center, radius_m),
        properties: {
          regionIndex: i,
          isExclusion: true,
          isSelected,
          inclusionGroup: null,
        } satisfies FenceFeatureProperties,
      });
    }
  }

  return { type: "FeatureCollection", features };
}

function verticesToPolygon(vertices: GeoPoint2d[]): GeoJSON.Polygon {
  const coords: [number, number][] = vertices.map((v) => [
    v.longitude_deg,
    v.latitude_deg,
  ]);
  // Close the ring
  if (coords.length > 0) {
    coords.push(coords[0]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

/** Ensure the fence source and layers exist on the map. Idempotent. */
export function ensureFenceLayers(map: MapLibreMap): void {
  if (!map.getSource(FENCE_SOURCE)) {
    map.addSource(FENCE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(FENCE_FILL_LAYER)) {
    map.addLayer({
      id: FENCE_FILL_LAYER,
      type: "fill",
      source: FENCE_SOURCE,
      paint: {
        "fill-color": [
          "case",
          ["get", "isExclusion"],
          "rgba(239,68,68,0.12)",
          "rgba(59,130,246,0.12)",
        ],
        "fill-opacity": ["case", ["get", "isSelected"], 0.25, 0.12],
      },
    });
  }

  if (!map.getLayer(FENCE_LINE_INCLUSION_LAYER)) {
    map.addLayer({
      id: FENCE_LINE_INCLUSION_LAYER,
      type: "line",
      source: FENCE_SOURCE,
      filter: ["==", ["get", "isExclusion"], false],
      paint: {
        "line-color": "#3b82f6",
        "line-width": ["case", ["get", "isSelected"], 3, 1.5],
        "line-dasharray": [4, 3],
      },
    });
  }

  if (!map.getLayer(FENCE_LINE_EXCLUSION_LAYER)) {
    map.addLayer({
      id: FENCE_LINE_EXCLUSION_LAYER,
      type: "line",
      source: FENCE_SOURCE,
      filter: ["==", ["get", "isExclusion"], true],
      paint: {
        "line-color": "#ef4444",
        "line-width": ["case", ["get", "isSelected"], 3, 1.5],
      },
    });
  }
}

/** Update the fence GeoJSON source data. */
export function updateFenceSource(
  map: MapLibreMap,
  regions: FenceRegion[],
  selectedIndex: number | null,
): void {
  const source = map.getSource(FENCE_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const geoJson = fenceRegionsToGeoJson(regions, selectedIndex);
  source.setData(geoJson);
}

/** Remove fence layers and source from the map. */
export function removeFenceLayers(map: MapLibreMap): void {
  for (const layerId of [
    FENCE_FILL_LAYER,
    FENCE_LINE_INCLUSION_LAYER,
    FENCE_LINE_EXCLUSION_LAYER,
  ]) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }
  if (map.getSource(FENCE_SOURCE)) {
    map.removeSource(FENCE_SOURCE);
  }
}

import type {
  HillshadeLayerSpecification,
  Map as MapLibreMap,
  RasterDEMSourceSpecification,
  RasterLayerSpecification,
  RasterSourceSpecification,
} from "maplibre-gl";

import {
  EOX_SATELLITE_TILE_URL,
  MAP_TILE_DEFAULTS,
  TERRARIUM_DEM_TILE_URL,
} from "./constants";

export type MapLayerMode = "normal" | "hybrid" | "satellite";
export type MapLayerVisibility = "visible" | "none";

export type MapFoundationIds = {
  satelliteSourceId: string;
  terrainSourceId: string;
  hillshadeSourceId: string;
  satelliteLayerId: string;
  hillshadeLayerId: string;
};

export type MapFoundationIdOptions = {
  namespace?: string;
  prefix?: string;
  ids?: Partial<MapFoundationIds>;
};

export type EnsureMapFoundationOptions = MapFoundationIdOptions & {
  satelliteTileUrl?: string;
  demTileUrl?: string;
  satelliteTileSize?: number;
  demTileSize?: number;
  satelliteMaxZoom?: number;
  demMaxZoom?: number;
  satelliteBeforeLayerId?: string | null;
  hillshadeBeforeLayerId?: string | null;
  satelliteVisible?: boolean;
  hillshadeVisible?: boolean;
  hillshadeShadowColor?: string;
  hillshadeExaggeration?: number;
  terrainEnabled?: boolean;
  terrainExaggeration?: number;
};

export type ApplyMapLayerModeOptions = MapFoundationIdOptions & {
  baseLayerIds: readonly string[];
  includeHillshade?: boolean;
};

export function resolveMapFoundationIds(options: MapFoundationIdOptions = {}): MapFoundationIds {
  const prefix = options.prefix ?? `${options.namespace ?? "map"}-`;

  return {
    satelliteSourceId: `${prefix}satellite-source`,
    terrainSourceId: `${prefix}terrain-source`,
    hillshadeSourceId: `${prefix}hillshade-source`,
    satelliteLayerId: `${prefix}satellite`,
    hillshadeLayerId: `${prefix}hills`,
    ...options.ids,
  };
}

export function getMapLayerIds(
  map: MapLibreMap,
  options: { excludeLayerIds?: Iterable<string> } = {},
): string[] {
  const excluded = new Set(options.excludeLayerIds ?? []);
  return (map.getStyle().layers ?? [])
    .filter((layer) => !excluded.has(layer.id))
    .map((layer) => layer.id);
}

export function getFirstNonFillLayerId(map: MapLibreMap): string | undefined {
  return (map.getStyle().layers ?? []).find(
    (layer) => layer.type !== "fill" && layer.type !== "background",
  )?.id;
}

export function ensureSatelliteLayer(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = resolveMapFoundationIds(options);

  if (!map.getSource(ids.satelliteSourceId)) {
    const source: RasterSourceSpecification = {
      type: "raster",
      tiles: [options.satelliteTileUrl ?? EOX_SATELLITE_TILE_URL],
      tileSize: options.satelliteTileSize ?? MAP_TILE_DEFAULTS.satelliteTileSize,
      maxzoom: options.satelliteMaxZoom ?? MAP_TILE_DEFAULTS.satelliteMaxZoom,
    };
    map.addSource(ids.satelliteSourceId, source);
  }

  if (!map.getLayer(ids.satelliteLayerId)) {
    const layer: RasterLayerSpecification = {
      id: ids.satelliteLayerId,
      type: "raster",
      source: ids.satelliteSourceId,
      layout: { visibility: options.satelliteVisible ? "visible" : "none" },
      paint: { "raster-opacity": 1 },
    };
    const beforeLayerId = options.satelliteBeforeLayerId === undefined
      ? getFirstNonFillLayerId(map)
      : options.satelliteBeforeLayerId;
    addLayer(map, layer, beforeLayerId);
  }

  return ids;
}

export function ensureTerrainSource(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = resolveMapFoundationIds(options);

  if (!map.getSource(ids.terrainSourceId)) {
    map.addSource(ids.terrainSourceId, createTerrariumDemSource(options));
  }

  return ids;
}

export function ensureHillshadeLayer(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = resolveMapFoundationIds(options);

  if (!map.getSource(ids.hillshadeSourceId)) {
    map.addSource(ids.hillshadeSourceId, createTerrariumDemSource(options));
  }

  if (!map.getLayer(ids.hillshadeLayerId)) {
    const layer: HillshadeLayerSpecification = {
      id: ids.hillshadeLayerId,
      type: "hillshade",
      source: ids.hillshadeSourceId,
      layout: { visibility: options.hillshadeVisible ? "visible" : "none" },
      paint: {
        "hillshade-shadow-color": options.hillshadeShadowColor ?? MAP_TILE_DEFAULTS.hillshadeShadowColor,
        "hillshade-exaggeration": options.hillshadeExaggeration ?? MAP_TILE_DEFAULTS.hillshadeExaggeration,
      },
    };
    addLayer(map, layer, options.hillshadeBeforeLayerId ?? undefined);
  }

  return ids;
}

export function ensureMapFoundation(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = ensureSatelliteLayer(map, options);
  ensureTerrainSource(map, options);
  ensureHillshadeLayer(map, options);

  if (typeof options.terrainEnabled === "boolean") {
    setMapTerrain(map, options.terrainEnabled, options);
  }

  return ids;
}

export function setMapTerrain(
  map: MapLibreMap,
  enabled: boolean,
  options: EnsureMapFoundationOptions = {},
): void {
  const ids = ensureTerrainSource(map, options);
  map.setTerrain(
    enabled
      ? {
          source: ids.terrainSourceId,
          exaggeration: options.terrainExaggeration ?? MAP_TILE_DEFAULTS.terrainExaggeration,
        }
      : null,
  );
}

export function safeSetLayerVisibility(
  map: MapLibreMap,
  layerId: string,
  visibility: MapLayerVisibility,
): boolean {
  try {
    if (!map.getLayer(layerId)) return false;
    map.setLayoutProperty(layerId, "visibility", visibility);
    return true;
  } catch {
    return false;
  }
}

export function applyMapLayerMode(
  map: MapLibreMap,
  mode: MapLayerMode,
  options: ApplyMapLayerModeOptions,
): void {
  const ids = resolveMapFoundationIds(options);
  const showSatellite = mode !== "normal";
  const showVector = mode !== "satellite";

  safeSetLayerVisibility(map, ids.satelliteLayerId, showSatellite ? "visible" : "none");

  if (options.includeHillshade ?? true) {
    safeSetLayerVisibility(map, ids.hillshadeLayerId, showSatellite ? "visible" : "none");
  }

  for (const layerId of options.baseLayerIds) {
    safeSetLayerVisibility(map, layerId, showVector ? "visible" : "none");
  }
}

function createTerrariumDemSource(options: EnsureMapFoundationOptions): RasterDEMSourceSpecification {
  return {
    type: "raster-dem",
    tiles: [options.demTileUrl ?? TERRARIUM_DEM_TILE_URL],
    tileSize: options.demTileSize ?? MAP_TILE_DEFAULTS.demTileSize,
    maxzoom: options.demMaxZoom ?? MAP_TILE_DEFAULTS.demMaxZoom,
    encoding: "terrarium",
  };
}

function addLayer(
  map: MapLibreMap,
  layer: RasterLayerSpecification | HillshadeLayerSpecification,
  beforeLayerId: string | null | undefined,
): void {
  if (beforeLayerId) {
    map.addLayer(layer, beforeLayerId);
    return;
  }

  map.addLayer(layer);
}

import type {
  HillshadeLayerSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  RasterDEMSourceSpecification,
  RasterLayerSpecification,
  RasterSourceSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";

import {
  MAP_TILE_DEFAULTS,
  MAPTERHORN_DEM_TILEJSON_URL,
  OPENFREEMAP_VECTOR_TILEJSON_URL,
  TERRARIUM_DEM_TILE_URL,
  getDefaultSatelliteRasterSources,
  type SatelliteRasterSourceConfig,
} from "./constants";

export type MapLayerMode = "normal" | "hybrid" | "satellite";
export type MapLayerVisibility = "visible" | "none";

export type MapFoundationIds = {
  satelliteSourceId: string;
  satelliteDetailSourceId: string;
  terrainSourceId: string;
  hillshadeSourceId: string;
  satelliteLayerId: string;
  satelliteDetailLayerId: string;
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
  demTileJsonUrl?: string;
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

export type BuildingExtrusionOptions = {
  sourceId?: string;
  sourceLayer?: string;
  sourceUrl?: string;
  layerId?: string;
  beforeLayerId?: string | null;
  visible?: boolean;
};

export const BUILDING_EXTRUSION_LAYER_ID = "map-building-extrusions";
export const OPENMAPTILES_SOURCE_ID = "openmaptiles";
const OPENMAPTILES_BUILDING_SOURCE_LAYER = "building";

export function resolveMapFoundationIds(options: MapFoundationIdOptions = {}): MapFoundationIds {
  const prefix = options.prefix ?? `${options.namespace ?? "map"}-`;

  return {
    satelliteSourceId: `${prefix}satellite-source`,
    satelliteDetailSourceId: `${prefix}satellite-detail-source`,
    terrainSourceId: `${prefix}terrain-source`,
    hillshadeSourceId: `${prefix}hillshade-source`,
    satelliteLayerId: `${prefix}satellite`,
    satelliteDetailLayerId: `${prefix}satellite-detail`,
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
  const satelliteSources = getSatelliteRasterSources(options);
  const beforeLayerId = options.satelliteBeforeLayerId === undefined
    ? getFirstNonFillLayerId(map)
    : options.satelliteBeforeLayerId;

  ensureSatelliteRasterLayer(map, {
    sourceId: ids.satelliteSourceId,
    layerId: ids.satelliteLayerId,
    source: satelliteSources[0],
    visible: options.satelliteVisible ?? false,
    beforeLayerId,
  });

  if (satelliteSources[1]) {
    ensureSatelliteRasterLayer(map, {
      sourceId: ids.satelliteDetailSourceId,
      layerId: ids.satelliteDetailLayerId,
      source: satelliteSources[1],
      visible: options.satelliteVisible ?? false,
      beforeLayerId,
    });
  }

  return ids;
}

function getSatelliteRasterSources(options: EnsureMapFoundationOptions): [SatelliteRasterSourceConfig, ...SatelliteRasterSourceConfig[]] {
  if (options.satelliteTileUrl) {
    return [{
      provider: "custom",
      tileUrl: options.satelliteTileUrl,
      tileSize: options.satelliteTileSize ?? MAP_TILE_DEFAULTS.satelliteTileSize,
      sourceMinZoom: 0,
      sourceMaxZoom: options.satelliteMaxZoom ?? MAP_TILE_DEFAULTS.satelliteMaxZoom,
      layerMinZoom: 0,
      layerMaxZoom: MAP_TILE_DEFAULTS.satelliteLayerMaxZoom,
    }];
  }

  return getDefaultSatelliteRasterSources();
}

function ensureSatelliteRasterLayer(
  map: MapLibreMap,
  options: {
    sourceId: string;
    layerId: string;
    source: SatelliteRasterSourceConfig;
    visible: boolean;
    beforeLayerId: string | null | undefined;
  },
): void {
  if (!map.getSource(options.sourceId)) {
    const source: RasterSourceSpecification = {
      type: "raster",
      tiles: [options.source.tileUrl],
      tileSize: options.source.tileSize,
      minzoom: options.source.sourceMinZoom,
      maxzoom: options.source.sourceMaxZoom,
      attribution: options.source.attribution,
    };
    map.addSource(options.sourceId, source);
  }

  if (!map.getLayer(options.layerId)) {
    const layer: RasterLayerSpecification = {
      id: options.layerId,
      type: "raster",
      source: options.sourceId,
      minzoom: options.source.layerMinZoom,
      maxzoom: options.source.layerMaxZoom,
      layout: { visibility: options.visible ? "visible" : "none" },
      paint: { "raster-opacity": 1, "raster-fade-duration": 200 },
    };
    addLayer(map, layer, options.beforeLayerId);
  }
}

export function ensureTerrainSource(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = resolveMapFoundationIds(options);

  if (!map.getSource(ids.terrainSourceId)) {
    map.addSource(ids.terrainSourceId, createDemSource(options));
  }

  return ids;
}

export function ensureHillshadeLayer(
  map: MapLibreMap,
  options: EnsureMapFoundationOptions = {},
): MapFoundationIds {
  const ids = resolveMapFoundationIds(options);

  if (!map.getSource(ids.hillshadeSourceId)) {
    map.addSource(ids.hillshadeSourceId, createDemSource(options));
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

export function ensureBuildingExtrusionLayer(
  map: MapLibreMap,
  options: BuildingExtrusionOptions = {},
): string {
  const sourceId = options.sourceId ?? OPENMAPTILES_SOURCE_ID;
  const sourceLayer = options.sourceLayer ?? OPENMAPTILES_BUILDING_SOURCE_LAYER;
  const layerId = options.layerId ?? BUILDING_EXTRUSION_LAYER_ID;
  const beforeLayerId = options.beforeLayerId === undefined
    ? getFirstSymbolLayerId(map)
    : options.beforeLayerId;

  if (!map.getSource(sourceId)) {
    const source: VectorSourceSpecification = {
      type: "vector",
      url: options.sourceUrl ?? OPENFREEMAP_VECTOR_TILEJSON_URL,
    };
    map.addSource(sourceId, source);
  }

  if (!map.getLayer(layerId)) {
    const layer: LayerSpecification = {
      id: layerId,
      type: "fill-extrusion",
      source: sourceId,
      "source-layer": sourceLayer,
      minzoom: 13,
      filter: ["!=", ["get", "hide_3d"], true],
      layout: { visibility: options.visible === false ? "none" : "visible" },
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "render_height"], 0],
          0,
          "#d9dde6",
          40,
          "#b5bfd4",
          120,
          "#8192b9",
          240,
          "#4f6aa7",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0,
          15,
          ["coalesce", ["get", "render_height"], 8],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0,
          15,
          ["coalesce", ["get", "render_min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.88,
        "fill-extrusion-vertical-gradient": true,
      },
    } as LayerSpecification;
    addLayer(map, layer, beforeLayerId);
  }

  return layerId;
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
  safeSetLayerVisibility(map, ids.satelliteDetailLayerId, showSatellite ? "visible" : "none");

  if (options.includeHillshade ?? true) {
    safeSetLayerVisibility(map, ids.hillshadeLayerId, showSatellite ? "visible" : "none");
  }

  for (const layerId of options.baseLayerIds) {
    safeSetLayerVisibility(map, layerId, showVector ? "visible" : "none");
  }
}

function createDemSource(options: EnsureMapFoundationOptions): RasterDEMSourceSpecification {
  if (!options.demTileUrl) {
    return {
      type: "raster-dem",
      url: options.demTileJsonUrl ?? MAPTERHORN_DEM_TILEJSON_URL,
    };
  }

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
  layer: LayerSpecification,
  beforeLayerId: string | null | undefined,
): void {
  if (beforeLayerId) {
    map.addLayer(layer, beforeLayerId);
    return;
  }

  map.addLayer(layer);
}

function getFirstSymbolLayerId(map: MapLibreMap): string | undefined {
  return (map.getStyle().layers ?? []).find((layer) => layer.type === "symbol")?.id;
}

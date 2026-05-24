import {
  MAPTERHORN_DEM_TILEJSON_URL,
  getDefaultSatelliteRasterSources,
  type SatelliteRasterSourceConfig,
} from "./constants";

const SVS_BACKGROUND_COLOR = "#09111c";

type SvsMapStyle = {
  version: 8;
  sources: Record<string, unknown>;
  layers: Array<Record<string, unknown>>;
};

export function createSvsMapStyle(): SvsMapStyle {
  const [satelliteSource, satelliteDetailSource] = getDefaultSatelliteRasterSources();
  const sources: Record<string, unknown> = {
    satelliteSource: rasterSourceFromConfig(satelliteSource),
    terrainSource: {
      type: "raster-dem",
      url: MAPTERHORN_DEM_TILEJSON_URL,
    },
  };

  const layers: Array<Record<string, unknown>> = [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": SVS_BACKGROUND_COLOR,
      },
    },
    rasterLayerFromConfig("satellite", "satelliteSource", satelliteSource),
  ];

  if (satelliteDetailSource) {
    sources.satelliteDetailSource = rasterSourceFromConfig(satelliteDetailSource);
    layers.push(rasterLayerFromConfig("satelliteDetail", "satelliteDetailSource", satelliteDetailSource));
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

function rasterSourceFromConfig(config: SatelliteRasterSourceConfig) {
  return {
    type: "raster",
    tiles: [config.tileUrl],
    tileSize: config.tileSize,
    minzoom: config.sourceMinZoom,
    maxzoom: config.sourceMaxZoom,
    attribution: config.attribution,
  };
}

function rasterLayerFromConfig(layerId: string, sourceId: string, config: SatelliteRasterSourceConfig) {
  return {
    id: layerId,
    type: "raster",
    source: sourceId,
    minzoom: config.layerMinZoom,
    maxzoom: config.layerMaxZoom,
    paint: {
      "raster-opacity": 1,
      "raster-fade-duration": 0,
      "raster-resampling": "linear",
    },
  };
}

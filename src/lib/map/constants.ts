export const OPENFREEMAP_BRIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
export const OPENFREEMAP_VECTOR_TILEJSON_URL = "https://tiles.openfreemap.org/planet";

export const DEFAULT_EOX_SATELLITE_YEAR = 2024;
export const EOX_SATELLITE_YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2016] as const;
export type EoxSatelliteYear = typeof EOX_SATELLITE_YEARS[number];

export const EOX_SATELLITE_TILE_URL = eoxSatelliteTileUrl(DEFAULT_EOX_SATELLITE_YEAR);

export const TOMTOM_SATELLITE_TILE_URL_TEMPLATE =
  "https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key={key}";

export type SatelliteRasterProvider = "eox" | "tomtom" | "custom";

export type SatelliteRasterSourceConfig = {
  provider: SatelliteRasterProvider;
  tileUrl: string;
  tileSize: number;
  sourceMinZoom: number;
  sourceMaxZoom: number;
  layerMinZoom: number;
  layerMaxZoom: number;
  attribution?: string;
};

export type SatelliteRasterEnv = {
  VITE_IRONWING_TOMTOM_API_KEY?: string;
};

export const TERRARIUM_DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const MAPTERHORN_DEM_TILEJSON_URL = "https://tiles.mapterhorn.com/tilejson.json";

export const MAP_TILE_DEFAULTS = {
  satelliteTileSize: 256,
  satelliteMaxZoom: 14,
  satelliteLayerMaxZoom: 20,
  satelliteOverviewLayerMaxZoom: 12.2,
  satelliteDetailLayerMinZoom: 11.8,
  tomTomSatelliteMaxZoom: 19,
  demTileSize: 256,
  demMaxZoom: 15,
  terrainExaggeration: 1.5,
  hillshadeExaggeration: 0.5,
  hillshadeShadowColor: "#473B24",
} as const;

export function getDefaultSatelliteRasterSources(
  env: SatelliteRasterEnv = import.meta.env as SatelliteRasterEnv,
): [SatelliteRasterSourceConfig, ...SatelliteRasterSourceConfig[]] {
  const tomTomApiKey = tomTomApiKeyFromEnv(env);
  const eoxSource: SatelliteRasterSourceConfig = {
    provider: "eox",
    tileUrl: EOX_SATELLITE_TILE_URL,
    tileSize: MAP_TILE_DEFAULTS.satelliteTileSize,
    sourceMinZoom: 0,
    sourceMaxZoom: MAP_TILE_DEFAULTS.satelliteMaxZoom,
    layerMinZoom: 0,
    layerMaxZoom: tomTomApiKey
      ? MAP_TILE_DEFAULTS.satelliteOverviewLayerMaxZoom
      : MAP_TILE_DEFAULTS.satelliteLayerMaxZoom,
    attribution: eoxSatelliteAttribution(DEFAULT_EOX_SATELLITE_YEAR),
  };

  if (!tomTomApiKey) {
    return [eoxSource];
  }

  return [
    eoxSource,
    {
      provider: "tomtom",
      tileUrl: tomTomSatelliteTileUrl(tomTomApiKey),
      tileSize: MAP_TILE_DEFAULTS.satelliteTileSize,
      sourceMinZoom: 0,
      sourceMaxZoom: MAP_TILE_DEFAULTS.tomTomSatelliteMaxZoom,
      layerMinZoom: MAP_TILE_DEFAULTS.satelliteDetailLayerMinZoom,
      layerMaxZoom: MAP_TILE_DEFAULTS.satelliteLayerMaxZoom,
      attribution: "© TomTom, © Maxar",
    },
  ];
}

export function eoxSatelliteTileUrl(year: EoxSatelliteYear): string {
  return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`;
}

export function eoxSatelliteAttribution(year: EoxSatelliteYear): string {
  return `Sentinel-2 cloudless — <a href="https://s2maps.eu/">s2maps.eu</a> by EOX IT Services GmbH, contains modified Copernicus Sentinel data ${year}`;
}

export function tomTomSatelliteTileUrl(apiKey: string): string {
  return TOMTOM_SATELLITE_TILE_URL_TEMPLATE.replace("{key}", encodeURIComponent(apiKey));
}

function tomTomApiKeyFromEnv(env: SatelliteRasterEnv): string | null {
  return normalizeApiKey(env.VITE_IRONWING_TOMTOM_API_KEY);
}

function normalizeApiKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

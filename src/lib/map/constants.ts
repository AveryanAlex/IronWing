export const OPENFREEMAP_BRIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

export const EOX_SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";

export const TERRARIUM_DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const MAP_TILE_DEFAULTS = {
  satelliteTileSize: 256,
  satelliteMaxZoom: 15,
  demTileSize: 256,
  demMaxZoom: 15,
  terrainExaggeration: 1.5,
  hillshadeExaggeration: 0.5,
  hillshadeShadowColor: "#473B24",
} as const;

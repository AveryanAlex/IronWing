import { describe, expect, it } from "vitest";

import {
  EOX_SATELLITE_TILE_URL,
  getDefaultSatelliteRasterSources,
} from "./constants";

describe("satellite raster source defaults", () => {
  it("falls back to the public EOX satellite layer without a TomTom API key", () => {
    expect(getDefaultSatelliteRasterSources({})).toEqual([
      {
        provider: "eox",
        tileUrl: EOX_SATELLITE_TILE_URL,
        tileSize: 256,
        sourceMinZoom: 0,
        sourceMaxZoom: 14,
        layerMinZoom: 0,
        layerMaxZoom: 20,
        attribution: "Sentinel-2 cloudless — <a href=\"https://s2maps.eu/\">s2maps.eu</a> by EOX IT Services GmbH, contains modified Copernicus Sentinel data 2024",
      },
    ]);
  });

  it("uses EOX for overview and TomTom for detail when VITE_IRONWING_TOMTOM_API_KEY is set", () => {
    expect(getDefaultSatelliteRasterSources({ VITE_IRONWING_TOMTOM_API_KEY: " test key " })).toEqual([
      expect.objectContaining({
        provider: "eox",
        tileUrl: EOX_SATELLITE_TILE_URL,
        sourceMaxZoom: 14,
        layerMinZoom: 0,
        layerMaxZoom: 12.2,
      }),
      expect.objectContaining({
        provider: "tomtom",
        tileUrl: "https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key=test%20key",
        sourceMaxZoom: 19,
        layerMinZoom: 11.8,
        layerMaxZoom: 20,
      }),
    ]);
  });
});

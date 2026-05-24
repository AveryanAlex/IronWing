import { afterEach, describe, expect, it, vi } from "vitest";

import { applyMapLayerMode, ensureBuildingExtrusionLayer, ensureSatelliteLayer } from "./layers";

afterEach(() => {
  vi.unstubAllEnvs();
});

function createMapMock(styleLayers: Array<{ id: string; type: string }> = []) {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, { id: string } & Record<string, unknown>>();
  const map = {
    addLayer: vi.fn((layer: { id: string } & Record<string, unknown>) => layers.set(layer.id, layer)),
    addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
    getLayer: vi.fn((id: string) => layers.get(id) ?? null),
    getSource: vi.fn((id: string) => sources.get(id) ?? null),
    getStyle: vi.fn(() => ({ layers: styleLayers })),
    setLayoutProperty: vi.fn(),
  };

  return { layers, map, sources };
}

describe("map satellite layers", () => {
  it("uses only the EOX 2024 overview layer without a TomTom key", () => {
    vi.stubEnv("VITE_IRONWING_TOMTOM_API_KEY", "");
    const { layers, map, sources } = createMapMock();

    ensureSatelliteLayer(map as never, { namespace: "test", satelliteBeforeLayerId: null });

    expect(sources.get("test-satellite-source")).toMatchObject({
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      minzoom: 0,
      maxzoom: 14,
    });
    expect(sources.has("test-satellite-detail-source")).toBe(false);
    expect(layers.get("test-satellite")).toMatchObject({ minzoom: 0, maxzoom: 20 });
  });

  it("layers EOX low zoom under TomTom detail imagery when a key is configured", () => {
    vi.stubEnv("VITE_IRONWING_TOMTOM_API_KEY", "test key");
    const { layers, map, sources } = createMapMock();

    ensureSatelliteLayer(map as never, {
      namespace: "test",
      satelliteBeforeLayerId: null,
      satelliteVisible: true,
    });

    expect(sources.get("test-satellite-source")).toMatchObject({
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      minzoom: 0,
      maxzoom: 14,
    });
    expect(sources.get("test-satellite-detail-source")).toMatchObject({
      tiles: ["https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key=test%20key"],
      minzoom: 0,
      maxzoom: 19,
    });
    expect(layers.get("test-satellite")).toMatchObject({
      source: "test-satellite-source",
      minzoom: 0,
      maxzoom: 12.2,
      layout: { visibility: "visible" },
    });
    expect(layers.get("test-satellite-detail")).toMatchObject({
      source: "test-satellite-detail-source",
      minzoom: 11.8,
      maxzoom: 20,
      layout: { visibility: "visible" },
    });

    applyMapLayerMode(map as never, "normal", {
      namespace: "test",
      baseLayerIds: ["roads"],
      includeHillshade: false,
    });

    expect(map.setLayoutProperty).toHaveBeenCalledWith("test-satellite", "visibility", "none");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("test-satellite-detail", "visibility", "none");
  });
});

describe("map building extrusion layer", () => {
  it("adds OpenMapTiles building extrusions below labels", () => {
    const { layers, map, sources } = createMapMock([
      { id: "background", type: "background" },
      { id: "roads", type: "line" },
      { id: "labels", type: "symbol" },
    ]);

    ensureBuildingExtrusionLayer(map as never);

    expect(sources.get("openmaptiles")).toMatchObject({
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    });
    expect(layers.get("map-building-extrusions")).toMatchObject({
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
    });
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "map-building-extrusions" }),
      "labels",
    );
  });
});

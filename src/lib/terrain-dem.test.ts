import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TILE_SIZE,
  createTileCache,
  fetchTerrainTileResult,
  latLonToTile,
  sampleElevationsWithSummary,
  type TerrainFetchFn,
  type TileCache,
} from "./terrain-dem";

type RasterImageData = Pick<ImageData, "data" | "height" | "width">;

afterEach(() => {
  vi.unstubAllGlobals();
});

function rasterImageData(width = TILE_SIZE, height = TILE_SIZE): RasterImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

function encodeTerrariumSample(data: Uint8ClampedArray, pixelIndex: number, elevationM: number): void {
  const encoded = elevationM + 32768;
  const channelIndex = pixelIndex * 4;
  data[channelIndex] = Math.floor(encoded / 256);
  data[channelIndex + 1] = Math.floor(encoded % 256);
  data[channelIndex + 2] = Math.round((encoded - Math.floor(encoded)) * 256);
  data[channelIndex + 3] = 255;
}

function installRasterDecoder(imageData: RasterImageData): void {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({
      width: imageData.width,
      height: imageData.height,
      close: vi.fn(),
    })),
  );

  vi.stubGlobal(
    "OffscreenCanvas",
    class OffscreenCanvasMock {
      readonly width: number;
      readonly height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(_contextId: string, _options?: unknown) {
        return {
          drawImage: vi.fn(),
          getImageData: vi.fn(() => imageData),
        };
      }
    },
  );
}

describe("terrain DEM sampler", () => {
  it("requests Mapterhorn WebP tiles and treats missing tiles as no-data", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 404 })
    );

    const result = await fetchTerrainTileResult(14, 8_581, 5_724, fetchMock as TerrainFetchFn);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://tiles.mapterhorn.com/14/8581/5724.webp");
    expect(result).toEqual({ outcome: "no_data", tile: null });
  });

  it("keeps non-missing HTTP failures classified as errors", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 500 })
    );

    await expect(fetchTerrainTileResult(14, 8_581, 5_724, fetchMock as TerrainFetchFn)).resolves.toEqual({
      outcome: "error",
      tile: null,
    });
  });

  it("samples 512px Terrarium tiles at the calculated pixel index", async () => {
    const point = { latitude_deg: 0, longitude_deg: 90 };
    const sample = latLonToTile(point.latitude_deg, point.longitude_deg, 1);
    const imageData = rasterImageData();
    encodeTerrariumSample(imageData.data, sample.pixelY * TILE_SIZE + sample.pixelX, 123);
    installRasterDecoder(imageData);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(new Blob(["tile"], { type: "image/webp" }), { status: 200 })
    );

    const cache = createTileCache(fetchMock as TerrainFetchFn);

    await expect(cache.getElevation(point.latitude_deg, point.longitude_deg, 1)).resolves.toBe(123);
    expect(sample).toMatchObject({ tileX: 1, tileY: 1, pixelX: 256, pixelY: 0 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://tiles.mapterhorn.com/1/1/1.webp");
  });

  it("falls back to coarser zoom levels when high-resolution tiles have no data", async () => {
    const point = { latitude_deg: 0, longitude_deg: 90 };
    const fallbackSample = latLonToTile(point.latitude_deg, point.longitude_deg, 12);
    const fallbackTile = new Float32Array(TILE_SIZE * TILE_SIZE).fill(Number.NaN);
    fallbackTile[fallbackSample.pixelY * TILE_SIZE + fallbackSample.pixelX] = 456;
    const getTileResult = vi.fn(async (zoom: number) => {
      if (zoom === 12) {
        return { outcome: "ok", tile: fallbackTile } as const;
      }

      return { outcome: "no_data", tile: null } as const;
    });
    const cache: TileCache = {
      getElevation: vi.fn(),
      getTileData: vi.fn(),
      getTileResult,
      stats: { hits: 0, misses: 0 },
    };

    const result = await sampleElevationsWithSummary([point], cache, 14, 12);

    expect(result).toEqual({
      elevations: [456],
      summary: { okTiles: 1, errorTiles: 0, noDataTiles: 2 },
    });
    expect(getTileResult.mock.calls.map(([zoom]) => zoom)).toEqual([14, 13, 12]);
  });
});

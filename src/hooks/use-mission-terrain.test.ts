// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedDraftItem } from "../lib/mission-draft-typed";
import type { HomePosition, MissionItem } from "../lib/mavkit-types";
import { latLonToTile, DEFAULT_TERRAIN_ZOOM } from "../lib/terrain-dem";

const httpFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: httpFetchMock,
}));

type MockBitmap = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  close: ReturnType<typeof vi.fn>;
};

class MockOffscreenCanvas {
  width: number;
  height: number;
  private bitmap: MockBitmap | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: (bitmap: MockBitmap) => {
        this.bitmap = bitmap;
      },
      getImageData: () => ({
        data: this.bitmap?.pixels ?? new Uint8ClampedArray(this.width * this.height * 4),
        width: this.width,
        height: this.height,
      }),
    };
  }
}

function makeHome(overrides: Partial<HomePosition> = {}): HomePosition {
  return {
    latitude_deg: 47,
    longitude_deg: 8,
    altitude_m: 100,
    ...overrides,
  };
}

function missionItemAt(index: number, latitude_deg: number, longitude_deg: number, relative_alt_m = 20): TypedDraftItem {
  const document: MissionItem = {
    command: {
      Nav: {
        Waypoint: {
          position: { RelHome: { latitude_deg, longitude_deg, relative_alt_m } },
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: index === 0,
    autocontinue: true,
  };

  return {
    uiId: index + 1,
    index,
    document,
    readOnly: false,
    preview: {
      latitude_deg,
      longitude_deg,
      altitude_m: relative_alt_m,
    },
  };
}

function missionItemWithoutPosition(index: number): TypedDraftItem {
  return {
    uiId: index + 1,
    index,
    document: {
      command: {
        Other: {
          command: 999,
          frame: "Mission",
          param1: 0,
          param2: 0,
          param3: 0,
          param4: 0,
          x: 0,
          y: 0,
          z: 0,
        },
      },
      current: false,
      autocontinue: true,
    },
    readOnly: false,
    preview: {
      latitude_deg: null,
      longitude_deg: null,
      altitude_m: null,
    },
  };
}

function encodeTerrarium(elevation_m: number): [number, number, number, number] {
  const encoded = elevation_m + 32768;
  const r = Math.floor(encoded / 256);
  const g = Math.floor(encoded % 256);
  const b = Math.round((encoded - Math.floor(encoded)) * 256);
  return [r, g, b, 255];
}

function tilePixels(defaultElevation_m: number, overrides: Array<{ x: number; y: number; elevation_m: number }> = []): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  const fill = encodeTerrarium(defaultElevation_m);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = fill[0];
    pixels[index + 1] = fill[1];
    pixels[index + 2] = fill[2];
    pixels[index + 3] = fill[3];
  }

  for (const override of overrides) {
    const pixelIndex = (override.y * 256 + override.x) * 4;
    const encoded = encodeTerrarium(override.elevation_m);
    pixels[pixelIndex] = encoded[0];
    pixels[pixelIndex + 1] = encoded[1];
    pixels[pixelIndex + 2] = encoded[2];
    pixels[pixelIndex + 3] = encoded[3];
  }

  return pixels;
}

function mockTileResponse(pixels: Uint8ClampedArray) {
  return {
    ok: true,
    blob: async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
      Object.assign(blob, { __pixels: pixels });
      return blob;
    },
  } as Response;
}

function successUrlFor(lat: number, lon: number): string {
  const { tileX, tileY } = latLonToTile(lat, lon, DEFAULT_TERRAIN_ZOOM);
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEFAULT_TERRAIN_ZOOM}/${tileX}/${tileY}.png`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useMissionTerrain", () => {
  beforeEach(() => {
    httpFetchMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("global fetch should not be used");
      }),
    );
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas as unknown as typeof OffscreenCanvas);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (blob: Blob) => ({
        width: 256,
        height: 256,
        pixels: (blob as Blob & { __pixels?: Uint8ClampedArray }).__pixels ?? tilePixels(0),
        close: vi.fn(),
      } satisfies MockBitmap)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns idle status when the selected tab is not mission", async () => {
    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result } = renderHook(() =>
      useMissionTerrain([missionItemAt(0, 47.0005, 8.0005)], makeHome(), "fence"),
    );

    expect(result.current).toEqual({
      status: "idle",
      profile: null,
      warningsByIndex: null,
    });
    expect(httpFetchMock).not.toHaveBeenCalled();
  });

  it("returns loading then ready with profile data and reuses one DEM tile for a shared-tile path", async () => {
    httpFetchMock.mockImplementation(async (url: string) => {
      expect(url).toContain(`/terrarium/${DEFAULT_TERRAIN_ZOOM}/`);
      return mockTileResponse(tilePixels(100));
    });

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result } = renderHook(() =>
      useMissionTerrain([missionItemAt(0, 47.0005, 8.0005, 20)], makeHome(), "mission"),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("loading");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.warningsByIndex?.get(0)).toBe("none");

    const waypoint = result.current.profile?.points.find((point) => point.isWaypoint && point.index === 0);
    expect(waypoint).toMatchObject({
      terrainMsl: 100,
      flightMsl: 120,
      warning: "none",
    });
  });

  it("keeps only the newest async result when mission inputs change rapidly", async () => {
    const firstHome = makeHome({ latitude_deg: 10, longitude_deg: 10 });
    const secondHome = makeHome({ latitude_deg: 47, longitude_deg: 8 });
    const firstUrl = successUrlFor(firstHome.latitude_deg, firstHome.longitude_deg);
    const secondUrl = successUrlFor(secondHome.latitude_deg, secondHome.longitude_deg);
    const firstResponse = deferred<Response>();

    httpFetchMock.mockImplementation((url: string) => {
      if (url === firstUrl) return firstResponse.promise;
      if (url === secondUrl) return Promise.resolve(mockTileResponse(tilePixels(130)));
      return Promise.resolve(mockTileResponse(tilePixels(130)));
    });

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result, rerender } = renderHook(
      (props: { items: TypedDraftItem[]; home: HomePosition | null; tab: string }) =>
        useMissionTerrain(props.items, props.home, props.tab),
      {
        initialProps: {
          items: [missionItemAt(0, 10.0005, 10.0005, 20)],
          home: firstHome,
          tab: "mission",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.status).toBe("loading");
    });

    rerender({
      items: [missionItemAt(0, 47.0005, 8.0005, 20)],
      home: secondHome,
      tab: "mission",
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    const currentWaypoint = result.current.profile?.points.find((point) => point.isWaypoint && point.index === 0);
    expect(currentWaypoint).toMatchObject({ terrainMsl: 130, flightMsl: 120, warning: "below_terrain" });

    firstResponse.resolve(mockTileResponse(tilePixels(80)));
    await Promise.resolve();
    await Promise.resolve();

    const staleWaypoint = result.current.profile?.points.find((point) => point.isWaypoint && point.index === 0);
    expect(staleWaypoint).toMatchObject({ terrainMsl: 130, flightMsl: 120, warning: "below_terrain" });
  });

  it("returns error status when all DEM tile fetches fail", async () => {
    httpFetchMock.mockRejectedValue(new Error("terrain offline"));

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result } = renderHook(() =>
      useMissionTerrain([missionItemAt(0, 47.0005, 8.0005)], makeHome(), "mission"),
    );

    await waitFor(() => {
      expect(result.current).toEqual({
        status: "error",
        profile: null,
        warningsByIndex: null,
      });
    });
  });

  it("returns ready status with no_data warnings when only some terrain tiles fail", async () => {
    const near = { latitude_deg: 47.0005, longitude_deg: 8.0005 };
    const far = { latitude_deg: 47.0005, longitude_deg: 8.03 };
    const failingUrl = successUrlFor(far.latitude_deg, far.longitude_deg);

    httpFetchMock.mockImplementation(async (url: string) => {
      if (url === failingUrl) {
        return { ok: false, blob: async () => new Blob() } as Response;
      }
      return mockTileResponse(tilePixels(100));
    });

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result } = renderHook(() =>
      useMissionTerrain(
        [
          missionItemAt(0, near.latitude_deg, near.longitude_deg, 20),
          missionItemAt(1, far.latitude_deg, far.longitude_deg, 20),
        ],
        makeHome(),
        "mission",
      ),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.warningsByIndex?.get(0)).toBe("none");
    expect(result.current.warningsByIndex?.get(1)).toBe("no_data");
  });

  it("returns idle with an empty profile for empty or non-positional mission paths", async () => {
    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result, rerender } = renderHook(
      (props: { items: TypedDraftItem[]; home: HomePosition | null }) =>
        useMissionTerrain(props.items, props.home, "mission"),
      {
        initialProps: {
          items: [] as TypedDraftItem[],
          home: null,
        },
      },
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.profile).toEqual({ points: [], warningsByIndex: new Map() });

    rerender({
      items: [missionItemWithoutPosition(0)],
      home: null,
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.profile).toEqual({ points: [], warningsByIndex: new Map() });
    expect(httpFetchMock).not.toHaveBeenCalled();
  });

  it("handles home-only and 100+ waypoint missions without hanging", async () => {
    httpFetchMock.mockResolvedValue(mockTileResponse(tilePixels(100)));

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const homeOnly = renderHook(() => useMissionTerrain([], makeHome(), "mission"));

    await waitFor(() => {
      expect(homeOnly.result.current.status).toBe("ready");
    });
    expect(homeOnly.result.current.profile?.points).toHaveLength(1);

    const manyItems = Array.from({ length: 120 }, (_, index) =>
      missionItemAt(index, 47 + index * 0.0002, 8 + index * 0.0002, 25),
    );
    const longMission = renderHook(() => useMissionTerrain(manyItems, makeHome(), "mission"));

    await waitFor(() => {
      expect(longMission.result.current.status).toBe("ready");
    });
    expect(longMission.result.current.profile?.points.length ?? 0).toBeGreaterThan(manyItems.length);
    expect(httpFetchMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("treats out-of-range decoded terrain samples as no_data instead of trusting malformed DEM pixels", async () => {
    const waypoint = { latitude_deg: 47.0005, longitude_deg: 8.0005 };
    const { pixelX, pixelY } = latLonToTile(waypoint.latitude_deg, waypoint.longitude_deg, DEFAULT_TERRAIN_ZOOM);

    httpFetchMock.mockResolvedValue(
      mockTileResponse(tilePixels(100, [{ x: pixelX, y: pixelY, elevation_m: 9_500 }])),
    );

    const { useMissionTerrain } = await import("./use-mission-terrain");
    const { result } = renderHook(() =>
      useMissionTerrain([missionItemAt(0, waypoint.latitude_deg, waypoint.longitude_deg, 20)], makeHome(), "mission"),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.warningsByIndex?.get(0)).toBe("no_data");
  });
});

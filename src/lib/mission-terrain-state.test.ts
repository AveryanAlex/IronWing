import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

import { createMissionTerrainState, type MissionTerrainSampleResult } from "./mission-terrain-state";
import type { PathPoint } from "./mission-path";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function point(
  latitude_deg: number,
  longitude_deg: number,
  altitude_m: number | null,
  frame: PathPoint["frame"],
  index: number | null,
  isHome = false,
): PathPoint {
  return {
    latitude_deg,
    longitude_deg,
    altitude_m,
    frame,
    index,
    isHome,
  };
}

function buildRequest(pathPoints: PathPoint[], safetyMarginM = 10) {
  return {
    enabled: true,
    pathPoints,
    homeAltMsl: pathPoints.find((entry) => entry.isHome)?.altitude_m ?? null,
    safetyMarginM,
  };
}

function sampleAll(
  value: number | null,
  summary: MissionTerrainSampleResult["summary"],
): (points: Array<{ latitude_deg: number; longitude_deg: number }>) => Promise<MissionTerrainSampleResult> {
  return async (points) => ({
    elevations: points.map(() => value),
    summary,
  });
}

describe("createMissionTerrainState", () => {
  it("stays idle with an empty profile when the mission path is empty", async () => {
    const controller = createMissionTerrainState({
      sampler: vi.fn(),
    });

    await controller.load(buildRequest([]));

    expect(get(controller)).toMatchObject({
      status: "idle",
      sampledPathPointCount: 0,
      requestedPathPointCount: 0,
      canRetry: false,
    });
    expect(get(controller).profile?.points).toEqual([]);
  });

  it("ignores stale async terrain responses once a newer request has started", async () => {
    const first = deferred<MissionTerrainSampleResult>();
    const second = deferred<MissionTerrainSampleResult>();
    const sampler = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createMissionTerrainState({ sampler });

    const lowerRequest = buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.4001, 8.5501, 95, "msl", 0),
    ]);
    const higherRequest = buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.4001, 8.5501, 160, "msl", 0),
    ]);

    const firstLoad = controller.load(lowerRequest);
    const secondLoad = controller.load(higherRequest);

    second.resolve({
      elevations: [100, 100, 100],
      summary: { okTiles: 1, errorTiles: 0, noDataTiles: 0 },
    });
    await secondLoad;

    expect(get(controller).status).toBe("ready");
    expect(get(controller).warningsByIndex.get(0)).toBe("none");

    first.resolve({
      elevations: [130, 130, 130],
      summary: { okTiles: 1, errorTiles: 0, noDataTiles: 0 },
    });
    await firstLoad;

    expect(get(controller).status).toBe("ready");
    expect(get(controller).warningsByIndex.get(0)).toBe("none");
    expect(get(controller).profile?.points.find((entry) => entry.index === 0)?.flightMsl).toBe(160);
  });

  it("preserves the last valid profile when every terrain fetch fails", async () => {
    const sampler = vi.fn()
      .mockImplementationOnce(sampleAll(100, { okTiles: 1, errorTiles: 0, noDataTiles: 0 }))
      .mockImplementationOnce(sampleAll(null, { okTiles: 0, errorTiles: 2, noDataTiles: 0 }));
    const controller = createMissionTerrainState({ sampler });

    await controller.load(buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.401, 8.551, 160, "msl", 0),
    ]));
    const validProfile = get(controller).profile;

    await controller.load(buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.401, 8.551, 165, "msl", 0),
    ]));

    expect(get(controller)).toMatchObject({
      status: "error",
      isStale: true,
      canRetry: true,
    });
    expect(get(controller).profile).toEqual(validProfile);
    expect(get(controller).lastError).toBe("Terrain tiles could not be loaded for this mission path.");
    expect(get(controller).detail).toContain("last valid profile stays visible");
  });

  it("surfaces an explicit no-data state when terrain tiles resolve without usable elevation", async () => {
    const controller = createMissionTerrainState({
      sampler: sampleAll(null, { okTiles: 0, errorTiles: 0, noDataTiles: 1 }),
    });

    await controller.load(buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.401, 8.551, 130, "msl", 0),
    ]));

    expect(get(controller)).toMatchObject({
      status: "no_data",
      canRetry: true,
      isStale: false,
    });
    expect(get(controller).warningsByIndex.get(0)).toBe("no_data");
    expect(get(controller).warningSummary.noData).toBe(1);
  });

  it("classifies partial DEM misses as no-data warnings without discarding valid terrain samples", async () => {
    const controller = createMissionTerrainState({
      sampler: async (points) => ({
        elevations: points.map((_point, index) => (index === points.length - 1 ? null : 100)),
        summary: { okTiles: 1, errorTiles: 0, noDataTiles: 1 },
      }),
    });

    await controller.load(buildRequest([
      point(47.4, 8.55, 100, "msl", null, true),
      point(47.401, 8.551, 140, "msl", 0),
      point(47.402, 8.552, 145, "msl", 1),
    ]));

    expect(get(controller)).toMatchObject({
      status: "ready",
      canRetry: true,
      isStale: false,
    });
    expect(get(controller).warningsByIndex.get(0)).toBe("none");
    expect(get(controller).warningsByIndex.get(1)).toBe("no_data");
    expect(get(controller).warningSummary.noData).toBe(1);
  });
});

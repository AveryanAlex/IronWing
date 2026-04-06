import { fetch as platformFetch } from "@platform/http";
import { get, writable } from "svelte/store";

import type { PathPoint } from "./mission-path";
import {
  DEFAULT_PROFILE_MAX_SPACING_M,
  computeTerrainProfile,
  densifyPath,
  type ProfileResult,
  type TerrainWarning,
} from "./mission-terrain-profile";
import {
  createTileCache,
  sampleElevationsWithSummary,
  type TerrainFetchFn,
  type TerrainPoint,
  type TerrainSampleSummary,
  type TileCache,
} from "./terrain-dem";

export type MissionTerrainStatus = "idle" | "loading" | "ready" | "error" | "no_data";

export type MissionTerrainWarningSummary = {
  total: number;
  belowTerrain: number;
  nearTerrain: number;
  noData: number;
  actionable: number;
};

export type MissionTerrainState = {
  status: MissionTerrainStatus;
  profile: ProfileResult | null;
  warningsByIndex: Map<number, TerrainWarning>;
  warningSummary: MissionTerrainWarningSummary;
  detail: string;
  lastError: string | null;
  isStale: boolean;
  canRetry: boolean;
  requestedPathPointCount: number;
  sampledPathPointCount: number;
  tileSummary: TerrainSampleSummary;
};

export type MissionTerrainRequest = {
  enabled: boolean;
  pathPoints: PathPoint[];
  homeAltMsl: number | null;
  safetyMarginM: number;
};

export type MissionTerrainSampleResult = {
  elevations: Array<number | null>;
  summary: TerrainSampleSummary;
};

export type MissionTerrainSampler = (points: TerrainPoint[]) => Promise<MissionTerrainSampleResult>;

export type MissionTerrainStateOptions = {
  cache?: TileCache;
  cacheSize?: number;
  fetchFn?: TerrainFetchFn;
  sampler?: MissionTerrainSampler;
};

const EMPTY_TILE_SUMMARY: TerrainSampleSummary = {
  okTiles: 0,
  errorTiles: 0,
  noDataTiles: 0,
};

const EMPTY_WARNING_SUMMARY: MissionTerrainWarningSummary = {
  total: 0,
  belowTerrain: 0,
  nearTerrain: 0,
  noData: 0,
  actionable: 0,
};

const EMPTY_PROFILE = (): ProfileResult => ({
  points: [],
  warningsByIndex: new Map<number, TerrainWarning>(),
});

function createInitialState(): MissionTerrainState {
  return {
    status: "idle",
    profile: null,
    warningsByIndex: new Map<number, TerrainWarning>(),
    warningSummary: EMPTY_WARNING_SUMMARY,
    detail: "Terrain profile is idle. Add positional mission items to sample the route.",
    lastError: null,
    isStale: false,
    canRetry: false,
    requestedPathPointCount: 0,
    sampledPathPointCount: 0,
    tileSummary: EMPTY_TILE_SUMMARY,
  };
}

export function createMissionTerrainState(options: MissionTerrainStateOptions = {}) {
  const store = writable<MissionTerrainState>(createInitialState());
  const fetchFn = options.fetchFn ?? platformFetch;
  const cache = options.cache ?? createTileCache(fetchFn, options.cacheSize);
  const sampler = options.sampler ?? ((points: TerrainPoint[]) => sampleElevationsWithSummary(points, cache));

  let requestId = 0;
  let lastRequestKey: string | null = null;
  let lastRequest: MissionTerrainRequest | null = null;
  let lastValidProfile: ProfileResult | null = null;

  async function load(request: MissionTerrainRequest, force = false) {
    const nextRequest = cloneRequest(request);
    const requestKey = buildRequestKey(nextRequest);
    lastRequest = nextRequest;

    if (!force && requestKey === lastRequestKey) {
      return;
    }

    lastRequestKey = requestKey;
    requestId += 1;
    const currentRequestId = requestId;

    if (!nextRequest.enabled) {
      store.set(createInitialState());
      return;
    }

    if (nextRequest.pathPoints.length === 0) {
      const emptyProfile = EMPTY_PROFILE();
      store.set({
        ...createInitialState(),
        profile: emptyProfile,
        warningsByIndex: emptyProfile.warningsByIndex,
        detail: "Terrain profile is idle. Add Home and at least one positional mission item to sample the route.",
        canRetry: false,
      });
      return;
    }

    const previousState = get(store);
    store.set({
      ...previousState,
      status: "loading",
      detail: previousState.profile
        ? "Refreshing terrain samples. The last valid profile stays visible until the new request resolves."
        : "Sampling terrain tiles for the active mission path.",
      lastError: null,
      isStale: previousState.profile !== null,
      canRetry: false,
      requestedPathPointCount: nextRequest.pathPoints.length,
      sampledPathPointCount: previousState.sampledPathPointCount,
      tileSummary: previousState.tileSummary,
    });

    try {
      const densified = densifyPath(nextRequest.pathPoints, DEFAULT_PROFILE_MAX_SPACING_M);
      const sampled = await sampler(densified);
      if (currentRequestId !== requestId) {
        return;
      }

      const terrainByPoint = new Map<string, number | null>();
      densified.forEach((point, index) => {
        terrainByPoint.set(pointKey(point.latitude_deg, point.longitude_deg), sampled.elevations[index] ?? null);
      });

      const profile = computeTerrainProfile(
        nextRequest.pathPoints,
        (lat, lon) => terrainByPoint.get(pointKey(lat, lon)) ?? null,
        nextRequest.homeAltMsl,
        { safetyMarginM: nextRequest.safetyMarginM },
      );
      const warningSummary = summarizeWarnings(profile);
      const hasUsableTerrain = sampled.elevations.some((value) => value !== null);
      const status = resolveStatus(sampled.summary, hasUsableTerrain);
      if (hasUsableTerrain) {
        lastValidProfile = profile;
      }

      if (status === "error") {
        const fallbackProfile = lastValidProfile ?? previousState.profile ?? null;
        const fallbackWarningSummary = fallbackProfile ? summarizeWarnings(fallbackProfile) : EMPTY_WARNING_SUMMARY;

        store.set({
          status,
          profile: fallbackProfile,
          warningsByIndex: fallbackProfile?.warningsByIndex ?? new Map<number, TerrainWarning>(),
          warningSummary: fallbackWarningSummary,
          detail: resolveDetail(status, {
            sampledPointCount: densified.length,
            warningSummary: fallbackWarningSummary,
            hasStaleProfile: fallbackProfile !== null,
          }),
          lastError: "Terrain tiles could not be loaded for this mission path.",
          isStale: fallbackProfile !== null,
          canRetry: true,
          requestedPathPointCount: nextRequest.pathPoints.length,
          sampledPathPointCount: densified.length,
          tileSummary: sampled.summary,
        });
        return;
      }

      store.set({
        status,
        profile,
        warningsByIndex: profile.warningsByIndex,
        warningSummary,
        detail: resolveDetail(status, {
          sampledPointCount: densified.length,
          warningSummary,
          hasStaleProfile: false,
        }),
        lastError: null,
        isStale: false,
        canRetry: true,
        requestedPathPointCount: nextRequest.pathPoints.length,
        sampledPathPointCount: densified.length,
        tileSummary: sampled.summary,
      });
    } catch (error) {
      if (currentRequestId !== requestId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const fallbackProfile = lastValidProfile ?? previousState.profile ?? null;
      const warningSummary = fallbackProfile ? summarizeWarnings(fallbackProfile) : EMPTY_WARNING_SUMMARY;
      const warningsByIndex = fallbackProfile?.warningsByIndex ?? new Map<number, TerrainWarning>();

      store.set({
        status: "error",
        profile: fallbackProfile,
        warningsByIndex,
        warningSummary,
        detail: resolveDetail("error", {
          sampledPointCount: previousState.sampledPathPointCount,
          warningSummary,
          hasStaleProfile: fallbackProfile !== null,
        }),
        lastError: message,
        isStale: fallbackProfile !== null,
        canRetry: true,
        requestedPathPointCount: nextRequest.pathPoints.length,
        sampledPathPointCount: previousState.sampledPathPointCount,
        tileSummary: previousState.tileSummary,
      });
    }
  }

  async function retry() {
    if (!lastRequest) {
      return;
    }

    lastRequestKey = null;
    await load(lastRequest, true);
  }

  function reset() {
    requestId += 1;
    lastRequestKey = null;
    lastRequest = null;
    lastValidProfile = null;
    store.set(createInitialState());
  }

  return {
    subscribe: store.subscribe,
    load,
    retry,
    reset,
  };
}

function cloneRequest(request: MissionTerrainRequest): MissionTerrainRequest {
  return {
    enabled: request.enabled,
    homeAltMsl: request.homeAltMsl,
    safetyMarginM: request.safetyMarginM,
    pathPoints: request.pathPoints.map((point) => ({ ...point })),
  };
}

function buildRequestKey(request: MissionTerrainRequest): string {
  return [
    request.enabled ? "enabled" : "disabled",
    request.homeAltMsl === null ? "home:null" : `home:${request.homeAltMsl.toFixed(3)}`,
    `margin:${request.safetyMarginM.toFixed(3)}`,
    serializePathPoints(request.pathPoints),
  ].join("|");
}

function serializePathPoints(points: PathPoint[]): string {
  return points.map((point) => [
    point.latitude_deg.toFixed(9),
    point.longitude_deg.toFixed(9),
    point.altitude_m === null ? "null" : point.altitude_m.toFixed(3),
    point.frame ?? "null",
    point.index ?? "null",
    point.isHome ? "home" : "mission",
    point.isLoiter ? "loiter" : "normal",
    point.loiterRadius_m ?? "null",
    point.isSpline ? "spline" : "no-spline",
    point.isArc ? "arc" : "no-arc",
    point.arcAngleDeg ?? "null",
    point.arcDirection ?? "null",
  ].join(":"))
    .join(";");
}

function pointKey(latitude_deg: number, longitude_deg: number): string {
  return `${latitude_deg.toFixed(9)},${longitude_deg.toFixed(9)}`;
}

function summarizeWarnings(profile: ProfileResult): MissionTerrainWarningSummary {
  const summary = {
    ...EMPTY_WARNING_SUMMARY,
  };

  for (const warning of profile.warningsByIndex.values()) {
    if (warning === "below_terrain") {
      summary.belowTerrain += 1;
      summary.actionable += 1;
      continue;
    }

    if (warning === "near_terrain") {
      summary.nearTerrain += 1;
      summary.actionable += 1;
      continue;
    }

    if (warning === "no_data") {
      summary.noData += 1;
      summary.actionable += 1;
    }
  }

  summary.total = summary.actionable;
  return summary;
}

function resolveStatus(
  summary: TerrainSampleSummary,
  hasUsableTerrain: boolean,
): MissionTerrainStatus {
  if (hasUsableTerrain) {
    return "ready";
  }

  if (summary.errorTiles > 0 && summary.okTiles === 0 && summary.noDataTiles === 0) {
    return "error";
  }

  return "no_data";
}

function resolveDetail(
  status: MissionTerrainStatus,
  context: {
    sampledPointCount: number;
    warningSummary: MissionTerrainWarningSummary;
    hasStaleProfile: boolean;
  },
): string {
  const sampledLabel = context.sampledPointCount === 1 ? "point" : "points";

  if (status === "loading") {
    return context.hasStaleProfile
      ? "Refreshing terrain samples while keeping the last valid profile visible."
      : "Sampling terrain tiles for the active mission path.";
  }

  if (status === "error") {
    return context.hasStaleProfile
      ? "Terrain tiles could not be refreshed. The last valid profile stays visible until you retry."
      : "Terrain tiles could not be loaded for this mission path. Retry when the DEM source is reachable.";
  }

  if (status === "no_data") {
    return "Terrain tiles returned no usable elevation for this path. Clearance stays fail-closed until usable terrain data is available.";
  }

  if (status === "idle") {
    return "Terrain profile is idle. Add positional mission items to sample the route.";
  }

  if (context.warningSummary.actionable === 0) {
    return `Sampled terrain across ${context.sampledPointCount} ${sampledLabel}. No clearance warnings are active.`;
  }

  const parts: string[] = [];
  if (context.warningSummary.belowTerrain > 0) {
    parts.push(`${context.warningSummary.belowTerrain} below terrain`);
  }
  if (context.warningSummary.nearTerrain > 0) {
    parts.push(`${context.warningSummary.nearTerrain} near terrain`);
  }
  if (context.warningSummary.noData > 0) {
    parts.push(`${context.warningSummary.noData} without terrain data`);
  }

  return `Sampled terrain across ${context.sampledPointCount} ${sampledLabel}. ${parts.join(", ")}.`;
}

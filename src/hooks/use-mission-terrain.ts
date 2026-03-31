import { useEffect, useRef, useState } from "react";
import { fetch as platformFetch } from "@platform/http";

import type { TypedDraftItem } from "../lib/mission-draft-typed";
import type { HomePosition } from "../lib/mavkit-types";
import { missionPathPoints } from "../lib/mission-path";
import {
  computeTerrainProfile,
  DEFAULT_PROFILE_MAX_SPACING_M,
  densifyPath,
  type ProfileResult,
  type TerrainWarning,
} from "../lib/mission-terrain-profile";
import { createTileCache, sampleElevations, type TileCache } from "../lib/terrain-dem";

export type MissionTerrainStatus = "idle" | "loading" | "ready" | "error";

export type UseMissionTerrainResult = {
  status: MissionTerrainStatus;
  profile: ProfileResult | null;
  warningsByIndex: Map<number, TerrainWarning> | null;
};

const EMPTY_PROFILE = (): ProfileResult => ({
  points: [],
  warningsByIndex: new Map<number, TerrainWarning>(),
});

export function useMissionTerrain(
  items: TypedDraftItem[],
  homePosition: HomePosition | null,
  tab: string,
): UseMissionTerrainResult {
  const cacheRef = useRef<TileCache | null>(null);
  const requestIdRef = useRef(0);
  const [result, setResult] = useState<UseMissionTerrainResult>({
    status: "idle",
    profile: null,
    warningsByIndex: null,
  });

  if (cacheRef.current === null) {
    cacheRef.current = createTileCache(platformFetch);
  }

  const pathPoints = missionPathPoints(homePosition, items);
  const pathSignature = serializePathPoints(pathPoints);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (tab !== "mission") {
      setResult({ status: "idle", profile: null, warningsByIndex: null });
      return;
    }

    if (pathPoints.length === 0) {
      const empty = EMPTY_PROFILE();
      setResult({ status: "idle", profile: empty, warningsByIndex: empty.warningsByIndex });
      return;
    }

    let disposed = false;
    setResult({ status: "loading", profile: null, warningsByIndex: null });

    void (async () => {
      try {
        const densified = densifyPath(pathPoints, DEFAULT_PROFILE_MAX_SPACING_M);
        const sampledTerrain = await sampleElevations(densified, cacheRef.current!);
        if (disposed || requestId !== requestIdRef.current) return;

        if (sampledTerrain.length === 0 || sampledTerrain.every((value) => value === null)) {
          setResult({ status: "error", profile: null, warningsByIndex: null });
          return;
        }

        const terrainByPoint = new Map<string, number | null>();
        densified.forEach((point, index) => {
          terrainByPoint.set(pointKey(point.latitude_deg, point.longitude_deg), sampledTerrain[index] ?? null);
        });

        const profile = computeTerrainProfile(
          pathPoints,
          (lat, lon) => terrainByPoint.get(pointKey(lat, lon)) ?? null,
          homePosition?.altitude_m ?? null,
        );

        if (disposed || requestId !== requestIdRef.current) return;

        setResult({
          status: "ready",
          warningsByIndex: profile.warningsByIndex,
          profile,
        });
      } catch {
        if (disposed || requestId !== requestIdRef.current) return;
        setResult({ status: "error", profile: null, warningsByIndex: null });
      }
    })();

    return () => {
      disposed = true;
    };
  }, [pathSignature, tab]);

  return result;
}

function pointKey(latitude_deg: number, longitude_deg: number): string {
  return `${latitude_deg.toFixed(9)},${longitude_deg.toFixed(9)}`;
}

function serializePathPoints(points: ReturnType<typeof missionPathPoints>): string {
  return points
    .map((point) =>
      [
        point.latitude_deg.toFixed(9),
        point.longitude_deg.toFixed(9),
        point.altitude_m === null ? "null" : point.altitude_m.toFixed(3),
        point.frame ?? "null",
        point.index ?? "null",
        point.isHome ? "home" : "waypoint",
      ].join(":"),
    )
    .join("|");
}

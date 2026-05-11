import type { FlightPathQuery } from "../logs";
import type { FlightPathPoint } from "../playback";

const REPLAY_MARKER_HALF_WINDOW_USEC = 500_000;

export type ReplayMapOverlayState = {
  phase: "loading" | "ready" | "failed";
  entryId: string;
  path: FlightPathPoint[];
  marker: FlightPathPoint | null;
  error: string | null;
};

export function buildReplayMarkerFlightPathQuery(
  entryId: string,
  cursorUsec: number | null,
): FlightPathQuery | null {
  if (cursorUsec === null) {
    return null;
  }

  return {
    entry_id: entryId,
    start_usec: Math.max(0, cursorUsec - REPLAY_MARKER_HALF_WINDOW_USEC),
    end_usec: cursorUsec + REPLAY_MARKER_HALF_WINDOW_USEC,
    max_points: null,
  };
}

export function createReplayPathOverlay(
  entryId: string,
  phase: ReplayMapOverlayState["phase"],
  path: FlightPathPoint[],
  error: string | null,
): ReplayMapOverlayState {
  return {
    phase,
    entryId,
    path,
    marker: null,
    error,
  };
}

export function resolveReplayMapOverlayMarker(
  points: FlightPathPoint[],
  cursorUsec: number | null,
): FlightPathPoint | null {
  if (points.length === 0) {
    return null;
  }

  if (cursorUsec === null) {
    return points[points.length - 1] ?? null;
  }

  let nearestPoint = points[0] ?? null;
  let nearestDistance = nearestPoint ? Math.abs(nearestPoint.timestamp_usec - cursorUsec) : Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = Math.abs(point.timestamp_usec - cursorUsec);
    if (distance < nearestDistance) {
      nearestPoint = point;
      nearestDistance = distance;
    }
  }

  return nearestPoint;
}

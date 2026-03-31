import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, LoiterDirection, MissionItem } from "./mavkit-types";
import { commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "./mavkit-types";

export type PathPoint = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number | null;
  frame: "msl" | "rel_home" | "terrain" | null;
  index: number | null;
  isHome: boolean;
  /** True when this waypoint is a loiter command; used to draw flat horizontal segments on the terrain chart. */
  isLoiter?: boolean;
  /** Loiter radius in metres, extracted from the MAVLink command when available. */
  loiterRadius_m?: number;
  /** True when this waypoint is a spline waypoint (Catmull-Rom path to this point). */
  isSpline?: boolean;
  /** True when this waypoint is an arc waypoint. */
  isArc?: boolean;
  /** Absolute arc sweep angle in degrees, present only when isArc is true. */
  arcAngleDeg?: number;
  /** Arc direction, present only when isArc is true. */
  arcDirection?: LoiterDirection;
};

export function missionPathPoints(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
): PathPoint[] {
  const points: PathPoint[] = [];

  if (homePosition) {
    points.push({
      latitude_deg: homePosition.latitude_deg,
      longitude_deg: homePosition.longitude_deg,
      altitude_m: homePosition.altitude_m,
      frame: "msl",
      index: null,
      isHome: true,
    });
  }

  for (const item of items) {
    const document = item.document as Partial<MissionItem>;
    const command = document?.command;
    if (!command || typeof command !== "object") continue;

    const typedCommand = command as MissionItem["command"];
    const position = commandPosition(typedCommand);
    if (!position) continue;

    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);
    const { value: altitude_m, frame } = geoPoint3dAltitude(position);

    const loiterInfo = extractLoiterInfo(typedCommand);
    const curveInfo = extractCurveInfo(typedCommand);

    points.push({
      latitude_deg,
      longitude_deg,
      altitude_m,
      frame,
      index: item.index,
      isHome: false,
      ...loiterInfo,
      ...curveInfo,
    });
  }

  return points;
}

/** Extract loiter metadata from a mission command, if it is a loiter variant. */
function extractLoiterInfo(
  command: MissionItem["command"],
): { isLoiter: true; loiterRadius_m?: number } | undefined {
  if (!("Nav" in command)) return undefined;
  const nav = command.Nav;
  if (typeof nav !== "object") return undefined;

  if ("LoiterUnlimited" in nav) return { isLoiter: true, loiterRadius_m: nav.LoiterUnlimited.radius_m };
  if ("LoiterTurns" in nav) return { isLoiter: true, loiterRadius_m: nav.LoiterTurns.radius_m };
  // LoiterTime has no radius_m field in the MAVLink command.
  if ("LoiterTime" in nav) return { isLoiter: true };
  if ("LoiterToAlt" in nav) return { isLoiter: true, loiterRadius_m: nav.LoiterToAlt.radius_m };

  return undefined;
}

/** Extract spline/arc metadata from a mission command, if applicable. */
function extractCurveInfo(
  command: MissionItem["command"],
): { isSpline: true } | { isArc: true; arcAngleDeg: number; arcDirection: LoiterDirection } | undefined {
  if (!("Nav" in command)) return undefined;
  const nav = command.Nav;
  if (typeof nav !== "object") return undefined;

  if ("SplineWaypoint" in nav) return { isSpline: true };
  if ("ArcWaypoint" in nav) {
    return {
      isArc: true,
      arcAngleDeg: Math.abs(nav.ArcWaypoint.arc_angle_deg),
      arcDirection: nav.ArcWaypoint.direction,
    };
  }

  return undefined;
}

export function pathLineCoordinates(
  points: Pick<PathPoint, "latitude_deg" | "longitude_deg">[],
): [number, number][] {
  return points.map((point) => [point.longitude_deg, point.latitude_deg]);
}

export function missionPathLineCoordinates(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
): [number, number][] {
  return pathLineCoordinates(missionPathPoints(homePosition, items));
}

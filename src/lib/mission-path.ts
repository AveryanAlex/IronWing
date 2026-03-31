import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, MissionItem } from "./mavkit-types";
import { commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "./mavkit-types";

export type PathPoint = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number | null;
  frame: "msl" | "rel_home" | "terrain" | null;
  index: number | null;
  isHome: boolean;
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

    const position = commandPosition(command as MissionItem["command"]);
    if (!position) continue;

    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);
    const { value: altitude_m, frame } = geoPoint3dAltitude(position);

    points.push({
      latitude_deg,
      longitude_deg,
      altitude_m,
      frame,
      index: item.index,
      isHome: false,
    });
  }

  return points;
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

import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, LoiterDirection, MissionItem } from "./mavkit-types";
import { commandPosition, geoPoint3dAltitude, geoPoint3dLatLon } from "./mavkit-types";
import { dissolveRegion, type SurveyDraftExtension, type SurveyPatternType } from "./survey-region";

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
  /** Source of this route point when it belongs to generated/non-manual mission geometry. */
  source?: "survey";
  surveyRegionId?: string;
  surveyPatternType?: SurveyPatternType;
  surveyLabel?: string;
  surveyLocalIndex?: number;
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
    const point = missionItemPathPoint(item.document, item.index);
    if (point) {
      points.push(point);
    }
  }

  return points;
}

export function missionPathPointsWithSurveys(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
  survey: SurveyDraftExtension,
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

  const orderedBlocks = survey.surveyRegionOrder
    .map((block, orderIndex) => ({ block, orderIndex }))
    .sort((left, right) => left.block.position - right.block.position || left.orderIndex - right.orderIndex);
  let blockIndex = 0;

  const appendSurveysAtPosition = (position: number) => {
    while (blockIndex < orderedBlocks.length && orderedBlocks[blockIndex]?.block.position === position) {
      const regionId = orderedBlocks[blockIndex]?.block.regionId;
      const region = regionId ? survey.surveyRegions.get(regionId) ?? null : null;
      if (region) {
        const surveyLabel = `${surveyPatternLabel(region.patternType)} survey ${blockIndex + 1}`;
        dissolveRegion(region).forEach((missionItem, surveyLocalIndex) => {
          const point = missionItemPathPoint(missionItem, null, {
            source: "survey",
            surveyRegionId: region.id,
            surveyPatternType: region.patternType,
            surveyLabel,
            surveyLocalIndex,
          });
          if (point) {
            points.push(point);
          }
        });
      }
      blockIndex += 1;
    }
  };

  appendSurveysAtPosition(0);

  items.forEach((item, itemIndex) => {
    const point = missionItemPathPoint(item.document, item.index);
    if (point) {
      points.push(point);
    }
    appendSurveysAtPosition(itemIndex + 1);
  });

  while (blockIndex < orderedBlocks.length) {
    appendSurveysAtPosition(orderedBlocks[blockIndex]?.block.position ?? 0);
  }

  return points;
}

type PathPointSourceMetadata = Pick<
  PathPoint,
  "source" | "surveyRegionId" | "surveyPatternType" | "surveyLabel" | "surveyLocalIndex"
>;

function missionItemPathPoint(
  item: TypedDraftItem["document"] | MissionItem,
  index: number | null,
  sourceMetadata?: PathPointSourceMetadata,
): PathPoint | null {
  const document = item as Partial<MissionItem>;
  const command = document?.command;
  if (!command || typeof command !== "object") return null;

  const typedCommand = command as MissionItem["command"];
  const position = commandPosition(typedCommand);
  if (!position) return null;

  const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);
  const { value: altitude_m, frame } = geoPoint3dAltitude(position);
  const loiterInfo = extractLoiterInfo(typedCommand);
  const curveInfo = extractCurveInfo(typedCommand);

  return {
    latitude_deg,
    longitude_deg,
    altitude_m,
    frame,
    index,
    isHome: false,
    ...loiterInfo,
    ...curveInfo,
    ...sourceMetadata,
  };
}

function surveyPatternLabel(patternType: SurveyPatternType): string {
  switch (patternType) {
    case "corridor":
      return "Corridor";
    case "structure":
      return "Structure";
    case "grid":
    default:
      return "Grid";
  }
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

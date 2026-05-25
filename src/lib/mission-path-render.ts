import type { TypedDraftItem } from "./mission-draft-typed";
import {
  geoPoint3dLatLon,
  type HomePosition,
  type LoiterDirection,
  type MissionCommand,
  type MissionItem,
} from "./mavkit-types";
import {
  bearingDistance,
  latLonFromBearingDistance,
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";
import { sampleArcPoints, sampleSplinePoints } from "./mission-path-interpolation";
import { dissolveRegion, type SurveyDraftExtension } from "./survey-region";

export type MissionRenderCoordinate = [longitude_deg: number, latitude_deg: number];

export type MissionRenderEndpoint = {
  routeKey: string;
  itemIndex: number | null;
  latitude_deg: number;
  longitude_deg: number;
  isHome: boolean;
};

export type MissionRenderLeg = {
  id: string;
  kind: "straight" | "spline" | "arc";
  coordinates: MissionRenderCoordinate[];
  from: MissionRenderEndpoint;
  to: MissionRenderEndpoint;
  isSpline: boolean;
  isArc: boolean;
  isLandingLeg: boolean;
  /** Relative position of this leg to the actively executing waypoint seq. */
  segmentStatus?: "completed" | "active" | "upcoming";
};

export type MissionRenderLoiterCircle = {
  id: string;
  kind: "loiter";
  coordinates: MissionRenderCoordinate[][];
  itemIndex: number | null;
  center: MissionRenderCoordinate;
  radius_m: number;
  direction: LoiterDirection;
  usesDefaultRadius: boolean;
};

export type MissionRenderLabel = {
  id: string;
  kind: "label";
  coordinate: MissionRenderCoordinate;
  itemIndex: number | null;
  text: string;
  distanceText: string;
  bearingText: string;
  distance_m: number;
  bearing_deg: number;
  isSpline: boolean;
  isArc: boolean;
  isLandingLeg: boolean;
};

export type MissionRenderFeatures = {
  legs: MissionRenderLeg[];
  loiterCircles: MissionRenderLoiterCircle[];
  labels: MissionRenderLabel[];
  landingStartIndex: number | null;
};

type ClassifiedRenderCommand =
  | {
    kind: "waypoint";
    position: GeoRef;
  }
  | {
    kind: "spline";
    position: GeoRef;
  }
  | {
    kind: "arc";
    position: GeoRef;
    arcAngleDeg: number;
    direction: LoiterDirection;
  }
  | {
    kind: "loiter";
    position: GeoRef;
    radius_m: number;
    direction: LoiterDirection;
    usesDefaultRadius: boolean;
  }
  | {
    kind: "land_start";
    position: GeoRef;
  }
  | {
    kind: "position_only";
    position: GeoRef;
  };

type RenderNode = {
  routeKey: string;
  itemIndex: number | null;
  surveyRegionId?: string;
  position: GeoRef;
  isHome: boolean;
  classified: ClassifiedRenderCommand | null;
};

type MissionRenderCommandInput = {
  routeKey: string;
  itemIndex: number | null;
  surveyRegionId?: string;
  command: MissionCommand;
};

const DEFAULT_LOITER_TIME_RADIUS_M = 30;
const SPLINE_SAMPLE_STEPS = 20;
const ARC_SAMPLE_STEPS = 20;
const LOITER_CIRCLE_VERTICES = 64;

export function classifyMissionRenderCommand(
  command: MissionCommand,
): ClassifiedRenderCommand | null {
  if ("Nav" in command) {
    const nav = command.Nav;
    if (typeof nav === "string") {
      return null;
    }

    if ("Waypoint" in nav) {
      return { kind: "waypoint", position: geoPoint3dLatLon(nav.Waypoint.position) };
    }

    if ("SplineWaypoint" in nav) {
      return { kind: "spline", position: geoPoint3dLatLon(nav.SplineWaypoint.position) };
    }

    if ("ArcWaypoint" in nav) {
      return {
        kind: "arc",
        position: geoPoint3dLatLon(nav.ArcWaypoint.position),
        arcAngleDeg: Math.abs(nav.ArcWaypoint.arc_angle_deg),
        direction: nav.ArcWaypoint.direction,
      };
    }

    if ("LoiterUnlimited" in nav) {
      return {
        kind: "loiter",
        position: geoPoint3dLatLon(nav.LoiterUnlimited.position),
        radius_m: nav.LoiterUnlimited.radius_m,
        direction: nav.LoiterUnlimited.direction,
        usesDefaultRadius: false,
      };
    }

    if ("LoiterTurns" in nav) {
      return {
        kind: "loiter",
        position: geoPoint3dLatLon(nav.LoiterTurns.position),
        radius_m: nav.LoiterTurns.radius_m,
        direction: nav.LoiterTurns.direction,
        usesDefaultRadius: false,
      };
    }

    if ("LoiterTime" in nav) {
      return {
        kind: "loiter",
        position: geoPoint3dLatLon(nav.LoiterTime.position),
        radius_m: DEFAULT_LOITER_TIME_RADIUS_M,
        direction: nav.LoiterTime.direction,
        usesDefaultRadius: true,
      };
    }

    if ("LoiterToAlt" in nav) {
      return {
        kind: "loiter",
        position: geoPoint3dLatLon(nav.LoiterToAlt.position),
        radius_m: nav.LoiterToAlt.radius_m,
        direction: nav.LoiterToAlt.direction,
        usesDefaultRadius: false,
      };
    }

    if (
      "Takeoff" in nav ||
      "Land" in nav ||
      "VtolTakeoff" in nav ||
      "VtolLand" in nav ||
      "ContinueAndChangeAlt" in nav ||
      "PayloadPlace" in nav
    ) {
      const position =
        "Takeoff" in nav
          ? nav.Takeoff.position
          : "Land" in nav
            ? nav.Land.position
            : "VtolTakeoff" in nav
              ? nav.VtolTakeoff.position
              : "VtolLand" in nav
                ? nav.VtolLand.position
                : "ContinueAndChangeAlt" in nav
                  ? nav.ContinueAndChangeAlt.position
                  : nav.PayloadPlace.position;

      return {
        kind: "position_only",
        position: geoPoint3dLatLon(position),
      };
    }

    return null;
  }

  if ("Do" in command) {
    const action = command.Do;
    if (typeof action === "string") {
      return null;
    }

    if ("LandStart" in action) {
      return {
        kind: "land_start",
        position: geoPoint3dLatLon(action.LandStart.position),
      };
    }
  }

  return null;
}

export function buildMissionRenderFeatures(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
  options?: { currentSeq?: number | null },
): MissionRenderFeatures {
  return buildMissionRenderFeaturesFromCommands(homePosition, manualMissionRenderInputs(items), options);
}

export function buildMissionRenderFeaturesWithSurveys(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
  survey: SurveyDraftExtension,
  options?: { currentSeq?: number | null },
): MissionRenderFeatures {
  return buildMissionRenderFeaturesFromCommands(homePosition, missionRenderInputsWithSurveys(items, survey), options);
}

function buildMissionRenderFeaturesFromCommands(
  homePosition: HomePosition | null,
  items: MissionRenderCommandInput[],
  options?: { currentSeq?: number | null },
): MissionRenderFeatures {
  const features: MissionRenderFeatures = {
    legs: [],
    loiterCircles: [],
    labels: [],
    landingStartIndex: null,
  };

  const nodes: RenderNode[] = [];

  if (homePosition) {
    nodes.push({
      routeKey: "home",
      itemIndex: null,
      position: {
        latitude_deg: homePosition.latitude_deg,
        longitude_deg: homePosition.longitude_deg,
      },
      isHome: true,
      classified: null,
    });
  }

  for (const item of items) {
    const classified = classifyMissionRenderCommand(item.command);
    if (!classified) {
      continue;
    }

    if (classified.kind === "land_start" && features.landingStartIndex === null && item.itemIndex !== null) {
      features.landingStartIndex = item.itemIndex;
    }

    nodes.push({
      routeKey: item.routeKey,
      itemIndex: item.itemIndex,
      surveyRegionId: item.surveyRegionId,
      position: classified.position,
      isHome: false,
      classified,
    });

    if (classified.kind === "loiter" && classified.radius_m > 0) {
      features.loiterCircles.push(buildLoiterCircleFeature(classified, item.itemIndex, item.routeKey));
    }
  }

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (!previous || !current) {
      continue;
    }
    if (previous.surveyRegionId && previous.surveyRegionId === current.surveyRegionId) {
      continue;
    }

    const prevControl = nodes[index - 2] ?? previous;
    const nextControl = nodes[index + 1] ?? current;

    let kind: MissionRenderLeg["kind"] = "straight";
    let coordinates = straightLineCoordinates(previous.position, current.position);

    if (current.classified?.kind === "arc") {
      const arcCoordinates = sampleArcSegment(
        previous.position,
        current.position,
        current.classified.arcAngleDeg,
        current.classified.direction,
      );
      if (arcCoordinates) {
        kind = "arc";
        coordinates = arcCoordinates;
      }
    } else if (shouldSplineSegment(previous, current)) {
      kind = "spline";
      coordinates = sampleSplineSegment(
        prevControl.position,
        previous.position,
        current.position,
        nextControl.position,
      );
    }

    const isLandingLeg =
      features.landingStartIndex !== null &&
      current.itemIndex !== null &&
      current.itemIndex >= features.landingStartIndex;

    const fromEndpoint = buildEndpoint(previous);
    const toEndpoint = buildEndpoint(current);

    const leg: MissionRenderLeg = {
      id: `mission-leg-${previous.routeKey}-to-${current.routeKey}`,
      kind,
      coordinates,
      from: fromEndpoint,
      to: toEndpoint,
      isSpline: kind === "spline",
      isArc: kind === "arc",
      isLandingLeg,
      segmentStatus: classifySegmentStatus(fromEndpoint.itemIndex, toEndpoint.itemIndex, options?.currentSeq),
    };

    features.legs.push(leg);

    const label = buildLegLabel(leg);
    if (label) {
      features.labels.push(label);
    }
  }

  return features;
}

function manualMissionRenderInputs(items: TypedDraftItem[]): MissionRenderCommandInput[] {
  return items.flatMap((item) => {
    const command = commandFromMissionItemDocument(item.document);
    return command
      ? [{ routeKey: `mission-${item.uiId}`, itemIndex: item.index, command }]
      : [];
  });
}

function missionRenderInputsWithSurveys(
  items: TypedDraftItem[],
  survey: SurveyDraftExtension,
): MissionRenderCommandInput[] {
  const inputs: MissionRenderCommandInput[] = [];
  const orderedBlocks = survey.surveyRegionOrder
    .map((block, orderIndex) => ({ block, orderIndex }))
    .sort((left, right) => left.block.position - right.block.position || left.orderIndex - right.orderIndex);
  let blockIndex = 0;

  const appendSurveysAtPosition = (position: number) => {
    while (blockIndex < orderedBlocks.length && orderedBlocks[blockIndex]?.block.position === position) {
      const regionId = orderedBlocks[blockIndex]?.block.regionId;
      const region = regionId ? survey.surveyRegions.get(regionId) ?? null : null;
      if (region) {
        inputs.push(...surveyEndpointRenderInputs(region.id, dissolveRegion(region)));
      }
      blockIndex += 1;
    }
  };

  appendSurveysAtPosition(0);

  items.forEach((item, itemIndex) => {
    const command = commandFromMissionItemDocument(item.document);
    if (command) {
      inputs.push({ routeKey: `mission-${item.uiId}`, itemIndex: item.index, command });
    }
    appendSurveysAtPosition(itemIndex + 1);
  });

  while (blockIndex < orderedBlocks.length) {
    appendSurveysAtPosition(orderedBlocks[blockIndex]?.block.position ?? 0);
  }

  return inputs;
}

function commandFromMissionItemDocument(document: TypedDraftItem["document"] | MissionItem): MissionCommand | null {
  const missionItem = document as Partial<MissionItem>;
  const command = missionItem?.command;
  return command && typeof command === "object" ? command as MissionCommand : null;
}

function surveyEndpointRenderInputs(regionId: string, missionItems: MissionItem[]): MissionRenderCommandInput[] {
  const positionalInputs = missionItems.flatMap((missionItem, localIndex) => {
    const command = commandFromMissionItemDocument(missionItem);
    return command && classifyMissionRenderCommand(command)
      ? [{ routeKey: `survey-${regionId}-${localIndex}`, itemIndex: null, surveyRegionId: regionId, command }]
      : [];
  });

  const first = positionalInputs[0];
  const last = positionalInputs[positionalInputs.length - 1];
  if (!first) {
    return [];
  }

  if (!last || last.routeKey === first.routeKey) {
    return [first];
  }

  return [first, last];
}

function buildEndpoint(node: RenderNode): MissionRenderEndpoint {
  return {
    routeKey: node.routeKey,
    itemIndex: node.itemIndex,
    latitude_deg: node.position.latitude_deg,
    longitude_deg: node.position.longitude_deg,
    isHome: node.isHome,
  };
}

/**
 * Classify where this leg falls relative to the current executing mission sequence.
 * A leg is "active" when it spans the currentSeq boundary (from < currentSeq <= to),
 * "completed" when both endpoints are strictly before currentSeq, and "upcoming" otherwise.
 * Returns undefined when no currentSeq is provided.
 */
function classifySegmentStatus(
  fromItemIndex: number | null,
  toItemIndex: number | null,
  currentSeq: number | null | undefined,
): MissionRenderLeg["segmentStatus"] {
  if (currentSeq == null) return undefined;

  // Treat home (itemIndex null) as seq -1 so it always counts as "before" any real seq.
  const fromSeq = fromItemIndex ?? -1;
  const toSeq = toItemIndex ?? -1;

  if (toSeq < currentSeq) return "completed";
  if (fromSeq < currentSeq) return "active";
  return "upcoming";
}

function shouldSplineSegment(previous: RenderNode, current: RenderNode): boolean {
  return previous.classified?.kind === "spline" || current.classified?.kind === "spline";
}

function straightLineCoordinates(
  start: GeoRef,
  end: GeoRef,
): MissionRenderCoordinate[] {
  return [toCoordinate(start), toCoordinate(end)];
}

function sampleSplineSegment(
  control0: GeoRef,
  point1: GeoRef,
  point2: GeoRef,
  control3: GeoRef,
  sampleSteps = SPLINE_SAMPLE_STEPS,
): MissionRenderCoordinate[] {
  return sampleSplinePoints(control0, point1, point2, control3, sampleSteps)
    .map(toCoordinate);
}

function sampleArcSegment(
  start: GeoRef,
  end: GeoRef,
  arcAngleDeg: number,
  direction: LoiterDirection,
  sampleSteps = ARC_SAMPLE_STEPS,
): MissionRenderCoordinate[] | null {
  const points = sampleArcPoints(start, end, arcAngleDeg, direction, sampleSteps);
  return points?.map(toCoordinate) ?? null;
}

function buildLoiterCircleFeature(
  loiter: Extract<ClassifiedRenderCommand, { kind: "loiter" }>,
  itemIndex: number | null,
  routeKey: string,
): MissionRenderLoiterCircle {
  const ring: MissionRenderCoordinate[] = [];
  for (let vertex = 0; vertex < LOITER_CIRCLE_VERTICES; vertex += 1) {
    const bearing_deg = (360 * vertex) / LOITER_CIRCLE_VERTICES;
    const { lat, lon } = latLonFromBearingDistance(
      loiter.position,
      bearing_deg,
      loiter.radius_m,
    );
    ring.push([lon, lat]);
  }
  ring.push(ring[0]!);

  return {
    id: `mission-loiter-${routeKey}`,
    kind: "loiter",
    coordinates: [ring],
    itemIndex,
    center: toCoordinate(loiter.position),
    radius_m: loiter.radius_m,
    direction: loiter.direction,
    usesDefaultRadius: loiter.usesDefaultRadius,
  };
}

function buildLegLabel(leg: MissionRenderLeg): MissionRenderLabel | null {
  if (leg.coordinates.length === 0) {
    return null;
  }

  const segments = buildSegments(leg.coordinates);
  if (segments.length === 0) {
    return null;
  }

  const distance_m = segments.reduce((sum, segment) => sum + segment.distance_m, 0);
  const start = coordinateToGeoRef(leg.coordinates[0]!);
  const end = coordinateToGeoRef(leg.coordinates[leg.coordinates.length - 1]!);
  const { bearing_deg } = bearingDistance(start, end.latitude_deg, end.longitude_deg);
  const midpoint = polylineMidpoint(segments, distance_m);
  const distanceText = formatDistanceLabel(distance_m);
  const bearingText = formatBearingLabel(bearing_deg);

  return {
    id: `mission-label-${leg.id}`,
    kind: "label",
    coordinate: toCoordinate(midpoint),
    itemIndex: leg.to.itemIndex,
    text: distanceText,
    distanceText,
    bearingText,
    distance_m,
    bearing_deg,
    isSpline: leg.isSpline,
    isArc: leg.isArc,
    isLandingLeg: leg.isLandingLeg,
  };
}

function buildSegments(coordinates: MissionRenderCoordinate[]): Array<{
  start: GeoRef;
  end: GeoRef;
  distance_m: number;
}> {
  const segments: Array<{ start: GeoRef; end: GeoRef; distance_m: number }> = [];

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinateToGeoRef(coordinates[index - 1]!);
    const end = coordinateToGeoRef(coordinates[index]!);
    const { distance_m } = bearingDistance(start, end.latitude_deg, end.longitude_deg);
    segments.push({ start, end, distance_m });
  }

  return segments;
}

function polylineMidpoint(
  segments: Array<{ start: GeoRef; end: GeoRef; distance_m: number }>,
  totalDistance: number,
): GeoRef {
  if (segments.length === 0) {
    return { latitude_deg: 0, longitude_deg: 0 };
  }

  const halfway = totalDistance / 2;
  let traversed = 0;
  for (const segment of segments) {
    const nextTraversed = traversed + segment.distance_m;
    if (nextTraversed >= halfway) {
      if (segment.distance_m === 0) {
        return segment.start;
      }
      const ratio = (halfway - traversed) / segment.distance_m;
      const offset = latLonToLocalXY(
        segment.start,
        segment.end.latitude_deg,
        segment.end.longitude_deg,
      );
      const { lat, lon } = localXYToLatLon(
        segment.start,
        offset.x_m * ratio,
        offset.y_m * ratio,
      );
      return { latitude_deg: lat, longitude_deg: lon };
    }
    traversed = nextTraversed;
  }

  return segments[segments.length - 1]!.end;
}

function formatDistanceLabel(distance_m: number): string {
  if (distance_m < 1000) {
    return `${Math.round(distance_m)} m`;
  }
  return `${(distance_m / 1000).toFixed(1)} km`;
}

function formatBearingLabel(bearing_deg: number): string {
  const normalized = ((Math.round(bearing_deg) % 360) + 360) % 360;
  return `${String(normalized).padStart(3, "0")}°`;
}

function toCoordinate(point: GeoRef): MissionRenderCoordinate {
  return [point.longitude_deg, point.latitude_deg];
}

function coordinateToGeoRef(
  coordinate: MissionRenderCoordinate,
): GeoRef {
  return {
    latitude_deg: coordinate[1],
    longitude_deg: coordinate[0],
  };
}

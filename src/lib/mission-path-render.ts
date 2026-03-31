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

export type MissionRenderCoordinate = [longitude_deg: number, latitude_deg: number];

export type MissionRenderEndpoint = {
  itemIndex: number | null;
  latitude_deg: number;
  longitude_deg: number;
  isHome: boolean;
};

export type MissionRenderLeg = {
  kind: "straight" | "spline" | "arc";
  coordinates: MissionRenderCoordinate[];
  from: MissionRenderEndpoint;
  to: MissionRenderEndpoint;
  isSpline: boolean;
  isArc: boolean;
  isLandingLeg: boolean;
};

export type MissionRenderLoiterCircle = {
  kind: "loiter";
  coordinates: MissionRenderCoordinate[][];
  itemIndex: number;
  center: MissionRenderCoordinate;
  radius_m: number;
  direction: LoiterDirection;
  usesDefaultRadius: boolean;
};

export type MissionRenderLabel = {
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
  itemIndex: number | null;
  position: GeoRef;
  isHome: boolean;
  classified: ClassifiedRenderCommand | null;
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
    const document = item.document as Partial<MissionItem>;
    const command = document?.command;
    if (!command || typeof command !== "object") {
      continue;
    }

    const classified = classifyMissionRenderCommand(command as MissionCommand);
    if (!classified) {
      continue;
    }

    if (classified.kind === "land_start" && features.landingStartIndex === null) {
      features.landingStartIndex = item.index;
    }

    nodes.push({
      itemIndex: item.index,
      position: classified.position,
      isHome: false,
      classified,
    });

    if (classified.kind === "loiter") {
      features.loiterCircles.push(buildLoiterCircleFeature(classified, item.index));
    }
  }

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (!previous || !current) {
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

    const leg: MissionRenderLeg = {
      kind,
      coordinates,
      from: buildEndpoint(previous),
      to: buildEndpoint(current),
      isSpline: kind === "spline",
      isArc: kind === "arc",
      isLandingLeg,
    };

    features.legs.push(leg);

    const label = buildLegLabel(leg);
    if (label) {
      features.labels.push(label);
    }
  }

  return features;
}

function buildEndpoint(node: RenderNode): MissionRenderEndpoint {
  return {
    itemIndex: node.itemIndex,
    latitude_deg: node.position.latitude_deg,
    longitude_deg: node.position.longitude_deg,
    isHome: node.isHome,
  };
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
  const reference = point1;
  const p0 = latLonToLocalXY(reference, control0.latitude_deg, control0.longitude_deg);
  const p1 = latLonToLocalXY(reference, point1.latitude_deg, point1.longitude_deg);
  const p2 = latLonToLocalXY(reference, point2.latitude_deg, point2.longitude_deg);
  const p3 = latLonToLocalXY(reference, control3.latitude_deg, control3.longitude_deg);

  const coordinates: MissionRenderCoordinate[] = [];
  for (let step = 0; step <= sampleSteps; step += 1) {
    const t = step / sampleSteps;
    const x_m = catmullRomComponent(p0.x_m, p1.x_m, p2.x_m, p3.x_m, t);
    const y_m = catmullRomComponent(p0.y_m, p1.y_m, p2.y_m, p3.y_m, t);
    const { lat, lon } = localXYToLatLon(reference, x_m, y_m);
    coordinates.push([lon, lat]);
  }

  coordinates[0] = toCoordinate(point1);
  coordinates[coordinates.length - 1] = toCoordinate(point2);
  return coordinates;
}

function catmullRomComponent(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function sampleArcSegment(
  start: GeoRef,
  end: GeoRef,
  arcAngleDeg: number,
  direction: LoiterDirection,
  sampleSteps = ARC_SAMPLE_STEPS,
): MissionRenderCoordinate[] | null {
  if (arcAngleDeg === 0) {
    return null;
  }

  const reference = start;
  const startXY = latLonToLocalXY(reference, start.latitude_deg, start.longitude_deg);
  const endXY = latLonToLocalXY(reference, end.latitude_deg, end.longitude_deg);
  const chordX = endXY.x_m - startXY.x_m;
  const chordY = endXY.y_m - startXY.y_m;
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength === 0) {
    return null;
  }

  const theta = Math.abs((arcAngleDeg * Math.PI) / 180);
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-9) {
    return null;
  }

  const midpointX = (startXY.x_m + endXY.x_m) / 2;
  const midpointY = (startXY.y_m + endXY.y_m) / 2;
  const leftNormalX = -chordY / chordLength;
  const leftNormalY = chordX / chordLength;
  const normalSign = direction === "CounterClockwise" ? 1 : -1;
  const centerDistance = chordLength / (2 * Math.tan(theta / 2));
  const centerX = midpointX + leftNormalX * centerDistance * normalSign;
  const centerY = midpointY + leftNormalY * centerDistance * normalSign;
  const radius = Math.hypot(startXY.x_m - centerX, startXY.y_m - centerY);
  const startAngle = Math.atan2(startXY.y_m - centerY, startXY.x_m - centerX);
  const sweep = direction === "CounterClockwise" ? theta : -theta;

  const coordinates: MissionRenderCoordinate[] = [];
  for (let step = 0; step <= sampleSteps; step += 1) {
    const t = step / sampleSteps;
    const angle = startAngle + sweep * t;
    const x_m = centerX + radius * Math.cos(angle);
    const y_m = centerY + radius * Math.sin(angle);
    const { lat, lon } = localXYToLatLon(reference, x_m, y_m);
    coordinates.push([lon, lat]);
  }

  coordinates[0] = toCoordinate(start);
  coordinates[coordinates.length - 1] = toCoordinate(end);
  return coordinates;
}

function buildLoiterCircleFeature(
  loiter: Extract<ClassifiedRenderCommand, { kind: "loiter" }>,
  itemIndex: number,
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
    kind: "label",
    coordinate: toCoordinate(midpoint),
    itemIndex: leg.to.itemIndex,
    text: `${distanceText} • ${bearingText}`,
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

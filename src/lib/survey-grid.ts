import type { MissionItem, GeoPoint3d } from "./mavkit-types";
import {
  latLonToLocalXY,
  localXYToLatLon,
  type GeoRef,
} from "./mission-coordinates";
import type {
  GridValidationError as MissionGridValidationError,
  PolygonVertex,
  StartCorner,
  TurnDirection,
} from "./mission-grid";
import {
  groundSampleDistance,
  laneSpacing as computeLaneSpacing,
  triggerDistance as computeTriggerDistance,
  type CameraOrientation,
  type CameraSpec,
} from "./survey-camera";

export type GridValidationError =
  | MissionGridValidationError
  | {
      code:
        | "invalid_camera"
        | "invalid_overlap"
        | "missing_terrain_lookup"
        | "invalid_turnaround_distance"
        | "invalid_capture_mode"
        | "invalid_hover_hold_time";
      message: string;
    };

export type SurveyCaptureMode = "distance" | "hover";
export type TerrainLookup = (
  latitude_deg: number,
  longitude_deg: number,
) => Promise<number | null>;

export type SurveyParams = {
  polygon: PolygonVertex[];
  camera: CameraSpec;
  orientation: CameraOrientation;
  altitude_m: number;
  sideOverlap_pct: number;
  frontOverlap_pct: number;
  trackAngle_deg: number;
  startCorner: StartCorner;
  turnDirection: TurnDirection;
  crosshatch: boolean;
  turnaroundDistance_m: number;
  terrainFollow: boolean;
  terrainLookup?: TerrainLookup;
  captureMode: SurveyCaptureMode;
  hoverHoldTime_s?: number;
};

export type SurveyTransect = Array<{
  latitude_deg: number;
  longitude_deg: number;
}>;

export type SurveyStats = {
  gsd_m: number;
  photoCount: number;
  area_m2: number;
  triggerDistance_m: number;
  laneSpacing_m: number;
  laneCount: number;
  crosshatchLaneCount: number;
};

export type SurveyResult =
  | {
      ok: true;
      items: MissionItem[];
      transects: SurveyTransect[];
      crosshatchTransects: SurveyTransect[];
      stats: SurveyStats;
      params: SurveyParams;
    }
  | {
      ok: false;
      errors: GridValidationError[];
    };

type Vec2 = { x: number; y: number };

type PlannedTransect = {
  start: Vec2;
  end: Vec2;
  leadIn: Vec2 | null;
  leadOut: Vec2 | null;
  length_m: number;
  transect: SurveyTransect;
};

const DEFAULT_HOVER_HOLD_TIME_S = 1;
const PHOTO_COUNT_EPSILON_M = 1e-9;

export async function generateSurvey(params: SurveyParams): Promise<SurveyResult> {
  const normalizedParams = normalizeSurveyParams(params);
  const validation = validateSurveyParams(normalizedParams, true);
  if (validation.length > 0) {
    return { ok: false, errors: validation };
  }

  const derived = deriveSurveyMetrics(normalizedParams);
  if (!derived.ok) {
    return { ok: false, errors: derived.errors };
  }

  const ref = polygonCentroid(normalizedParams.polygon);
  const localPolygon = normalizedParams.polygon.map((vertex) => {
    const { x_m, y_m } = latLonToLocalXY(ref, vertex.latitude_deg, vertex.longitude_deg);
    return { x: x_m, y: y_m };
  });
  const area_m2 = Math.abs(signedArea(localPolygon));

  const primaryTransects = planTransects(
    localPolygon,
    ref,
    normalizedParams.trackAngle_deg,
    derived.laneSpacing_m,
    normalizedParams.startCorner,
    normalizedParams.turnDirection,
    normalizedParams.turnaroundDistance_m,
  );
  if (primaryTransects.length === 0) {
    return {
      ok: false,
      errors: [{
        code: "invalid_spacing",
        message: "Computed lane spacing is wider than the polygon — no survey transects were generated.",
      }],
    };
  }

  const crosshatchTransects = normalizedParams.crosshatch
    ? planTransects(
        localPolygon,
        ref,
        normalizedParams.trackAngle_deg + 90,
        derived.laneSpacing_m,
        normalizedParams.startCorner,
        normalizedParams.turnDirection,
        normalizedParams.turnaroundDistance_m,
      )
    : [];

  const items: MissionItem[] = [];
  const positionResolver = createPositionResolver(normalizedParams);

  await appendTransectItems(items, primaryTransects, normalizedParams, derived.triggerDistance_m, positionResolver);
  await appendTransectItems(items, crosshatchTransects, normalizedParams, derived.triggerDistance_m, positionResolver);

  const photoCount = [...primaryTransects, ...crosshatchTransects].reduce(
    (sum, transect) => sum + photoCountForTransect(transect.length_m, derived.triggerDistance_m),
    0,
  );

  return {
    ok: true,
    items,
    transects: primaryTransects.map((transect) => transect.transect),
    crosshatchTransects: crosshatchTransects.map((transect) => transect.transect),
    stats: {
      gsd_m: derived.gsd_m,
      photoCount,
      area_m2,
      triggerDistance_m: derived.triggerDistance_m,
      laneSpacing_m: derived.laneSpacing_m,
      laneCount: primaryTransects.length,
      crosshatchLaneCount: crosshatchTransects.length,
    },
    params: normalizedParams,
  };
}

export function estimateSurveyWaypointCount(
  params: Omit<SurveyParams, "terrainLookup">,
): number | null {
  const normalizedParams = normalizeSurveyParams(params);
  const validation = validateSurveyParams(normalizedParams, false);
  if (validation.length > 0) {
    return null;
  }

  const derived = deriveSurveyMetrics(normalizedParams);
  if (!derived.ok) {
    return null;
  }

  const ref = polygonCentroid(normalizedParams.polygon);
  const localPolygon = normalizedParams.polygon.map((vertex) => {
    const { x_m, y_m } = latLonToLocalXY(ref, vertex.latitude_deg, vertex.longitude_deg);
    return { x: x_m, y: y_m };
  });

  const primaryTransects = planTransects(
    localPolygon,
    ref,
    normalizedParams.trackAngle_deg,
    derived.laneSpacing_m,
    normalizedParams.startCorner,
    normalizedParams.turnDirection,
    normalizedParams.turnaroundDistance_m,
  );
  if (primaryTransects.length === 0) {
    return null;
  }

  const crosshatchTransects = normalizedParams.crosshatch
    ? planTransects(
        localPolygon,
        ref,
        normalizedParams.trackAngle_deg + 90,
        derived.laneSpacing_m,
        normalizedParams.startCorner,
        normalizedParams.turnDirection,
        normalizedParams.turnaroundDistance_m,
      )
    : [];

  return countMissionItems(primaryTransects, normalizedParams, derived.triggerDistance_m) +
    countMissionItems(crosshatchTransects, normalizedParams, derived.triggerDistance_m);
}

function normalizeSurveyParams(params: Omit<SurveyParams, "terrainLookup"> & Pick<SurveyParams, "terrainLookup">): SurveyParams {
  return {
    ...params,
    hoverHoldTime_s: params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S,
  };
}

function validateSurveyParams(
  params: SurveyParams,
  requireTerrainLookup: boolean,
): GridValidationError[] {
  const errors: GridValidationError[] = [];

  if (params.polygon.length < 3) {
    errors.push({
      code: "too_few_points",
      message: `Polygon must have at least 3 vertices (got ${params.polygon.length}).`,
    });
  }

  for (let index = 0; index < params.polygon.length; index += 1) {
    const vertex = params.polygon[index];
    if (
      !Number.isFinite(vertex.latitude_deg) ||
      !Number.isFinite(vertex.longitude_deg) ||
      vertex.latitude_deg < -90 ||
      vertex.latitude_deg > 90 ||
      vertex.longitude_deg < -180 ||
      vertex.longitude_deg > 180
    ) {
      errors.push({
        code: "invalid_coordinates",
        message: `Vertex ${index} has invalid coordinates (${vertex.latitude_deg}, ${vertex.longitude_deg}).`,
      });
    }
  }

  if (!Number.isFinite(params.altitude_m) || params.altitude_m <= 0) {
    errors.push({
      code: "invalid_altitude",
      message: `Altitude must be a finite number greater than zero (got ${params.altitude_m}).`,
    });
  }

  if (!isValidOverlap(params.sideOverlap_pct)) {
    errors.push({
      code: "invalid_overlap",
      message: `sideOverlap_pct must be in the range 0..1 or 0..100 (got ${params.sideOverlap_pct}).`,
    });
  }

  if (!isValidOverlap(params.frontOverlap_pct)) {
    errors.push({
      code: "invalid_overlap",
      message: `frontOverlap_pct must be in the range 0..1 or 0..100 (got ${params.frontOverlap_pct}).`,
    });
  }

  if (!Number.isFinite(params.turnaroundDistance_m) || params.turnaroundDistance_m < 0) {
    errors.push({
      code: "invalid_turnaround_distance",
      message: `turnaroundDistance_m must be a finite number greater than or equal to zero (got ${params.turnaroundDistance_m}).`,
    });
  }

  if (params.captureMode !== "distance" && params.captureMode !== "hover") {
    errors.push({
      code: "invalid_capture_mode",
      message: `captureMode must be either \"distance\" or \"hover\" (got ${String(params.captureMode)}).`,
    });
  }

  if (
    params.captureMode === "hover" &&
    (!Number.isFinite(params.hoverHoldTime_s) || (params.hoverHoldTime_s ?? 0) <= 0)
  ) {
    errors.push({
      code: "invalid_hover_hold_time",
      message: `hoverHoldTime_s must be a finite number greater than zero in hover capture mode (got ${params.hoverHoldTime_s}).`,
    });
  }

  if (params.terrainFollow && requireTerrainLookup && !params.terrainLookup) {
    errors.push({
      code: "missing_terrain_lookup",
      message: "terrainLookup is required when terrainFollow is enabled.",
    });
  }

  if (errors.length > 0) {
    return errors;
  }

  const ref = polygonCentroid(params.polygon);
  const localPolygon = params.polygon.map((vertex) => {
    const { x_m, y_m } = latLonToLocalXY(ref, vertex.latitude_deg, vertex.longitude_deg);
    return { x: x_m, y: y_m };
  });

  const area_m2 = Math.abs(signedArea(localPolygon));
  if (area_m2 < 1e-6) {
    errors.push({
      code: "zero_area",
      message: "Polygon has zero or near-zero area (collinear or duplicate points).",
    });
  }

  if (hasSelfIntersection(localPolygon)) {
    errors.push({
      code: "self_intersection",
      message: "Polygon edges intersect each other.",
    });
  }

  try {
    groundSampleDistance(params.camera, params.altitude_m, params.orientation);
  } catch (error) {
    errors.push({
      code: "invalid_camera",
      message: error instanceof Error ? error.message : "Camera parameters are invalid.",
    });
  }

  return errors;
}

function isValidOverlap(overlap: number): boolean {
  return Number.isFinite(overlap) && overlap >= 0 && overlap <= 100;
}

function deriveSurveyMetrics(
  params: SurveyParams,
):
  | { ok: true; laneSpacing_m: number; triggerDistance_m: number; gsd_m: number }
  | { ok: false; errors: GridValidationError[] } {
  try {
    const laneSpacing_m = computeLaneSpacing(
      params.camera,
      params.altitude_m,
      params.sideOverlap_pct,
      params.orientation,
    );
    const triggerDistance_m = computeTriggerDistance(
      params.camera,
      params.altitude_m,
      params.frontOverlap_pct,
      params.orientation,
    );
    const gsd_m = groundSampleDistance(
      params.camera,
      params.altitude_m,
      params.orientation,
    );

    const errors: GridValidationError[] = [];
    if (!Number.isFinite(laneSpacing_m) || laneSpacing_m <= 0) {
      errors.push({
        code: "invalid_overlap",
        message: `Computed lane spacing must be greater than zero (got ${laneSpacing_m}). Reduce side overlap below 100%.`,
      });
    }

    if (!Number.isFinite(triggerDistance_m) || triggerDistance_m <= 0) {
      errors.push({
        code: "invalid_overlap",
        message: `Computed trigger distance must be greater than zero (got ${triggerDistance_m}). Reduce front overlap below 100%.`,
      });
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, laneSpacing_m, triggerDistance_m, gsd_m };
  } catch (error) {
    return {
      ok: false,
      errors: [{
        code: "invalid_camera",
        message: error instanceof Error ? error.message : "Failed to derive camera survey metrics.",
      }],
    };
  }
}

async function appendTransectItems(
  items: MissionItem[],
  transects: PlannedTransect[],
  params: SurveyParams,
  triggerDistance_m: number,
  positionResolver: (point: { latitude_deg: number; longitude_deg: number }) => Promise<GeoPoint3d>,
): Promise<void> {
  for (const transect of transects) {
    if (transect.leadIn) {
      items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.leadIn, params.polygon))));
    }

    if (params.captureMode === "distance") {
      items.push(createTriggerDistanceItem(triggerDistance_m, true));
      items.push(createWaypointItem(await positionResolver(transect.transect[0])));
      items.push(createWaypointItem(await positionResolver(transect.transect[1])));
      items.push(createTriggerDistanceItem(0, false));
    } else {
      const photoPoints = samplePhotoPoints(transect.start, transect.end, triggerDistance_m)
        .map((point) => localPointToGeo(point, params.polygon));

      for (const photoPoint of photoPoints) {
        items.push(
          createWaypointItem(
            await positionResolver(photoPoint),
            params.hoverHoldTime_s ?? DEFAULT_HOVER_HOLD_TIME_S,
          ),
        );
        items.push(createImageStartCaptureItem());
      }
    }

    if (transect.leadOut) {
      items.push(createWaypointItem(await positionResolver(localPointToGeo(transect.leadOut, params.polygon))));
    }
  }
}

function countMissionItems(
  transects: PlannedTransect[],
  params: SurveyParams,
  triggerDistance_m: number,
): number {
  return transects.reduce((count, transect) => {
    const turnaroundItems = (transect.leadIn ? 1 : 0) + (transect.leadOut ? 1 : 0);
    if (params.captureMode === "distance") {
      return count + turnaroundItems + 4;
    }

    const photoCount = photoCountForTransect(transect.length_m, triggerDistance_m);
    return count + turnaroundItems + photoCount * 2;
  }, 0);
}

function createPositionResolver(params: SurveyParams) {
  const cache = new Map<string, Promise<GeoPoint3d>>();

  return async (point: { latitude_deg: number; longitude_deg: number }): Promise<GeoPoint3d> => {
    const key = `${point.latitude_deg.toFixed(10)},${point.longitude_deg.toFixed(10)}`;
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }

    const pending = (async () => {
      if (params.terrainFollow && params.terrainLookup) {
        const terrainElevation = await params.terrainLookup(point.latitude_deg, point.longitude_deg);
        if (terrainElevation !== null) {
          return {
            Terrain: {
              latitude_deg: point.latitude_deg,
              longitude_deg: point.longitude_deg,
              altitude_terrain_m: params.altitude_m,
            },
          };
        }
      }

      return {
        RelHome: {
          latitude_deg: point.latitude_deg,
          longitude_deg: point.longitude_deg,
          relative_alt_m: params.altitude_m,
        },
      };
    })();

    cache.set(key, pending);
    return pending;
  };
}

function createWaypointItem(position: GeoPoint3d, hold_time_s = 0): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position,
          hold_time_s,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function createTriggerDistanceItem(meters: number, trigger_now: boolean): MissionItem {
  return {
    command: {
      Do: {
        CamTriggerDistance: {
          meters,
          trigger_now,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function createImageStartCaptureItem(): MissionItem {
  return {
    command: {
      Do: {
        ImageStartCapture: {
          instance: 0,
          interval_s: 0,
          total_images: 1,
          start_number: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function planTransects(
  polygon: Vec2[],
  ref: GeoRef,
  trackAngle_deg: number,
  laneSpacing_m: number,
  startCorner: StartCorner,
  turnDirection: TurnDirection,
  turnaroundDistance_m: number,
): PlannedTransect[] {
  const rotAngle = 90 - trackAngle_deg;
  const rotatedPolygon = polygon.map((point) => rotatePoint(point, rotAngle));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of rotatedPolygon) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const firstY = minY + laneSpacing_m / 2;
  const eps = laneSpacing_m * 1e-6;
  const lanes: Array<{ left: Vec2; right: Vec2 }> = [];

  for (let y = firstY; y < maxY - eps; y += laneSpacing_m) {
    const xs = scanlineIntersections(rotatedPolygon, y);
    for (let index = 0; index + 1 < xs.length; index += 2) {
      lanes.push({
        left: { x: xs[index], y },
        right: { x: xs[index + 1], y },
      });
    }
  }

  const startRight = shouldStartRight(startCorner, turnDirection);
  const startBottom = shouldStartBottom(startCorner);
  const orderedLanes = startBottom ? lanes : [...lanes].reverse();

  return orderedLanes.map((lane, index) => {
    const goRight = (index % 2 === 0) === startRight;
    const rotatedStart = goRight ? lane.left : lane.right;
    const rotatedEnd = goRight ? lane.right : lane.left;
    const start = rotatePoint(rotatedStart, -rotAngle);
    const end = rotatePoint(rotatedEnd, -rotAngle);
    const direction = normalizeVector({ x: end.x - start.x, y: end.y - start.y });
    const leadIn = turnaroundDistance_m > 0
      ? {
          x: start.x - direction.x * turnaroundDistance_m,
          y: start.y - direction.y * turnaroundDistance_m,
        }
      : null;
    const leadOut = turnaroundDistance_m > 0
      ? {
          x: end.x + direction.x * turnaroundDistance_m,
          y: end.y + direction.y * turnaroundDistance_m,
        }
      : null;

    return {
      start,
      end,
      leadIn,
      leadOut,
      length_m: distanceBetween(start, end),
      transect: [
        localPointToGeoWithRef(start, ref),
        localPointToGeoWithRef(end, ref),
      ],
    };
  });
}

function rotatePoint(point: Vec2, angleDeg: number): Vec2 {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);
  return {
    x: point.x * cosAngle - point.y * sinAngle,
    y: point.x * sinAngle + point.y * cosAngle,
  };
}

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    area += points[index].x * points[nextIndex].y;
    area -= points[nextIndex].x * points[index].y;
  }
  return area / 2;
}

function hasSelfIntersection(points: Vec2[]): boolean {
  const pointCount = points.length;
  for (let i = 0; i < pointCount; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % pointCount];
    for (let j = i + 2; j < pointCount; j += 1) {
      if (i === 0 && j === pointCount - 1) {
        continue;
      }
      const c = points[j];
      const d = points[(j + 1) % pointCount];
      if (segmentsIntersect(a, b, c, d)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;

  return false;
}

function cross(origin: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function onSegment(a: Vec2, b: Vec2, point: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

function scanlineIntersections(polygon: Vec2[], y: number): number[] {
  const intersections: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (a.y === b.y) {
      continue;
    }

    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    if (y < yMin || y >= yMax) {
      continue;
    }

    const t = (y - a.y) / (b.y - a.y);
    intersections.push(a.x + t * (b.x - a.x));
  }

  intersections.sort((left, right) => left - right);
  return intersections;
}

function shouldStartRight(corner: StartCorner, turn: TurnDirection): boolean {
  switch (corner) {
    case "bottom_left":
      return turn === "clockwise";
    case "bottom_right":
      return turn === "counterclockwise";
    case "top_left":
      return turn === "counterclockwise";
    case "top_right":
      return turn === "clockwise";
  }
}

function shouldStartBottom(corner: StartCorner): boolean {
  return corner === "bottom_left" || corner === "bottom_right";
}

function polygonCentroid(vertices: PolygonVertex[]): GeoRef {
  let latitudeSum = 0;
  let longitudeSum = 0;
  for (const vertex of vertices) {
    latitudeSum += vertex.latitude_deg;
    longitudeSum += vertex.longitude_deg;
  }
  return {
    latitude_deg: latitudeSum / vertices.length,
    longitude_deg: longitudeSum / vertices.length,
  };
}

function localPointToGeo(point: Vec2, polygon: PolygonVertex[]) {
  return localPointToGeoWithRef(point, polygonCentroid(polygon));
}

function localPointToGeoWithRef(point: Vec2, ref: GeoRef) {
  const { lat, lon } = localXYToLatLon(ref, point.x, point.y);
  return { latitude_deg: lat, longitude_deg: lon };
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeVector(vector: Vec2): Vec2 {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

function photoCountForTransect(length_m: number, triggerDistance_m: number): number {
  if (triggerDistance_m <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor((length_m + PHOTO_COUNT_EPSILON_M) / triggerDistance_m) + 1);
}

function samplePhotoPoints(start: Vec2, end: Vec2, triggerDistance_m: number): Vec2[] {
  const length_m = distanceBetween(start, end);
  const photoCount = photoCountForTransect(length_m, triggerDistance_m);
  if (photoCount <= 1 || length_m === 0) {
    return [start];
  }

  return Array.from({ length: photoCount }, (_, index) => {
    const distance_m = Math.min(index * triggerDistance_m, length_m);
    const t = length_m === 0 ? 0 : distance_m / length_m;
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  });
}

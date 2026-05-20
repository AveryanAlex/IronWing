import type { CameraOptions, LngLat, Map as MapLibreMap } from "maplibre-gl";

export const SVS_CAMERA_MOUNT = {
  pitchDeg: 0,
  yawDeg: 0,
  rollDeg: 0,
  upM: 0,
} as const;

export const SVS_CAMERA_FALLBACK_AGL_M = 100;
export const SVS_CAMERA_VERTICAL_FOV_DEG = 55;
export const SVS_CAMERA_LOOK_AHEAD_MIN_M = 400;
export const SVS_CAMERA_LOOK_AHEAD_MAX_M = 2_500;
export const SVS_CAMERA_LOOK_AHEAD_AGL_MULTIPLIER = 25;
export const SVS_CAMERA_LOOK_AHEAD_FALLBACK_M = 1_200;
export const SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_START_DEG = -12;
export const SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_END_DEG = -2;
export const SVS_CAMERA_GROUND_TARGET_FALLBACK_AGL_M = 100;

export type SvsCameraMount = {
  pitchDeg?: number;
  yawDeg?: number;
  rollDeg?: number;
  upM?: number;
};

export type SvsCameraMode = "nose" | "ground_stabilized";

export type SvsCameraAltitudeSource =
  | "msl"
  | "terrain_relative"
  | "home_relative"
  | "terrain_fallback"
  | "home_fallback"
  | "sea_level_fallback";

export type SvsCameraAltitudeInput = {
  altitudeMslM?: number | null;
  heightAboveTerrainM?: number | null;
  relativeHomeAltitudeM?: number | null;
  terrainMslM?: number | null;
  homeTerrainMslM?: number | null;
  homeAltitudeMslM?: number | null;
  fallbackAglM?: number;
};

export type SvsCameraAltitude = {
  altitudeMslM: number;
  source: SvsCameraAltitudeSource;
};

export type SvsAircraftCameraPose = {
  latitudeDeg: number;
  longitudeDeg: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  altitudeMslM: number;
  terrainMslM?: number | null;
  heightAboveTerrainM?: number | null;
};

export type SvsLookAheadTarget = {
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeMslM: number;
  distanceM: number;
};

type SvsCameraMap = Pick<MapLibreMap, "calculateCameraOptionsFromTo" | "jumpTo">;

export function resolveSvsCameraAltitudeMsl(input: SvsCameraAltitudeInput): SvsCameraAltitude {
  const altitudeMsl = finiteOrNull(input.altitudeMslM);
  if (altitudeMsl !== null) {
    return { altitudeMslM: altitudeMsl, source: "msl" };
  }

  const terrainMsl = finiteOrNull(input.terrainMslM);
  const heightAboveTerrain = finiteOrNull(input.heightAboveTerrainM);
  if (terrainMsl !== null && heightAboveTerrain !== null) {
    return { altitudeMslM: terrainMsl + heightAboveTerrain, source: "terrain_relative" };
  }

  const homeTerrainMsl = finiteOrNull(input.homeTerrainMslM) ?? finiteOrNull(input.homeAltitudeMslM);
  const relativeHomeAltitude = finiteOrNull(input.relativeHomeAltitudeM);
  if (homeTerrainMsl !== null && relativeHomeAltitude !== null) {
    return { altitudeMslM: homeTerrainMsl + relativeHomeAltitude, source: "home_relative" };
  }

  const fallbackAgl = finiteOrNull(input.fallbackAglM) ?? SVS_CAMERA_FALLBACK_AGL_M;
  if (terrainMsl !== null) {
    return { altitudeMslM: terrainMsl + fallbackAgl, source: "terrain_fallback" };
  }

  if (homeTerrainMsl !== null) {
    return { altitudeMslM: homeTerrainMsl + fallbackAgl, source: "home_fallback" };
  }

  return { altitudeMslM: fallbackAgl, source: "sea_level_fallback" };
}

export function createSvsAircraftCameraOptions(
  map: SvsCameraMap,
  pose: SvsAircraftCameraPose,
  mount: SvsCameraMount = SVS_CAMERA_MOUNT,
  mode: SvsCameraMode = "nose",
): CameraOptions | null {
  if (!poseIsValid(pose)) return null;

  const bearing = normalizeDegrees(pose.headingDeg + (mount.yawDeg ?? 0));
  const roll = mode === "ground_stabilized" ? 0 : normalizeSignedDegrees(pose.rollDeg + (mount.rollDeg ?? 0));
  const altitudeMsl = pose.altitudeMslM + (finiteOrNull(mount.upM) ?? 0);
  const resolvedPose = { ...pose, altitudeMslM: altitudeMsl };
  const target = mode === "ground_stabilized"
    ? createSvsGroundStabilizedTarget(resolvedPose)
    : createSvsLookAheadTarget(resolvedPose, bearing, mount);
  if (!target) return null;

  const options = map.calculateCameraOptionsFromTo(
    lngLat(pose.longitudeDeg, pose.latitudeDeg),
    altitudeMsl,
    lngLat(target.longitudeDeg, target.latitudeDeg),
    target.altitudeMslM,
  );

  return {
    ...options,
    bearing: mode === "ground_stabilized" ? bearing : options.bearing,
    pitch: mode === "ground_stabilized" ? 0 : options.pitch,
    roll,
  };
}

export function createSvsLookAheadTarget(
  pose: SvsAircraftCameraPose,
  bearingDeg: number,
  mount: SvsCameraMount = SVS_CAMERA_MOUNT,
): SvsLookAheadTarget | null {
  if (!poseIsValid(pose)) return null;

  const pitchDeg = pose.pitchDeg + (mount.pitchDeg ?? 0);
  const distanceM = resolveLookAheadDistanceM(pose, pitchDeg);
  const target = destinationPoint(pose.latitudeDeg, pose.longitudeDeg, bearingDeg, distanceM);
  const targetAltitudeMsl = pose.altitudeMslM + Math.tan(toRadians(pitchDeg)) * distanceM;

  return {
    longitudeDeg: target.longitudeDeg,
    latitudeDeg: target.latitudeDeg,
    altitudeMslM: targetAltitudeMsl,
    distanceM,
  };
}

export function applySvsAircraftCamera(
  map: SvsCameraMap,
  pose: SvsAircraftCameraPose,
  mount: SvsCameraMount = SVS_CAMERA_MOUNT,
  mode: SvsCameraMode = "nose",
): boolean {
  const options = createSvsAircraftCameraOptions(map, pose, mount, mode);
  if (!options) return false;

  map.jumpTo(options);
  return true;
}

function createSvsGroundStabilizedTarget(pose: SvsAircraftCameraPose): SvsLookAheadTarget | null {
  const targetAltitudeMsl = resolveGroundTargetAltitudeMsl(pose);
  if (targetAltitudeMsl === null) return null;

  return {
    longitudeDeg: pose.longitudeDeg,
    latitudeDeg: pose.latitudeDeg,
    altitudeMslM: targetAltitudeMsl,
    distanceM: 0,
  };
}

function poseIsValid(pose: SvsAircraftCameraPose): boolean {
  return Number.isFinite(pose.latitudeDeg)
    && Number.isFinite(pose.longitudeDeg)
    && Number.isFinite(pose.headingDeg)
    && Number.isFinite(pose.pitchDeg)
    && Number.isFinite(pose.rollDeg)
    && Number.isFinite(pose.altitudeMslM);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function lngLat(lng: number, lat: number): LngLat {
  return { lng, lat } as LngLat;
}

function resolveGroundTargetAltitudeMsl(pose: SvsAircraftCameraPose): number | null {
  const terrainMsl = finiteOrNull(pose.terrainMslM);
  if (terrainMsl !== null && terrainMsl < pose.altitudeMslM - 1) {
    return terrainMsl;
  }

  const heightAboveTerrain = finiteOrNull(pose.heightAboveTerrainM);
  if (heightAboveTerrain !== null && heightAboveTerrain > 1) {
    return pose.altitudeMslM - heightAboveTerrain;
  }

  return pose.altitudeMslM - SVS_CAMERA_GROUND_TARGET_FALLBACK_AGL_M;
}

function resolveLookAheadDistanceM(pose: SvsAircraftCameraPose, pitchDeg: number): number {
  const aglM = resolveAglM(pose);
  if (aglM === null || aglM <= 0) {
    return SVS_CAMERA_LOOK_AHEAD_FALLBACK_M;
  }

  const levelDistanceM = clamp(
    aglM * SVS_CAMERA_LOOK_AHEAD_AGL_MULTIPLIER,
    SVS_CAMERA_LOOK_AHEAD_MIN_M,
    SVS_CAMERA_LOOK_AHEAD_MAX_M,
  );

  if (pitchDeg >= SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_END_DEG) {
    return levelDistanceM;
  }

  const groundInterceptDistanceM = clamp(
    aglM / Math.tan(toRadians(Math.max(0.1, Math.abs(pitchDeg)))),
    SVS_CAMERA_LOOK_AHEAD_MIN_M,
    SVS_CAMERA_LOOK_AHEAD_MAX_M,
  );

  if (pitchDeg <= SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_START_DEG) {
    return groundInterceptDistanceM;
  }

  const blend = smoothstep(
    SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_START_DEG,
    SVS_CAMERA_LOOK_AHEAD_DOWN_BLEND_END_DEG,
    pitchDeg,
  );
  return lerp(groundInterceptDistanceM, levelDistanceM, blend);
}

function resolveAglM(pose: SvsAircraftCameraPose): number | null {
  const heightAboveTerrain = finiteOrNull(pose.heightAboveTerrainM);
  if (heightAboveTerrain !== null) return heightAboveTerrain;

  const terrainMsl = finiteOrNull(pose.terrainMslM);
  return terrainMsl === null ? null : pose.altitudeMslM - terrainMsl;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function destinationPoint(latitudeDeg: number, longitudeDeg: number, bearingDeg: number, distanceM: number) {
  const earthRadiusM = 6_371_008.8;
  const angularDistance = distanceM / earthRadiusM;
  const lat1 = toRadians(latitudeDeg);
  const lon1 = toRadians(longitudeDeg);
  const bearing = toRadians(bearingDeg);
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);

  const lat2 = Math.asin(
    sinLat1 * cosAngularDistance + cosLat1 * sinAngularDistance * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * sinAngularDistance * cosLat1,
    cosAngularDistance - sinLat1 * Math.sin(lat2),
  );

  return {
    latitudeDeg: toDegrees(lat2),
    longitudeDeg: normalizeLongitude(toDegrees(lon2)),
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function normalizeSignedDegrees(value: number): number {
  const normalized = normalizeDegrees(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

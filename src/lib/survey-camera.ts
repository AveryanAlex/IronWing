export type CameraSpec = {
  sensorWidth_mm: number;
  sensorHeight_mm: number;
  imageWidth_px: number;
  imageHeight_px: number;
  focalLength_mm: number;
  minTriggerInterval_s?: number;
};

export type CameraOrientation = "landscape" | "portrait";

export type EffectiveSensorDimensions = {
  acrossTrack_mm: number;
  alongTrack_mm: number;
  acrossTrack_px: number;
  alongTrack_px: number;
};

export type ImageFootprint = {
  /** Across-track footprint width in metres. */
  width_m: number;
  /** Along-track footprint height in metres. */
  height_m: number;
};

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to zero.`);
  }
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero.`);
  }
}

function assertValidSpec(spec: CameraSpec): void {
  assertFinitePositive("sensorWidth_mm", spec.sensorWidth_mm);
  assertFinitePositive("sensorHeight_mm", spec.sensorHeight_mm);
  assertFinitePositive("imageWidth_px", spec.imageWidth_px);
  assertFinitePositive("imageHeight_px", spec.imageHeight_px);
  assertFinitePositive("focalLength_mm", spec.focalLength_mm);

  if (spec.minTriggerInterval_s !== undefined) {
    assertFiniteNonNegative("minTriggerInterval_s", spec.minTriggerInterval_s);
  }
}

function normalizeOverlap(overlapPct: number): number {
  if (!Number.isFinite(overlapPct)) {
    throw new RangeError("overlap_pct must be a finite number.");
  }

  if (overlapPct < 0) {
    throw new RangeError("overlap_pct must be greater than or equal to zero.");
  }

  if (overlapPct <= 1) {
    return overlapPct;
  }

  if (overlapPct <= 100) {
    return overlapPct / 100;
  }

  throw new RangeError("overlap_pct must be in the range 0..1 or 0..100.");
}

export function effectiveSensorDimensions(
  spec: CameraSpec,
  orientation: CameraOrientation,
): EffectiveSensorDimensions {
  assertValidSpec(spec);

  if (orientation === "portrait") {
    return {
      acrossTrack_mm: spec.sensorWidth_mm,
      alongTrack_mm: spec.sensorHeight_mm,
      acrossTrack_px: spec.imageWidth_px,
      alongTrack_px: spec.imageHeight_px,
    };
  }

  return {
    acrossTrack_mm: spec.sensorHeight_mm,
    alongTrack_mm: spec.sensorWidth_mm,
    acrossTrack_px: spec.imageHeight_px,
    alongTrack_px: spec.imageWidth_px,
  };
}

export function groundSampleDistance(
  spec: CameraSpec,
  altitude_m: number,
  orientation: CameraOrientation,
): number {
  assertFiniteNonNegative("altitude_m", altitude_m);
  const dims = effectiveSensorDimensions(spec, orientation);
  const acrossTrackFootprintM = (dims.acrossTrack_mm / spec.focalLength_mm) * altitude_m;
  return acrossTrackFootprintM / dims.acrossTrack_px;
}

export function imageFootprint(
  spec: CameraSpec,
  altitude_m: number,
  orientation: CameraOrientation,
): ImageFootprint {
  assertFiniteNonNegative("altitude_m", altitude_m);
  const dims = effectiveSensorDimensions(spec, orientation);

  return {
    width_m: (dims.acrossTrack_mm / spec.focalLength_mm) * altitude_m,
    height_m: (dims.alongTrack_mm / spec.focalLength_mm) * altitude_m,
  };
}

export function altitudeForGsd(
  spec: CameraSpec,
  targetGsd_m: number,
  orientation: CameraOrientation,
): number {
  assertFiniteNonNegative("targetGsd_m", targetGsd_m);
  const dims = effectiveSensorDimensions(spec, orientation);
  return (targetGsd_m * dims.acrossTrack_px * spec.focalLength_mm) / dims.acrossTrack_mm;
}

export function laneSpacing(
  spec: CameraSpec,
  altitude_m: number,
  sideOverlap_pct: number,
  orientation: CameraOrientation,
): number {
  const overlap = normalizeOverlap(sideOverlap_pct);
  const footprint = imageFootprint(spec, altitude_m, orientation);
  return footprint.width_m * (1 - overlap);
}

export function triggerDistance(
  spec: CameraSpec,
  altitude_m: number,
  frontOverlap_pct: number,
  orientation: CameraOrientation,
): number {
  const overlap = normalizeOverlap(frontOverlap_pct);
  const footprint = imageFootprint(spec, altitude_m, orientation);
  return footprint.height_m * (1 - overlap);
}

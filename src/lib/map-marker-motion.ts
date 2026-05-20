import { lerpNumber, unwrapCircularValue } from "./telemetry-smoothing";

export type LngLatTuple = [number, number];

export const VEHICLE_MARKER_MOTION_MS = 300;

type MarkerMotionTarget = {
  setLngLat(lngLat: LngLatTuple): unknown;
};

type MarkerMotionOptions = {
  durationMs?: number;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function cloneLngLat(lngLat: LngLatTuple): LngLatTuple {
  return [lngLat[0], lngLat[1]];
}

function sameLngLat(a: LngLatTuple, b: LngLatTuple): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function interpolateLngLat(from: LngLatTuple, to: LngLatTuple, progress: number): LngLatTuple {
  return [
    lerpNumber(from[0], to[0], progress),
    lerpNumber(from[1], to[1], progress),
  ];
}

function defaultNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function defaultRequestFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => callback(defaultNow()), 16) as unknown as number;
}

function defaultCancelFrame(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

export function unwrapAngleDeg(previousRenderedAngleDeg: number | null, nextAngleDeg: number): number {
  return unwrapCircularValue(previousRenderedAngleDeg, nextAngleDeg, 360);
}

export function createMarkerMotion(options: MarkerMotionOptions = {}) {
  const durationMs = Math.max(0, options.durationMs ?? VEHICLE_MARKER_MOTION_MS);
  const now = options.now ?? defaultNow;
  const requestFrame = options.requestFrame ?? defaultRequestFrame;
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame;
  let currentLngLat: LngLatTuple | null = null;
  let frameHandle: number | null = null;

  function cancelAnimation() {
    if (frameHandle == null) return;
    cancelFrame(frameHandle);
    frameHandle = null;
  }

  function setInstant(marker: MarkerMotionTarget, lngLat: LngLatTuple) {
    cancelAnimation();
    currentLngLat = cloneLngLat(lngLat);
    marker.setLngLat(currentLngLat);
  }

  function animateTo(marker: MarkerMotionTarget, lngLat: LngLatTuple) {
    const targetLngLat = cloneLngLat(lngLat);

    if (currentLngLat == null || durationMs === 0) {
      setInstant(marker, targetLngLat);
      return;
    }

    if (sameLngLat(currentLngLat, targetLngLat)) {
      marker.setLngLat(targetLngLat);
      return;
    }

    cancelAnimation();
    const startLngLat = cloneLngLat(currentLngLat);
    const startMs = now();

    const step = (timestampMs: number) => {
      const progress = clamp01((timestampMs - startMs) / durationMs);

      if (progress >= 1) {
        currentLngLat = targetLngLat;
        marker.setLngLat(targetLngLat);
        frameHandle = null;
        return;
      }

      currentLngLat = interpolateLngLat(startLngLat, targetLngLat, progress);
      marker.setLngLat(currentLngLat);
      frameHandle = requestFrame(step);
    };

    frameHandle = requestFrame(step);
  }

  function reset() {
    cancelAnimation();
    currentLngLat = null;
  }

  return {
    animateTo,
    reset,
    setInstant,
  };
}

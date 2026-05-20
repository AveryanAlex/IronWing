export type NumberSmootherOptions = {
  durationMs?: number;
  circularRange?: number;
  maxJump?: number;
};

export type SetSmootherTargetOptions = {
  instant?: boolean;
};

const DEFAULT_DURATION_MS = 250;

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * clamp01(progress);
}

export function unwrapCircularValue(previousRenderedValue: number | null, nextValue: number, range: number): number {
  if (!Number.isFinite(nextValue)) {
    return previousRenderedValue ?? 0;
  }

  if (previousRenderedValue == null || !Number.isFinite(previousRenderedValue) || !Number.isFinite(range) || range <= 0) {
    return nextValue;
  }

  const previousNormalized = positiveModulo(previousRenderedValue, range);
  const shortestDelta = positiveModulo(nextValue - previousNormalized + range / 2, range) - range / 2;
  return previousRenderedValue + shortestDelta;
}

export function createNumberSmoother(options: NumberSmootherOptions = {}) {
  const durationMs = Math.max(0, options.durationMs ?? DEFAULT_DURATION_MS);
  const circularRange = options.circularRange;
  const maxJump = options.maxJump == null ? null : Math.max(0, options.maxJump);

  let renderedValue: number | null = null;
  let startValue: number | null = null;
  let targetValue: number | null = null;
  let startMs = 0;

  function resolveTarget(value: number, currentValue: number | null): number {
    if (circularRange == null) {
      return value;
    }

    return unwrapCircularValue(currentValue, value, circularRange);
  }

  function setInstant(value: number) {
    renderedValue = value;
    startValue = value;
    targetValue = value;
  }

  function valueAt(timestampMs: number): number | null {
    if (targetValue == null || startValue == null || renderedValue == null) {
      return renderedValue;
    }

    if (durationMs === 0 || startValue === targetValue) {
      setInstant(targetValue);
      return renderedValue;
    }

    const progress = clamp01((timestampMs - startMs) / durationMs);
    renderedValue = lerpNumber(startValue, targetValue, progress);

    if (progress >= 1) {
      setInstant(targetValue);
    }

    return renderedValue;
  }

  function setTarget(value: number | null | undefined, timestampMs: number, targetOptions: SetSmootherTargetOptions = {}) {
    if (value == null || !Number.isFinite(value)) {
      reset();
      return;
    }

    const currentValue = valueAt(timestampMs);
    const nextTarget = resolveTarget(value, currentValue);

    if (targetOptions.instant || currentValue == null) {
      setInstant(nextTarget);
      startMs = timestampMs;
      return;
    }

    if (maxJump != null && Math.abs(nextTarget - currentValue) > maxJump) {
      setInstant(nextTarget);
      startMs = timestampMs;
      return;
    }

    if (targetValue === nextTarget) {
      return;
    }

    renderedValue = currentValue;
    startValue = currentValue;
    targetValue = nextTarget;
    startMs = timestampMs;
  }

  function reset() {
    renderedValue = null;
    startValue = null;
    targetValue = null;
    startMs = 0;
  }

  function current(): number | null {
    return renderedValue;
  }

  function isAnimating(timestampMs: number): boolean {
    if (targetValue == null || startValue == null || durationMs === 0 || startValue === targetValue) {
      return false;
    }

    return (timestampMs - startMs) / durationMs < 1;
  }

  return {
    current,
    isAnimating,
    reset,
    setTarget,
    valueAt,
  };
}

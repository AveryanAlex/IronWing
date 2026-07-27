export type SliderScale = "linear" | "log";

export const LOG_SLIDER_POSITION_MIN = 0;
export const LOG_SLIDER_POSITION_MAX = 1000;

export function resolveSliderScale(scale: SliderScale, min: number, max: number): SliderScale {
  return scale === "log" && isLogSliderRange(min, max) ? "log" : "linear";
}

export function isLogSliderRange(min: number, max: number): boolean {
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min;
}

export function logSliderPositionForValue(value: number, min: number, max: number): number {
  if (!isLogSliderRange(min, max)) {
    return LOG_SLIDER_POSITION_MIN;
  }

  const clamped = clampSliderValue(value, min, max);
  const ratio = Math.log(clamped / min) / Math.log(max / min);
  return Math.round(LOG_SLIDER_POSITION_MIN + ratio * (LOG_SLIDER_POSITION_MAX - LOG_SLIDER_POSITION_MIN));
}

export function valueForLogSliderPosition(
  position: number,
  min: number,
  max: number,
  step: number,
): number {
  if (!isLogSliderRange(min, max)) {
    return clampSliderValue(position, min, max);
  }

  if (position <= LOG_SLIDER_POSITION_MIN) {
    return min;
  }
  if (position >= LOG_SLIDER_POSITION_MAX) {
    return max;
  }

  const ratio = (position - LOG_SLIDER_POSITION_MIN) / (LOG_SLIDER_POSITION_MAX - LOG_SLIDER_POSITION_MIN);
  const value = min * Math.exp(ratio * Math.log(max / min));
  return snapSliderValue(value, min, max, step);
}

export function snapSliderValue(value: number, min: number, max: number, step: number): number {
  const clamped = clampSliderValue(value, min, max);
  if (!Number.isFinite(step) || step <= 0) {
    return clamped;
  }

  if (clamped === min || clamped === max) {
    return clamped;
  }

  const snapped = min + Math.round((clamped - min) / step) * step;
  const precision = Math.min(12, Math.max(decimalPlaces(min), decimalPlaces(step)) + 2);
  return clampSliderValue(Number(snapped.toFixed(precision)), min, max);
}

function clampSliderValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) {
    return Number.parseInt(text.split("e-")[1] ?? "0", 10) || 0;
  }

  return text.split(".")[1]?.length ?? 0;
}

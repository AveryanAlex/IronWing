import { clampNumber } from "../numeric";
export { clampNumber, roundToIncrement } from "../numeric";

export type RateCurvePoint = {
  stick: number;
  rateDegS: number;
};

export function ardupilotInputExpo(input: number, expo: number): number {
  const x = clampNumber(input, -1, 1);
  if (expo < 0.95) {
    return ((1 - expo) * x) / (1 - expo * Math.abs(x));
  }

  return x;
}

export function cubicExpo(input: number, expo: number): number {
  const x = clampNumber(input, -1, 1);
  const alpha = clampNumber(expo, 0, 1);
  return (1 - alpha) * x + alpha * x * x * x;
}

export function linearRateCurve(stick: number, maxRateDegS: number): number {
  return clampNumber(stick, -1, 1) * maxRateDegS;
}

export function ardupilotRateCurve(stick: number, maxRateDegS: number, expo: number): number {
  return maxRateDegS * ardupilotInputExpo(stick, expo);
}

export function cubicRateCurve(stick: number, maxRateDegS: number, expoPercent: number): number {
  return maxRateDegS * cubicExpo(stick, expoPercent / 100);
}

export function sampleRateCurve(
  evaluator: (stick: number) => number,
  samples = 81,
): RateCurvePoint[] {
  const sampleCount = Math.max(3, samples);
  return Array.from({ length: sampleCount }, (_, index) => {
    const stick = -1 + (2 * index) / (sampleCount - 1);
    return {
      stick: Number(stick.toFixed(4)),
      rateDegS: evaluator(stick),
    };
  });
}

export function interpolateRateCurve(points: readonly RateCurvePoint[], stick: number): number | null {
  if (points.length === 0) {
    return null;
  }

  const x = clampNumber(stick, -1, 1);
  let previous = points[0];
  if (x <= previous.stick) {
    return previous.rateDegS;
  }

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (x <= next.stick) {
      const span = next.stick - previous.stick;
      if (Math.abs(span) < Number.EPSILON) {
        return next.rateDegS;
      }

      const ratio = (x - previous.stick) / span;
      return previous.rateDegS + (next.rateDegS - previous.rateDegS) * ratio;
    }
    previous = next;
  }

  return points[points.length - 1].rateDegS;
}

export function formatRateValue(value: number, unit = "deg/s"): string {
  if (!Number.isFinite(value)) {
    return `-- ${unit}`;
  }

  const rounded = Number(value.toFixed(2));
  return `${rounded} ${unit}`;
}

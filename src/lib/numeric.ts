export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function roundToIncrement(value: number, increment: number | null | undefined): number {
  if (!Number.isFinite(value) || typeof increment !== "number" || !Number.isFinite(increment) || increment <= 0) {
    return value;
  }

  const rounded = Math.round(value / increment) * increment;
  const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(increment)) + 2));
  return Number(rounded.toFixed(decimals));
}

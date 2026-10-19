export type BitIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
  | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31;
declare const bitmask32: unique symbol;
export type Bitmask32 = number & { readonly [bitmask32]: true };
export type BitmaskOption = { bit: BitIndex; label: string };

export function isBitIndex(value: number): value is BitIndex {
  return Number.isInteger(value) && value >= 0 && value < 32;
}

/** UI masks are unsigned. Signed wire encodings require an explicit conversion. */
export function toBitmask32(value: unknown): Bitmask32 | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
    ? value as Bitmask32 : null;
}

export function fromSignedBitmask32(value: number): Bitmask32 | null {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff
    ? (value >>> 0) as Bitmask32 : null;
}

export function toSignedBitmask32(value: Bitmask32): number {
  return value | 0;
}

export function hasBit(value: number, bit: number): boolean {
  return toBitmask32(value) !== null && isBitIndex(bit) && Math.floor(value / 2 ** bit) % 2 === 1;
}

export function setBit(value: number, bit: number, enabled: boolean): number {
  if (toBitmask32(value) === null || !isBitIndex(bit)) return value;
  if (hasBit(value, bit) === enabled) return value;
  return enabled ? value + 2 ** bit : value - 2 ** bit;
}

export function toggleBit(value: number, bit: number): number {
  return setBit(value, bit, !hasBit(value, bit));
}

export function hasBitsOutside(value: number, allowed: number): boolean {
  return toBitmask32(value) !== null && toBitmask32(allowed) !== null && (value & ~allowed) !== 0;
}

export function normalizeBitmaskOptions(options: readonly { bit: number; label: string }[] | null | undefined): BitmaskOption[] {
  const normalized = new Map<BitIndex, BitmaskOption>();
  for (const option of options ?? []) {
    const label = typeof option?.label === "string" ? option.label.trim() : "";
    if (isBitIndex(option?.bit) && label) normalized.set(option.bit, { bit: option.bit, label });
  }
  return [...normalized.values()].sort((a, b) => a.bit - b.bit);
}

import { describe, expect, it } from "vitest";
import { fromSignedBitmask32, hasBit, normalizeBitmaskOptions, setBit, toBitmask32, toSignedBitmask32, toggleBit } from "./bitmask";

describe("unsigned 32-bit masks", () => {
  it("edits bit 31 without producing a negative UI value or losing unknown bits", () => {
    expect(setBit(2, 31, true)).toBe(0x80000002);
    expect(setBit(0x80000002, 0, true)).toBe(0x80000003);
    expect(toggleBit(0x80000003, 31)).toBe(3);
    expect(hasBit(0x80000000, 31)).toBe(true);
    expect(setBit(0xffffffff, 31, false)).toBe(0x7fffffff);
  });
  it("rejects invalid widths and indices without wrapping them to bit zero", () => {
    expect(toBitmask32(2 ** 32)).toBeNull();
    expect(hasBit(-1, 0)).toBe(false);
    for (const bit of [-1, 32, 0.5, NaN]) expect(toggleBit(8, bit)).toBe(8);
    expect(setBit(2 ** 32, 0, true)).toBe(2 ** 32);
  });
  it("requires an explicit signed wire conversion", () => {
    const mask = fromSignedBitmask32(-1);
    expect(mask).toBe(0xffffffff);
    expect(toSignedBitmask32(mask!)).toBe(-1);
    expect(fromSignedBitmask32(0x80000000)).toBeNull();
  });
  it("normalizes metadata labels and excludes invalid bit positions", () => {
    expect(normalizeBitmaskOptions([{ bit: 31, label: " High " }, { bit: 32, label: "Invalid" }, { bit: 0, label: "Low" }]))
      .toEqual([{ bit: 0, label: "Low" }, { bit: 31, label: "High" }]);
  });
});

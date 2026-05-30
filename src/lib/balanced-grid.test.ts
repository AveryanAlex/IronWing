import { describe, expect, it } from "vitest";

import { resolveBalancedGridColumnCount } from "./balanced-grid";

describe("resolveBalancedGridColumnCount", () => {
  it("balances four items into two rows when only three columns would fit", () => {
    expect(resolveBalancedGridColumnCount(4, 1136, 360, 12)).toBe(2);
  });

  it("uses the widest balanced layout that respects the minimum item width", () => {
    expect(resolveBalancedGridColumnCount(6, 1136, 360, 12)).toBe(3);
    expect(resolveBalancedGridColumnCount(7, 1136, 256, 12)).toBe(4);
  });

  it("falls back safely before width measurement and for empty collections", () => {
    expect(resolveBalancedGridColumnCount(4, 0, 256, 12)).toBe(4);
    expect(resolveBalancedGridColumnCount(0, 0, 256, 12)).toBe(1);
  });
});

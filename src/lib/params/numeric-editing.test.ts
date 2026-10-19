import { describe, expect, it } from "vitest";
import { normalizeNumericDraft, sameNumericValue } from "./numeric-editing";

describe("numeric editing rules", () => {
  it("enforces the range after rounding as well as before", () => {
    expect(normalizeNumericDraft({ range: { min: 0, max: 9 }, increment: 5 }, 100, 0)).toBe(9);
    expect(normalizeNumericDraft({ range: { min: 0.2, max: 9 }, increment: 1 }, -1, 1)).toBe(0.2);
    expect(normalizeNumericDraft({ increment: 0.1 }, 0.36, 0)).toBe(0.4);
  });
  it("preserves declared sentinels without weakening ordinary range checks", () => {
    const rule = { range: { min: 0, max: 120 }, increment: 0.1, specialValues: [-1] };
    expect(normalizeNumericDraft(rule, -1, 0)).toBe(-1);
    expect(normalizeNumericDraft(rule, -2, 0)).toBe(0);
    expect(normalizeNumericDraft(rule, NaN, 10)).toBe(10);
    expect(normalizeNumericDraft(rule, Infinity, 10)).toBe(10);
  });
  it("does not treat floating point artifacts as new edits", () => {
    expect(sameNumericValue(0.1 + 0.2, 0.3, 0.1)).toBe(true);
    expect(sameNumericValue(0.4, 0.3, 0.1)).toBe(false);
  });
});

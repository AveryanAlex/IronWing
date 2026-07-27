import { describe, expect, it } from "vitest";

import {
  LOG_SLIDER_POSITION_MAX,
  logSliderPositionForValue,
  resolveSliderScale,
  snapSliderValue,
  valueForLogSliderPosition,
} from "./slider-scale";

describe("log slider scale", () => {
  it("distributes a wide positive range geometrically", () => {
    expect(valueForLogSliderPosition(0, 1, 32767, 1)).toBe(1);
    expect(valueForLogSliderPosition(250, 1, 32767, 1)).toBe(13);
    expect(valueForLogSliderPosition(500, 1, 32767, 1)).toBe(181);
    expect(valueForLogSliderPosition(750, 1, 32767, 1)).toBe(2435);
    expect(valueForLogSliderPosition(LOG_SLIDER_POSITION_MAX, 1, 32767, 1)).toBe(32767);
  });

  it("maps raw values back onto the normalized track", () => {
    expect(logSliderPositionForValue(1, 1, 32767)).toBe(0);
    expect(logSliderPositionForValue(181, 1, 32767)).toBe(500);
    expect(logSliderPositionForValue(32767, 1, 32767)).toBe(1000);
  });

  it("snaps values to increments anchored at the raw minimum", () => {
    expect(snapSliderValue(0.064, 0.05, 10, 0.01)).toBe(0.06);
    expect(snapSliderValue(0.066, 0.05, 10, 0.01)).toBe(0.07);
    expect(snapSliderValue(12, 0.05, 10, 0.01)).toBe(10);
  });

  it("falls back to linear for zero, signed, or degenerate ranges", () => {
    expect(resolveSliderScale("log", 0, 100)).toBe("linear");
    expect(resolveSliderScale("log", -10, 10)).toBe("linear");
    expect(resolveSliderScale("log", 1, 1)).toBe("linear");
    expect(resolveSliderScale("log", 1, 100)).toBe("log");
  });
});

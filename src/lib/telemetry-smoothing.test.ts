import { describe, expect, it } from "vitest";

import { createNumberSmoother, lerpNumber, unwrapCircularValue } from "./telemetry-smoothing";

describe("telemetry smoothing primitives", () => {
  it("linearly interpolates numbers", () => {
    expect(lerpNumber(10, 20, 0.25)).toBe(12.5);
    expect(lerpNumber(10, 20, -1)).toBe(10);
    expect(lerpNumber(10, 20, 2)).toBe(20);
  });

  it("unwraps circular values across the zero boundary", () => {
    expect(unwrapCircularValue(359, 0, 360)).toBe(360);
    expect(unwrapCircularValue(1, 359, 360)).toBe(-1);
  });

  it("starts new target transitions from the current rendered value", () => {
    const smoother = createNumberSmoother({ durationMs: 100 });

    smoother.setTarget(0, 0);
    smoother.setTarget(100, 0);
    expect(smoother.valueAt(50)).toBe(50);

    smoother.setTarget(200, 50);

    expect(smoother.valueAt(100)).toBe(125);
    expect(smoother.valueAt(150)).toBe(200);
  });

  it("snaps across implausibly large jumps", () => {
    const smoother = createNumberSmoother({ durationMs: 100, maxJump: 10 });

    smoother.setTarget(0, 0);
    smoother.setTarget(50, 0);

    expect(smoother.current()).toBe(50);
  });
});

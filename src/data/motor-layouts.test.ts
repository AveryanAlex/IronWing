import { describe, it, expect } from "vitest";
import { getMotorLayout, getMotorCount, getAllLayouts } from "./motor-layouts";

describe("getMotorLayout", () => {
  it("returns Quad X (class 1, type 1) with exactly 4 motors", () => {
    const layout = getMotorLayout(1, 1);
    expect(layout).not.toBeNull();
    expect(layout!.motors).toHaveLength(4);
    expect(layout!.className).toBe("QUAD");
    expect(layout!.typeName).toBe("X");
  });

  it("Quad X motors all have non-zero rollFactor and pitchFactor", () => {
    const layout = getMotorLayout(1, 1)!;
    for (const m of layout.motors) {
      expect(m.rollFactor).not.toBe(0);
      expect(m.pitchFactor).not.toBe(0);
    }
  });

  it("Quad X has 2 CW and 2 CCW motors", () => {
    const layout = getMotorLayout(1, 1)!;
    const cw = layout.motors.filter((m) => m.yawFactor > 0);
    const ccw = layout.motors.filter((m) => m.yawFactor < 0);
    expect(cw).toHaveLength(2);
    expect(ccw).toHaveLength(2);
  });

  it("returns Hexa X (class 2, type 1) with 6 motors", () => {
    const layout = getMotorLayout(2, 1);
    expect(layout).not.toBeNull();
    expect(layout!.motors).toHaveLength(6);
    expect(layout!.className).toBe("HEXA");
  });

  it("returns Octo X (class 3, type 1) with 8 motors", () => {
    const layout = getMotorLayout(3, 1);
    expect(layout).not.toBeNull();
    expect(layout!.motors).toHaveLength(8);
    expect(layout!.className).toBe("OCTA");
  });

  it("returns null for unknown frame (999, 999)", () => {
    expect(getMotorLayout(999, 999)).toBeNull();
  });
});

describe("getMotorCount", () => {
  it("returns 4 for Quad X", () => {
    expect(getMotorCount(1, 1)).toBe(4);
  });

  it("returns 6 for Hexa X", () => {
    expect(getMotorCount(2, 1)).toBe(6);
  });

  it("returns 0 for unknown frame", () => {
    expect(getMotorCount(999, 999)).toBe(0);
  });
});

describe("data integrity", () => {
  const allLayouts = getAllLayouts();

  it("all motor entries have motorNumber > 0", () => {
    for (const layout of allLayouts) {
      for (const m of layout.motors) {
        expect(m.motorNumber).toBeGreaterThan(0);
      }
    }
  });

  it("all motor entries have yawFactor in {-1, 0, 1}", () => {
    for (const layout of allLayouts) {
      for (const m of layout.motors) {
        expect([-1, 0, 1]).toContain(m.yawFactor);
      }
    }
  });

  it("testOrder values are sequential starting from 1", () => {
    for (const layout of allLayouts) {
      const orders = layout.motors.map((m) => m.testOrder).sort((a, b) => a - b);
      const expected = Array.from({ length: orders.length }, (_, i) => i + 1);
      expect(orders).toEqual(expected);
    }
  });
});

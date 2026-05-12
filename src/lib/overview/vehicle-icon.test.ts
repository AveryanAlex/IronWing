import { describe, expect, it } from "vitest";
import { resolveVehicleIconKind, type VehicleIconKind } from "./vehicle-icon";

describe("resolveVehicleIconKind", () => {
  const cases: Array<[number, VehicleIconKind]> = [
    [1, "fixed_wing"],     // FIXED_WING
    [2, "multirotor"],     // QUADROTOR
    [13, "multirotor"],    // HEXAROTOR
    [14, "multirotor"],    // OCTOROTOR
    [4, "helicopter"],     // HELICOPTER
    [10, "rover"],         // GROUND_ROVER
    [11, "boat"],          // SURFACE_BOAT
    [12, "boat"],          // SUBMARINE
    [0, "fixed_wing"],     // GENERIC default
    [99, "fixed_wing"],    // unknown
  ];

  for (const [mavType, expected] of cases) {
    it(`maps MAVLink type ${mavType} → ${expected}`, () => {
      expect(resolveVehicleIconKind(mavType)).toBe(expected);
    });
  }

  it("treats undefined as fixed_wing default", () => {
    expect(resolveVehicleIconKind(undefined)).toBe("fixed_wing");
  });
});

import { expect, it } from "vitest";
import { FailsafeAction, failsafeDefault } from "./failsafe";
import { isQuadPlaneFlightMode } from "./flight-modes";

it("encodes battery actions using each firmware family's meaning", () => {
  expect(failsafeDefault("copter.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery").value).toBe(2);
  expect(failsafeDefault("plane.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery").value).toBe(1);
  expect(failsafeDefault("plane.BATT_FS_CRT_ACT", FailsafeAction.Land, "Critical Battery").value).toBe(2);
  expect(failsafeDefault("rover.BATT_FS_LOW_ACT", FailsafeAction.Rtl, "Low Battery").value).toBe(1);
  expect(failsafeDefault("rover.BATT_FS_CRT_ACT", FailsafeAction.Hold, "Critical Battery")).toMatchObject({
    value: 2,
    label: "Critical Battery → Hold",
  });
});
it("recognizes QAutotune without treating a fixed-wing mode as VTOL", () => {
  expect(isQuadPlaneFlightMode(22)).toBe(true);
  expect(isQuadPlaneFlightMode(10)).toBe(false);
});

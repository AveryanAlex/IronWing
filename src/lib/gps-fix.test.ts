import { expect, it } from "vitest";
import { gpsFixProfile } from "./gps-fix";

it("treats DGPS and both RTK states as valid 3D fixes", () => {
  expect(gpsFixProfile("dgps")).toMatchObject({ has3dFix: true, tone: "positive" });
  expect(gpsFixProfile("rtk_float")?.has3dFix).toBe(true);
  expect(gpsFixProfile("rtk_fixed")?.has3dFix).toBe(true);
  expect(gpsFixProfile("fix2d")).toMatchObject({ has3dFix: false, tone: "caution" });
  expect(gpsFixProfile(undefined)).toBeUndefined();
});

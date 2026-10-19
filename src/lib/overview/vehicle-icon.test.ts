import { describe, expect, it } from "vitest";
import { resolveVehicleIconKind } from "./vehicle-icon";
import { VEHICLE_DESCRIPTORS, getVehicleDescriptor } from "../vehicle-descriptor";

describe("vehicle descriptors", () => {
  it.each(Object.keys(VEHICLE_DESCRIPTORS))("provides consistent identity for %s", (type) => {
    expect(resolveVehicleIconKind(type)).toBe(getVehicleDescriptor(type).icon);
  });
  it("uses the SDK identity and a neutral fallback", () => {
    expect(resolveVehicleIconKind("coaxial")).toBe("multirotor");
    expect(resolveVehicleIconKind("vtol")).toBe("fixed_wing");
    expect(resolveVehicleIconKind("helicopter")).toBe("helicopter");
    expect(resolveVehicleIconKind("ground_rover")).toBe("rover");
    expect(resolveVehicleIconKind(undefined)).toBe("generic");
    expect(resolveVehicleIconKind("gcs")).toBe("generic");
    expect(getVehicleDescriptor("not_a_tricopter").family).toBe("unknown");
    expect(getVehicleDescriptor("toString").family).toBe("unknown");
  });
});

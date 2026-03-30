import { describe, it, expect } from "vitest";
import {
  deriveVtolProfile,
  isPlaneVehicleType,
  isCopterVehicleType,
  isRoverVehicleType,
  hasQuadPlaneParams,
  getVehicleSlug,
} from "./vehicle-helpers";
import type { VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamStore } from "../../../params";

function vs(vehicle_type: string): VehicleState {
  return {
    armed: false,
    custom_mode: 0,
    mode_name: "",
    system_status: "",
    vehicle_type,
    autopilot: "",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
  };
}

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function makeParams(
  params: Record<string, number> | null,
  staged: Record<string, number> = {},
): ParamInputParams {
  return {
    store: params ? makeStore(params) : null,
    staged: new Map(Object.entries(staged)),
    metadata: null,
    stage: () => {},
  };
}

describe("isPlaneVehicleType", () => {
  it("returns true for Fixed_Wing", () => {
    expect(isPlaneVehicleType(vs("Fixed_Wing"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPlaneVehicleType(vs("FIXED_WING"))).toBe(true);
    expect(isPlaneVehicleType(vs("fixed_wing"))).toBe(true);
  });

  it("returns false for copter types", () => {
    expect(isPlaneVehicleType(vs("Quadrotor"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlaneVehicleType(null)).toBe(false);
  });

  it("returns false for unknown vehicle type", () => {
    expect(isPlaneVehicleType(vs("submarine"))).toBe(false);
  });

  it("returns false for empty string vehicle type", () => {
    expect(isPlaneVehicleType(vs(""))).toBe(false);
  });
});

describe("isCopterVehicleType", () => {
  it.each([
    "Quadrotor",
    "Hexarotor",
    "Octorotor",
    "Tricopter",
    "Helicopter",
    "Coaxial",
  ])("returns true for %s", (type) => {
    expect(isCopterVehicleType(vs(type))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCopterVehicleType(vs("QUADROTOR"))).toBe(true);
    expect(isCopterVehicleType(vs("quadrotor"))).toBe(true);
  });

  it("matches partial strings (e.g. compound types)", () => {
    expect(isCopterVehicleType(vs("quadrotor_x"))).toBe(true);
  });

  it("returns false for plane", () => {
    expect(isCopterVehicleType(vs("Fixed_Wing"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCopterVehicleType(null)).toBe(false);
  });

  it("returns false for unknown vehicle type", () => {
    expect(isCopterVehicleType(vs("submarine"))).toBe(false);
  });

  it("returns false for empty string vehicle type", () => {
    expect(isCopterVehicleType(vs(""))).toBe(false);
  });
});

describe("isRoverVehicleType", () => {
  it.each(["Rover", "Ground_Rover", "Boat"])("returns true for %s", (type) => {
    expect(isRoverVehicleType(vs(type))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isRoverVehicleType(vs("ROVER"))).toBe(true);
  });

  it("returns false for plane", () => {
    expect(isRoverVehicleType(vs("Fixed_Wing"))).toBe(false);
  });

  it("returns false for copter", () => {
    expect(isRoverVehicleType(vs("Quadrotor"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRoverVehicleType(null)).toBe(false);
  });

  it("returns false for unknown vehicle type", () => {
    expect(isRoverVehicleType(vs("submarine"))).toBe(false);
  });
});

describe("hasQuadPlaneParams", () => {
  it("returns true when Q_FRAME_CLASS exists", () => {
    expect(hasQuadPlaneParams(makeParams({ Q_FRAME_CLASS: 1 }))).toBe(true);
  });

  it("returns true even when Q_FRAME_CLASS is 0", () => {
    expect(hasQuadPlaneParams(makeParams({ Q_FRAME_CLASS: 0 }))).toBe(true);
  });

  it("returns false when Q_FRAME_CLASS is absent", () => {
    expect(hasQuadPlaneParams(makeParams({ SOME_PARAM: 1 }))).toBe(false);
  });

  it("returns false when store is null", () => {
    expect(hasQuadPlaneParams(makeParams(null))).toBe(false);
  });
});

describe("deriveVtolProfile", () => {
  it("treats a plain plane with only Q_ENABLE as VTOL-capable but not yet enabled", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({ Q_ENABLE: 0 }),
    );

    expect(profile.supportsVtol).toBe(true);
    expect(profile.hasVtolToggle).toBe(true);
    expect(profile.quadPlaneEnabled).toBe(false);
    expect(profile.frameParamFamily).toBeNull();
    expect(profile.planeVtolState).toBe("plain-plane");
  });

  it("shows an enable-pending state when Q_ENABLE is staged before refresh", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({ Q_ENABLE: 0 }, { Q_ENABLE: 1 }),
    );

    expect(profile.quadPlaneEnabled).toBe(true);
    expect(profile.quadPlaneEnabledInStore).toBe(false);
    expect(profile.awaitingParamRefresh).toBe(true);
    expect(profile.planeVtolState).toBe("enable-pending");
    expect(profile.rebootRequiredBeforeTesting).toBe(true);
  });

  it("switches to QuadPlane frame ownership after refreshed Q_FRAME params appear", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
        Q_FRAME_TYPE: 1,
      }),
    );

    expect(profile.quadPlaneEnabled).toBe(true);
    expect(profile.frameParamFamily).toBe("quadplane");
    expect(profile.frameClassParam).toBe("Q_FRAME_CLASS");
    expect(profile.frameTypeParam).toBe("Q_FRAME_TYPE");
    expect(profile.planeVtolState).toBe("vtol-ready");
    expect(profile.subtype).toBe("standard");
  });

  it("keeps partial Q_FRAME availability explicit instead of pretending to be configured", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
      }),
    );

    expect(profile.hasPartialQuadPlaneParams).toBe(true);
    expect(profile.frameParamFamily).toBeNull();
    expect(profile.planeVtolState).toBe("partial-refresh");
  });

  it("detects tilt-rotor QuadPlane subtypes", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TILT_ENABLE: 1,
      }),
    );

    expect(profile.subtype).toBe("tiltrotor");
    expect(profile.tiltEnabled).toBe(true);
    expect(profile.tailsitterEnabled).toBe(false);
  });

  it("detects tailsitter QuadPlane subtypes", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TAILSIT_ENABLE: 1,
      }),
    );

    expect(profile.subtype).toBe("tailsitter");
    expect(profile.tailsitterEnabled).toBe(true);
    expect(profile.tiltEnabled).toBe(false);
  });

  it("flags unsupported compound VTOL subtype combinations", () => {
    const profile = deriveVtolProfile(
      vs("Fixed_Wing"),
      makeParams({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TILT_ENABLE: 1,
        Q_TAILSIT_ENABLE: 1,
      }),
    );

    expect(profile.subtype).toBe("compound");
    expect(profile.hasUnsupportedSubtype).toBe(true);
  });
});

describe("getVehicleSlug", () => {
  it("returns 'copter' for copter types", () => {
    expect(getVehicleSlug(vs("Quadrotor"))).toBe("copter");
    expect(getVehicleSlug(vs("Hexarotor"))).toBe("copter");
  });

  it("returns 'plane' for fixed-wing types", () => {
    expect(getVehicleSlug(vs("Fixed_Wing"))).toBe("plane");
  });

  it("returns 'rover' for rover types", () => {
    expect(getVehicleSlug(vs("Ground_Rover"))).toBe("rover");
  });

  it("returns null for null vehicleState", () => {
    expect(getVehicleSlug(null)).toBeNull();
  });

  it("returns null for unknown vehicle types", () => {
    expect(getVehicleSlug(vs("submarine"))).toBeNull();
    expect(getVehicleSlug(vs(""))).toBeNull();
  });
});

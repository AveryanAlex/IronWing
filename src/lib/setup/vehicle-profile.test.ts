import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import {
  deriveVehicleProfile,
  getVehicleSlug,
  isCopterVehicleType,
  isPlaneVehicleType,
  isRoverVehicleType,
} from "./vehicle-profile";
import { getApMotorDiagramModel } from "./vtol-layout-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function createProfileInput(
  entries: Record<string, number> | null,
  stagedEntries: Record<string, number> = {},
) {
  return {
    paramStore: entries ? createParamStore(entries) : null,
    stagedEdits: Object.fromEntries(
      Object.entries(stagedEntries).map(([name, nextValue]) => [name, { nextValue }]),
    ),
  };
}

describe("vehicle-profile", () => {
  it("recognizes plane, copter, and rover vehicle strings case-insensitively", () => {
    expect(isPlaneVehicleType("Fixed_Wing")).toBe(true);
    expect(isPlaneVehicleType("VTOL")).toBe(true);
    expect(isCopterVehicleType("quadrotor_x")).toBe(true);
    expect(isRoverVehicleType("GROUND_ROVER")).toBe(true);
  });

  it("treats a plain plane with only Q_ENABLE as VTOL-capable but not yet enabled", () => {
    const profile = deriveVehicleProfile("Fixed_Wing", createProfileInput({ Q_ENABLE: 0 }));

    expect(profile.supportsVtol).toBe(true);
    expect(profile.hasVtolToggle).toBe(true);
    expect(profile.quadPlaneEnabled).toBe(false);
    expect(profile.frameParamFamily).toBeNull();
    expect(profile.planeVtolState).toBe("plain-plane");
  });

  it("keeps staged VTOL enable explicit until the reboot and refresh happen", () => {
    const profile = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({ Q_ENABLE: 0 }, { Q_ENABLE: 1 }),
    );

    expect(profile.quadPlaneEnabled).toBe(true);
    expect(profile.quadPlaneEnabledInStore).toBe(false);
    expect(profile.awaitingParamRefresh).toBe(true);
    expect(profile.planeVtolState).toBe("enable-pending");
    expect(profile.rebootRequiredBeforeTesting).toBe(true);
  });

  it("surfaces an awaiting-refresh state when VTOL is enabled but Q-frame params have not arrived", () => {
    const profile = deriveVehicleProfile("Fixed_Wing", createProfileInput({ Q_ENABLE: 1 }));

    expect(profile.quadPlaneEnabled).toBe(true);
    expect(profile.hasCompleteQuadPlaneParams).toBe(false);
    expect(profile.planeVtolState).toBe("awaiting-refresh");
  });

  it("keeps incomplete Q-frame availability explicit", () => {
    const profile = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
      }),
    );

    expect(profile.hasPartialQuadPlaneParams).toBe(true);
    expect(profile.frameParamFamily).toBeNull();
    expect(profile.planeVtolState).toBe("partial-refresh");
  });

  it("switches Plane frame settings to Q_FRAME_* after refresh", () => {
    const profile = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
        Q_FRAME_TYPE: 1,
      }),
    );

    expect(profile.frameParamFamily).toBe("quadplane");
    expect(profile.frameClassParam).toBe("Q_FRAME_CLASS");
    expect(profile.frameTypeParam).toBe("Q_FRAME_TYPE");
    expect(profile.planeVtolState).toBe("vtol-ready");
    expect(profile.subtype).toBe("standard");
  });

  it("detects tilt-rotor and tailsitter QuadPlane subtypes", () => {
    const tiltrotor = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TILT_ENABLE: 1,
      }),
    );
    const tailsitter = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TAILSIT_ENABLE: 1,
      }),
    );

    expect(tiltrotor.subtype).toBe("tiltrotor");
    expect(tiltrotor.tiltEnabled).toBe(true);
    expect(tiltrotor.tailsitterEnabled).toBe(false);
    expect(tailsitter.subtype).toBe("tailsitter");
    expect(tailsitter.tailsitterEnabled).toBe(true);
    expect(tailsitter.tiltEnabled).toBe(false);
  });

  it("flags unsupported compound VTOL combinations when both tilt and tailsitter flags are enabled", () => {
    const profile = deriveVehicleProfile(
      "Fixed_Wing",
      createProfileInput({
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

  it("returns a plane docs slug only for recognized Plane families", () => {
    expect(getVehicleSlug("Fixed_Wing")).toBe("plane");
    expect(getVehicleSlug("quadrotor")).toBe("copter");
    expect(getVehicleSlug("Ground_Rover")).toBe("rover");
    expect(getVehicleSlug("submarine")).toBeNull();
    expect(getVehicleSlug(null)).toBeNull();
  });
});

describe("vtol-layout-model", () => {
  it("wraps AP_Motors layouts as supported diagram models", () => {
    const model = getApMotorDiagramModel(1, 1);

    expect(model).not.toBeNull();
    expect(model?.source).toBe("ap-motors");
    expect(model?.status).toBe("supported");
    expect(model?.motors).toHaveLength(4);
  });

  it("does not present Tri Motor7 yaw actuation as a propeller", () => {
    expect(getApMotorDiagramModel(7, 0)?.motors.map((motor) => motor.motorNumber)).toEqual([1, 2, 4]);
  });
});

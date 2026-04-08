import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import {
  deriveVehicleProfile,
  getVehicleSlug,
  isCopterVehicleType,
  isPlaneVehicleType,
  isRoverVehicleType,
  type VehicleProfile,
} from "./vehicle-profile";
import { getApMotorDiagramModel, getVtolLayoutModel } from "./vtol-layout-model";

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

function createResolvedQuadPlaneProfile(overrides: Partial<VehicleProfile> = {}): VehicleProfile {
  return {
    vehicleFamily: "plane",
    isPlane: true,
    isCopter: false,
    isRover: false,
    supportsVtol: true,
    hasVtolToggle: true,
    quadPlaneEnabled: true,
    quadPlaneEnabledInStore: true,
    hasAnyQuadPlaneParams: true,
    hasCompleteQuadPlaneParams: true,
    hasPartialQuadPlaneParams: false,
    awaitingParamRefresh: false,
    frameParamFamily: "quadplane",
    frameClassParam: "Q_FRAME_CLASS",
    frameTypeParam: "Q_FRAME_TYPE",
    frameClassValue: 1,
    frameTypeValue: 1,
    tiltEnabled: false,
    tailsitterEnabled: false,
    subtype: "standard",
    hasUnsupportedSubtype: false,
    planeVtolState: "vtol-ready",
    stagedEnableChange: false,
    stagedFrameClassChange: false,
    stagedFrameTypeChange: false,
    rebootRequiredBeforeTesting: false,
    ...overrides,
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

  it("keeps partial Q-frame availability explicit instead of guessing ownership", () => {
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

  it("switches Plane frame ownership to Q_FRAME_* after refresh", () => {
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

  it("reuses AP_Motors data for a refreshed standard QuadPlane layout", () => {
    const model = getVtolLayoutModel(createResolvedQuadPlaneProfile());

    expect(model).not.toBeNull();
    expect(model?.source).toBe("ap-motors");
    expect(model?.overlay).toBe("none");
    expect(model?.status).toBe("supported");
  });

  it("adds a tilt-rotor overlay when an AP_Motors layout exists", () => {
    const model = getVtolLayoutModel(
      createResolvedQuadPlaneProfile({
        tiltEnabled: true,
        subtype: "tiltrotor",
      }),
    );

    expect(model?.overlay).toBe("tiltrotor");
    expect(model?.motors.some((motor) => motor.role === "tilt")).toBe(true);
    expect(model?.hasMotorTestSurface).toBe(true);
  });

  it("keeps custom tailsitter layouts preview-only while preserving motor-test truth", () => {
    const model = getVtolLayoutModel(
      createResolvedQuadPlaneProfile({
        frameClassValue: 10,
        frameTypeValue: 0,
        tailsitterEnabled: true,
        subtype: "tailsitter",
      }),
    );

    expect(model?.source).toBe("custom");
    expect(model?.status).toBe("preview-only");
    expect(model?.overlay).toBe("tailsitter");
    expect(model?.hasLiftMotorSurface).toBe(false);
    expect(model?.hasMotorTestSurface).toBe(true);
  });

  it("fails closed for unsupported standard QuadPlane layouts", () => {
    const model = getVtolLayoutModel(
      createResolvedQuadPlaneProfile({
        frameClassValue: 10,
        frameTypeValue: 0,
      }),
    );

    expect(model?.status).toBe("unsupported");
    expect(model?.hasLiftMotorSurface).toBe(false);
    expect(model?.hasMotorTestSurface).toBe(false);
    expect(model?.message).toMatch(/outside the known lift-motor layouts/i);
  });
});

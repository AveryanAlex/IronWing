import { describe, expect, it } from "vitest";
import { getApMotorDiagramModel, getVtolLayoutModel } from "./vtol-layouts";
import type { VtolProfile } from "./vehicle-helpers";

function makeProfile(
  overrides: Partial<VtolProfile>,
): VtolProfile {
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

describe("getApMotorDiagramModel", () => {
  it("wraps AP_Motors layouts as supported diagram models", () => {
    const model = getApMotorDiagramModel(1, 1);

    expect(model).not.toBeNull();
    expect(model?.source).toBe("ap-motors");
    expect(model?.status).toBe("supported");
    expect(model?.motors).toHaveLength(4);
    expect(model?.hasLiftMotorSurface).toBe(true);
    expect(model?.hasMotorTestSurface).toBe(true);
  });
});

describe("getVtolLayoutModel", () => {
  it("reuses AP_Motors data for standard QuadPlane layouts", () => {
    const model = getVtolLayoutModel(makeProfile({ frameClassValue: 1, frameTypeValue: 1 }));

    expect(model).not.toBeNull();
    expect(model?.source).toBe("ap-motors");
    expect(model?.overlay).toBe("none");
    expect(model?.status).toBe("supported");
  });

  it("adds a tilt-rotor overlay when an AP_Motors layout exists", () => {
    const model = getVtolLayoutModel(
      makeProfile({
        frameClassValue: 1,
        frameTypeValue: 1,
        tiltEnabled: true,
        subtype: "tiltrotor",
      }),
    );

    expect(model?.source).toBe("ap-motors");
    expect(model?.overlay).toBe("tiltrotor");
    expect(model?.hasMotorTestSurface).toBe(true);
    expect(model?.motors.some((motor) => motor.role === "tilt")).toBe(true);
  });

  it("returns a custom tilt-rotor model when VTOL layout data is missing", () => {
    const model = getVtolLayoutModel(
      makeProfile({
        frameClassValue: 10,
        frameTypeValue: 0,
        tiltEnabled: true,
        subtype: "tiltrotor",
      }),
    );

    expect(model?.source).toBe("custom");
    expect(model?.status).toBe("supported");
    expect(model?.overlay).toBe("tiltrotor");
    expect(model?.hasLiftMotorSurface).toBe(true);
    expect(model?.hasMotorTestSurface).toBe(true);
    expect(model?.message).toMatch(/custom tilt-rotor preview/i);
  });

  it("keeps custom tailsitter layouts preview-only while still exposing motor-test surface metadata", () => {
    const model = getVtolLayoutModel(
      makeProfile({
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
    expect(model?.motors).toHaveLength(2);
  });

  it("fails loudly for unsupported QuadPlane layouts", () => {
    const model = getVtolLayoutModel(
      makeProfile({
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

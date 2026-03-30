import { describe, expect, it } from "vitest";
import { getApMotorDiagramModel, getVtolLayoutModel } from "../shared/vtol-layouts";
import type { VtolProfile } from "../shared/vehicle-helpers";
import { deriveMotorDirection, deriveMotorTestRows } from "./motor-test-helpers";

function makeProfile(overrides: Partial<VtolProfile>): VtolProfile {
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

describe("deriveMotorDirection", () => {
  it("maps positive yaw to cw, negative yaw to ccw, and zero to unknown", () => {
    expect(deriveMotorDirection(1)).toBe("cw");
    expect(deriveMotorDirection(-1)).toBe("ccw");
    expect(deriveMotorDirection(0)).toBe("unknown");
  });
});

describe("deriveMotorTestRows", () => {
  it("sorts Quad X rows by ArduPilot motor test order", () => {
    const model = getApMotorDiagramModel(1, 1);

    expect(model).not.toBeNull();

    const rows = deriveMotorTestRows(model);

    expect(rows.map((row) => row.testOrder)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.motorNumber)).toEqual([1, 4, 2, 3]);
    expect(rows.map((row) => row.expectedDirection)).toEqual(["ccw", "cw", "ccw", "cw"]);
    expect(rows.every((row) => row.roleLabel === "Motor")).toBe(true);
  });

  it("marks custom tailsitter motors with zero yaw as unknown direction", () => {
    const model = getVtolLayoutModel(
      makeProfile({
        frameClassValue: 10,
        frameTypeValue: 0,
        tailsitterEnabled: true,
        subtype: "tailsitter",
      }),
    );

    expect(model).not.toBeNull();

    const rows = deriveMotorTestRows(model);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.expectedDirection)).toEqual(["unknown", "unknown"]);
    expect(rows.map((row) => row.roleLabel)).toEqual(["Propulsion motor", "Propulsion motor"]);
  });

  it("returns an empty array when the model has no motors", () => {
    expect(
      deriveMotorTestRows({
        status: "supported",
        source: "custom",
        className: "CUSTOM",
        typeName: "Empty",
        overlay: "none",
        motors: [],
        hasLiftMotorSurface: false,
        hasMotorTestSurface: false,
        message: null,
      }),
    ).toEqual([]);
  });
});

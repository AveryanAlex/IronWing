import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { getVtolTopologyDiagramModel } from "./vtol-layout-model";
import {
  architectureParameterValues,
  buildVtolTopologyModel,
  getVtolFrameLayoutOptions,
  toggleMotorMask,
} from "./vtol-topology-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }
  return { params, expected_count: index };
}

function build(entries: Record<string, number>, staged: Record<string, number> = {}) {
  return buildVtolTopologyModel({
    paramStore: createParamStore(entries),
    stagedEdits: Object.fromEntries(Object.entries(staged).map(([name, nextValue]) => [name, { nextValue }])),
  });
}

describe("VTOL frame choices", () => {
  it("does not expose meaningless X and Plus choices for Tri", () => {
    expect(getVtolFrameLayoutOptions(7).map((option) => option.label)).toEqual([
      "Standard Tri",
      "Pitch reversed",
    ]);
    expect(getVtolFrameLayoutOptions(7)[0]?.matches(1)).toBe(true);
    expect(getVtolFrameLayoutOptions(7)[1]?.matches(6)).toBe(true);
  });

  it("collapses duplicate Y6 types into the three meaningful layouts", () => {
    expect(getVtolFrameLayoutOptions(5).map((option) => option.label)).toEqual([
      "Y6A",
      "Y6B",
      "FireFly Y6",
    ]);
  });

  it("collapses equivalent Deca X values into one semantic layout", () => {
    const options = getVtolFrameLayoutOptions(14);
    expect(options.map((option) => option.label)).toEqual(["Plus", "X / Clockwise X"]);
    expect(options[1]?.matches(1)).toBe(true);
    expect(options[1]?.matches(14)).toBe(true);
  });
});

describe("VTOL topology", () => {
  it("separates Tri propulsion motors from its Motor7 yaw actuator", () => {
    const model = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 7,
      Q_FRAME_TYPE: 1,
      SERVO5_FUNCTION: 33,
      SERVO6_FUNCTION: 34,
      SERVO8_FUNCTION: 36,
      SERVO11_FUNCTION: 39,
    });

    expect(model.applied.propulsors.map((motor) => motor.motorNumber)).toEqual([1, 2, 4]);
    expect(model.applied.actuators).toEqual([
      expect.objectContaining({ id: "rear-yaw", functionValue: 39, kind: "yaw" }),
    ]);
  });

  it("uses the real tilt mask and changes only the proposed diagram", () => {
    const model = build(
      {
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 7,
        Q_FRAME_TYPE: 0,
        Q_TILT_ENABLE: 1,
        Q_TILT_TYPE: 0,
        Q_TILT_MASK: 0,
      },
      { Q_TILT_MASK: 3 },
    );

    expect(model.applied.propulsors.filter((motor) => motor.tilts)).toHaveLength(0);
    expect(model.proposed.propulsors.filter((motor) => motor.tilts).map((motor) => motor.motorNumber)).toEqual([1, 2]);
    expect(model.proposed.actuators.map((actuator) => actuator.functionValue)).toEqual([41, 39]);
    expect(getVtolTopologyDiagramModel(model.proposed)?.motors.filter((motor) => motor.role === "tilt").map((motor) => motor.motorNumber)).toEqual([1, 2]);
  });

  it("requires independent front tilt functions for vectored-yaw Tri", () => {
    const model = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 7,
      Q_FRAME_TYPE: 0,
      Q_TILT_ENABLE: 1,
      Q_TILT_TYPE: 2,
      Q_TILT_MASK: 3,
    });

    expect(model.applied.mechanism).toBe("vectored_yaw");
    expect(model.applied.actuators.map((actuator) => actuator.functionValue)).toEqual([75, 76]);
    expect(model.applied.actuators.some((actuator) => actuator.functionValue === 39)).toBe(false);
  });

  it("models bicopter as left/right throttle plus left/right tilt", () => {
    const model = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 10,
      Q_FRAME_TYPE: 0,
      Q_TILT_ENABLE: 1,
      Q_TILT_TYPE: 3,
    });

    expect(model.applied.architecture).toBe("bicopter");
    expect(model.applied.propulsors.map((motor) => motor.functionValue)).toEqual([73, 74]);
    expect(model.applied.actuators.map((actuator) => actuator.functionValue)).toEqual([75, 76]);
  });

  it("distinguishes single/dual, copter, and motor-only tailsitters", () => {
    const singleDual = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 10,
      Q_FRAME_TYPE: 0,
      Q_TAILSIT_ENABLE: 1,
      Q_TAILSIT_MOTMX: 0,
      SERVO3_FUNCTION: 70,
    });
    const copter = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 1,
      Q_FRAME_TYPE: 1,
      Q_TAILSIT_ENABLE: 1,
      Q_TAILSIT_MOTMX: 5,
    });
    const motorOnly = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 1,
      Q_FRAME_TYPE: 1,
      Q_TAILSIT_ENABLE: 2,
      Q_TAILSIT_MOTMX: 0,
    });

    expect(singleDual.applied.architecture).toBe("tailsitter_single_dual");
    expect(singleDual.applied.propulsors.map((motor) => motor.functionValue)).toEqual([70]);
    expect(copter.applied.architecture).toBe("tailsitter_copter");
    expect(copter.applied.propulsors.filter((motor) => motor.forwardActive).map((motor) => motor.motorNumber)).toEqual([1, 3]);
    expect(motorOnly.applied.architecture).toBe("tailsitter_motor_only");
    expect(motorOnly.applied.propulsors.every((motor) => motor.forwardActive)).toBe(true);
  });

  it("discovers vectored tailsitter outputs and rejects angle boost", () => {
    const model = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 10,
      Q_FRAME_TYPE: 0,
      Q_TAILSIT_ENABLE: 1,
      Q_TAILSIT_MOTMX: 0,
      Q_A_ANGLE_BOOST: 1,
      SERVO5_FUNCTION: 75,
      SERVO6_FUNCTION: 76,
      SERVO7_FUNCTION: 73,
      SERVO8_FUNCTION: 74,
    });

    expect(model.applied.mechanism).toBe("tailsitter_vectored");
    expect(model.applied.actuators.map((actuator) => actuator.functionValue)).toEqual([75, 76]);
    expect(model.applied.issues).toContainEqual(expect.objectContaining({
      id: "tailsitter-angle-boost",
      severity: "danger",
    }));
  });

  it("keeps scripted and conflicting matrices honest instead of inventing geometry", () => {
    expect(build({ Q_ENABLE: 1, Q_FRAME_CLASS: 15, Q_FRAME_TYPE: 0 }).applied).toMatchObject({
      architecture: "custom",
      supportedDiagram: false,
    });
    expect(build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 1,
      Q_FRAME_TYPE: 1,
      Q_TILT_ENABLE: 1,
      Q_TAILSIT_ENABLE: 1,
    }).applied).toMatchObject({
      architecture: "conflict",
      supportedDiagram: false,
    });
  });

  it("keeps applied Quad while previewing a staged Tri refresh boundary", () => {
    const model = build(
      { Q_ENABLE: 1, Q_FRAME_CLASS: 1, Q_FRAME_TYPE: 1 },
      { Q_FRAME_CLASS: 7 },
    );

    expect(model.applied.frameClassLabel).toBe("Quad");
    expect(model.proposed.frameClassLabel).toBe("Tri");
    expect(model.proposed.frameTypeLabel).toBe("Standard Tri");
    expect(model.requiresRefreshBeforeMapping).toBe(true);
  });

  it("provides complete semantic architecture edits", () => {
    expect(architectureParameterValues("bicopter")).toMatchObject({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 10,
      Q_TILT_ENABLE: 1,
      Q_TAILSIT_ENABLE: 0,
      Q_TILT_TYPE: 3,
    });
  });

  it("toggles a motor number as its bitmask bit", () => {
    expect(toggleMotorMask(0, 1)).toBe(1);
    expect(toggleMotorMask(1, 2)).toBe(3);
    expect(toggleMotorMask(3, 1)).toBe(2);
  });
});

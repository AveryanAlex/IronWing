import { FrameClass, FrameType } from "../airframe";
import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { getVtolTopologyDiagramModel } from "./vtol-layout-model";
import {
  architectureParameterValues,
  planVtolArchitectureChange,
  planVtolFrameClassChange,
  isVtolFrameClassAllowed,
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
    expect(getVtolFrameLayoutOptions(FrameClass.Tri).map((option) => option.label)).toEqual([
      "Standard Tri",
      "Pitch reversed",
    ]);
    expect(getVtolFrameLayoutOptions(FrameClass.Tri)[0]?.value).toBe(FrameType.TriStandard);
    expect(getVtolFrameLayoutOptions(FrameClass.Tri)[1]?.value).toBe(FrameType.TriPitchReversed);
  });

  it("collapses duplicate Y6 types into the three meaningful layouts", () => {
    expect(getVtolFrameLayoutOptions(FrameClass.Y6).map((option) => option.label)).toEqual([
      "Y6A",
      "Y6B",
      "FireFly Y6",
    ]);
  });

  it("collapses equivalent Deca X values into one semantic layout", () => {
    const options = getVtolFrameLayoutOptions(FrameClass.Deca);
    expect(options.map((option) => option.label)).toEqual(["Plus", "X / Clockwise X"]);
    expect(options[1]?.value).toBe(FrameType.X);
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
      expect.objectContaining({ id: "tri-yaw", functionValue: 39, kind: "yaw" }),
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
    expect(
      getVtolTopologyDiagramModel(model.proposed)
        ?.motors.filter((motor) => motor.role === "tilt")
        .map((motor) => motor.motorNumber),
    ).toEqual([1, 2]);
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
    expect(copter.applied.propulsors.filter((motor) => motor.forwardActive).map((motor) => motor.motorNumber)).toEqual([
      1, 3,
    ]);
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
    expect(model.applied.issues).toContainEqual(
      expect.objectContaining({
        id: "tailsitter-angle-boost",
        severity: "danger",
      }),
    );
  });

  it("keeps scripted and conflicting matrices honest instead of inventing geometry", () => {
    expect(build({ Q_ENABLE: 1, Q_FRAME_CLASS: 15, Q_FRAME_TYPE: 0 }).applied).toMatchObject({
      architecture: "custom",
      supportedDiagram: false,
    });
    expect(
      build({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 1,
        Q_FRAME_TYPE: 1,
        Q_TILT_ENABLE: 1,
        Q_TAILSIT_ENABLE: 1,
      }).applied,
    ).toMatchObject({
      architecture: "conflict",
      supportedDiagram: false,
    });
  });

  it("keeps applied Quad while previewing a staged Tri refresh boundary", () => {
    const model = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 1, Q_FRAME_TYPE: 1 }, { Q_FRAME_CLASS: 7 });

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

// Physical ownership must agree with motor diagrams, not mixer coefficient signs.
describe("tilt and yaw ownership", () => {
  function actuators(frameClass: number, frameType: number, tiltType: number, mask: number) {
    return build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: frameClass,
      Q_FRAME_TYPE: frameType,
      Q_TILT_ENABLE: 1,
      Q_TILT_TYPE: tiltType,
      Q_TILT_MASK: mask,
    }).applied.actuators.map((actuator) => [actuator.functionValue, actuator.controlsPropulsorIds] as const);
  }

  it("assigns vectored Tri left to M2 and right to M1", () => {
    expect(actuators(7, 0, 2, 3)).toEqual([
      [75, ["motor-2"]],
      [76, ["motor-1"]],
    ]);
  });

  it("assigns the four Quad X corners and preserves a centerline rear tilt", () => {
    expect(actuators(1, 1, 2, 15)).toEqual([
      [75, ["motor-3"]],
      [76, ["motor-1"]],
      [46, ["motor-2"]],
      [47, ["motor-4"]],
    ]);
    expect(actuators(7, 0, 2, 11)).toContainEqual([45, ["motor-4"]]);
    expect(actuators(1, 0, 2, 15)).toContainEqual([41, ["motor-3"]]);
    expect(actuators(1, 0, 2, 15)).toContainEqual([45, ["motor-4"]]);
  });

  it.each([0, 1])("uses collective 41 for all continuous/binary tilted motors (type %i)", (type) => {
    expect(actuators(1, 1, type, 15)).toEqual([[41, ["motor-1", "motor-2", "motor-3", "motor-4"]]]);
  });

  it("keeps explicit bicopter left/right positions and vector ownership", () => {
    expect(actuators(10, 0, 3, 0)).toEqual([
      [75, ["left-throttle"]],
      [76, ["right-throttle"]],
    ]);
    const propulsors = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 10, Q_FRAME_TYPE: 0, Q_TILT_ENABLE: 1, Q_TILT_TYPE: 3 })
      .applied.propulsors;
    expect(propulsors[0].position.right).toBeLessThan(0);
    expect(propulsors[1].position.right).toBeGreaterThan(0);
  });

  it("names the yaw servo after the actual arm in pitch-reversed Tri", () => {
    const snapshot = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 7, Q_FRAME_TYPE: 6 }).applied;
    expect(snapshot.actuators).toContainEqual(
      expect.objectContaining({ label: "Front yaw servo", functionValue: 39, controlsPropulsorIds: ["motor-4"] }),
    );
  });
});

describe("typed VTOL configuration", () => {
  it.each([4, -1, 1.5])("blocks motor testing for unrecognized tilt type %s", (code) => {
    const model = build({
      Q_ENABLE: 1,
      Q_FRAME_CLASS: 1,
      Q_FRAME_TYPE: 1,
      Q_TILT_ENABLE: 1,
      Q_TILT_TYPE: code,
      Q_TILT_MASK: 15,
    });
    expect(model.applied.mechanism).toBe("custom");
    expect(model.applied.supportedDiagram).toBe(false);
    expect(model.applied.actuators).toEqual([]);
    expect(model.applied.issues.some((issue) => issue.id === "unsupported-vtol-type")).toBe(true);
    expect(getVtolTopologyDiagramModel(model.applied)?.status).toBe("unsupported");
  });
  it("preserves unknown frame codes without inventing a script or motor map", () => {
    const snapshot = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 99, Q_FRAME_TYPE: 98 }).applied;
    expect(snapshot.frame).toBeNull();
    expect(snapshot.frameClassLabel).toBe("Class 99");
    expect(snapshot.frameTypeLabel).toBe("Type 98");
    expect(snapshot.frameTypeIgnored).toBe(false);
    expect(snapshot.frameParameters).toEqual({ frameClass: 99, frameType: 98 });
    expect(snapshot.propulsors).toEqual([]);
    expect(getVtolTopologyDiagramModel(snapshot)?.status).toBe("unsupported");
  });
  it("does not interpret a future tailsitter mode as today's single/dual architecture", () => {
    const snapshot = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 10, Q_FRAME_TYPE: 0, Q_TAILSIT_ENABLE: 3 }).applied;
    expect(snapshot.architecture).toBe("unsupported");
    expect(snapshot.supportedDiagram).toBe(false);
  });
  it("encodes architecture defaults in the model and uses logical motor masks", () => {
    const current = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 10, Q_FRAME_TYPE: 0 }).applied;
    expect(planVtolArchitectureChange("tailsitter_copter", current)).toMatchObject({
      Q_FRAME_CLASS: 1,
      Q_FRAME_TYPE: 1,
      Q_TAILSIT_MOTMX: 15,
    });
    const tri = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 7, Q_FRAME_TYPE: 1 }).applied;
    expect(planVtolArchitectureChange("tailsitter_copter", tri)).toMatchObject({ Q_TAILSIT_MOTMX: 0b1011 });
    expect(isVtolFrameClassAllowed(FrameClass.SingleDual, "bicopter")).toBe(true);
    expect(isVtolFrameClassAllowed(FrameClass.Quad, "bicopter")).toBe(false);
    expect(isVtolFrameClassAllowed(FrameClass.Deca, "tiltrotor")).toBe(false);
  });
});

it("keeps accepted raw aliases on class changes and stages a type only when necessary", () => {
  const quadX = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 1, Q_FRAME_TYPE: 1 }).applied;
  expect(planVtolFrameClassChange(FrameClass.Tri, quadX)).toEqual({ Q_FRAME_CLASS: 7 });
  const triXAlias = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 7, Q_FRAME_TYPE: 1 }).applied;
  expect(planVtolFrameClassChange(FrameClass.Quad, triXAlias)).toEqual({ Q_FRAME_CLASS: 1 });
  const y6B = build({ Q_ENABLE: 1, Q_FRAME_CLASS: 5, Q_FRAME_TYPE: 10 }).applied;
  expect(planVtolFrameClassChange(FrameClass.Quad, y6B)).toEqual({ Q_FRAME_CLASS: 1, Q_FRAME_TYPE: 0 });
});

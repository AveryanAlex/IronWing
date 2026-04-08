import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { deriveVehicleProfile } from "./vehicle-profile";
import { getApMotorDiagramModel, getVtolLayoutModel } from "./vtol-layout-model";
import {
  MOTOR_TEST_BRIDGE_LIMIT,
  buildMotorTestRows,
  resolveMotorOwner,
} from "./motor-test-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function createInput(entries: Record<string, number>, stagedEntries: Record<string, number> = {}) {
  return {
    paramStore: createParamStore(entries),
    stagedEdits: Object.fromEntries(
      Object.entries(stagedEntries).map(([name, nextValue]) => [name, { nextValue }]),
    ),
  };
}

describe("motor-test-model", () => {
  it("sorts Quad X rows by ArduPilot test order and resolves stable servo ownership", () => {
    const rows = buildMotorTestRows(
      getApMotorDiagramModel(1, 1),
      createInput({
        SERVO1_FUNCTION: 33,
        SERVO1_REVERSED: 0,
        SERVO2_FUNCTION: 34,
        SERVO2_REVERSED: 0,
        SERVO3_FUNCTION: 35,
        SERVO3_REVERSED: 0,
        SERVO4_FUNCTION: 36,
        SERVO4_REVERSED: 0,
      }),
    );

    expect(rows.map((row) => row.motorNumber)).toEqual([1, 4, 2, 3]);
    expect(rows.map((row) => row.testOrder)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.expectedDirection)).toEqual(["ccw", "cw", "ccw", "cw"]);
    expect(rows[0]).toMatchObject({
      ownerStatus: "resolved",
      servoIndex: 1,
      reversalParamName: "SERVO1_REVERSED",
      testStatus: "available",
      bridgeSupported: true,
    });
  });

  it("keeps preview-only tailsitter rows visible while blocking direction-dependent test actions", () => {
    const profile = deriveVehicleProfile(
      "Fixed_Wing",
      createInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TAILSIT_ENABLE: 1,
        SERVO1_FUNCTION: 33,
        SERVO1_REVERSED: 0,
        SERVO2_FUNCTION: 34,
        SERVO2_REVERSED: 0,
      }),
    );
    const rows = buildMotorTestRows(
      getVtolLayoutModel(profile),
      createInput({
        Q_ENABLE: 1,
        Q_FRAME_CLASS: 10,
        Q_FRAME_TYPE: 0,
        Q_TAILSIT_ENABLE: 1,
        SERVO1_FUNCTION: 33,
        SERVO1_REVERSED: 0,
        SERVO2_FUNCTION: 34,
        SERVO2_REVERSED: 0,
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.expectedDirection)).toEqual(["unknown", "unknown"]);
    expect(rows.every((row) => row.testStatus === "blocked-layout")).toBe(true);
    expect(rows.every((row) => row.testReason?.includes("preview") ?? false)).toBe(true);
  });

  it("marks rows above the motor_test bridge limit as visible but non-testable", () => {
    const servoEntries = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`SERVO${index + 1}_FUNCTION`, 33 + index]).flatMap(
        ([name, value], index) => [
          [name, value],
          [`SERVO${index + 1}_REVERSED`, 0],
        ],
      ),
    ) as Record<string, number>;
    const rows = buildMotorTestRows(
      getApMotorDiagramModel(12, 0),
      createInput(servoEntries),
    );

    expect(rows).toHaveLength(12);
    expect(rows[MOTOR_TEST_BRIDGE_LIMIT]).toMatchObject({
      motorNumber: 9,
      bridgeSupported: false,
      testStatus: "unsupported-bridge",
    });
    expect(rows[MOTOR_TEST_BRIDGE_LIMIT].testReason).toContain("1..=8");
  });

  it("fails owner resolution closed when a servo mapping is staged or the reverse row is missing", () => {
    expect(
      resolveMotorOwner(
        1,
        createInput(
          {
            SERVO1_FUNCTION: 33,
            SERVO1_REVERSED: 0,
          },
          {
            SERVO1_FUNCTION: 34,
          },
        ),
      ),
    ).toMatchObject({
      status: "ambiguous",
      servoIndex: 1,
      functionParamName: "SERVO1_FUNCTION",
    });

    expect(
      resolveMotorOwner(
        2,
        createInput({
          SERVO2_FUNCTION: 34,
        }),
      ),
    ).toMatchObject({
      status: "function-only",
      servoIndex: 2,
      functionParamName: "SERVO2_FUNCTION",
      reverseParamName: null,
    });

    expect(
      resolveMotorOwner(
        3,
        createInput({
          SERVO1_FUNCTION: 33,
          SERVO1_REVERSED: 0,
        }),
      ),
    ).toMatchObject({
      status: "unowned",
      servoIndex: null,
      reverseParamName: null,
    });
  });
});

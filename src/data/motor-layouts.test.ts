import { describe, it, expect } from "vitest";
import { getMotorLayout, getAllLayouts } from "./motor-layouts";
import { decodeArduPilotFrame } from "../lib/ardupilot/airframe";
import { projectMotorPositions } from "../lib/setup/motor-diagram-projection";

function layoutForCodes(frameClass: number, frameType: number) {
  return getMotorLayout(decodeArduPilotFrame(frameClass, frameType).frame);
}

// Independent positions and vertical layers from ArduPilot's published motor
// diagrams (copter/source/images/m_*.svg), viewed from above, nose up.
// R/L/C = right/left/center; F/B/C = front/back/center.
const officialPositions: Array<[number, number, Array<[number, string, string | null]>]> = [
  [
    1,
    0,
    [
      [1, "RC", null],
      [2, "LC", null],
      [3, "CF", null],
      [4, "CB", null],
    ],
  ],
  [
    1,
    1,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    2,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    3,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    4,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    5,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    6,
    [
      [1, "RC", null],
      [2, "LC", null],
      [3, "CF", null],
      [4, "CB", null],
    ],
  ],
  [
    1,
    12,
    [
      [1, "RB", null],
      [2, "RF", null],
      [3, "LB", null],
      [4, "LF", null],
    ],
  ],
  [
    1,
    13,
    [
      [1, "RF", null],
      [2, "LF", null],
      [3, "LB", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    14,
    [
      [1, "RF", null],
      [2, "RB", null],
      [3, "LB", null],
      [4, "LF", null],
    ],
  ],
  [
    1,
    16,
    [
      [1, "RC", null],
      [2, "LC", null],
      [3, "CF", null],
      [4, "CB", null],
    ],
  ],
  [
    1,
    17,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "LF", null],
      [4, "RB", null],
    ],
  ],
  [
    1,
    18,
    [
      [1, "RB", null],
      [2, "RF", null],
      [3, "LB", null],
      [4, "LF", null],
    ],
  ],
  [
    2,
    0,
    [
      [1, "CF", null],
      [2, "CB", null],
      [3, "LB", null],
      [4, "RF", null],
      [5, "LF", null],
      [6, "RB", null],
    ],
  ],
  [
    2,
    1,
    [
      [1, "RC", null],
      [2, "LC", null],
      [3, "LF", null],
      [4, "RB", null],
      [5, "RF", null],
      [6, "LB", null],
    ],
  ],
  [
    2,
    3,
    [
      [1, "RC", null],
      [2, "LC", null],
      [3, "LF", null],
      [4, "RB", null],
      [5, "RF", null],
      [6, "LB", null],
    ],
  ],
  [
    2,
    13,
    [
      [1, "RF", null],
      [2, "LF", null],
      [3, "LC", null],
      [4, "LB", null],
      [5, "RB", null],
      [6, "RC", null],
    ],
  ],
  [
    2,
    14,
    [
      [1, "RF", null],
      [2, "RC", null],
      [3, "RB", null],
      [4, "LB", null],
      [5, "LC", null],
      [6, "LF", null],
    ],
  ],
  [
    3,
    0,
    [
      [1, "CF", null],
      [2, "CB", null],
      [3, "RF", null],
      [4, "RB", null],
      [5, "LF", null],
      [6, "LB", null],
      [7, "LC", null],
      [8, "RC", null],
    ],
  ],
  [
    3,
    1,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "RF", null],
      [4, "RB", null],
      [5, "LF", null],
      [6, "LB", null],
      [7, "LF", null],
      [8, "RB", null],
    ],
  ],
  [
    3,
    2,
    [
      [1, "LF", null],
      [2, "RB", null],
      [3, "LB", null],
      [4, "RB", null],
      [5, "LF", null],
      [6, "RF", null],
      [7, "RF", null],
      [8, "LB", null],
    ],
  ],
  [
    3,
    3,
    [
      [1, "RF", null],
      [2, "LB", null],
      [3, "RF", null],
      [4, "RB", null],
      [5, "LF", null],
      [6, "LB", null],
      [7, "LF", null],
      [8, "RB", null],
    ],
  ],
  [
    3,
    13,
    [
      [1, "RF", null],
      [2, "LF", null],
      [3, "LF", null],
      [4, "LB", null],
      [5, "LB", null],
      [6, "RB", null],
      [7, "RB", null],
      [8, "RF", null],
    ],
  ],
  [
    3,
    14,
    [
      [1, "RF", null],
      [2, "RF", null],
      [3, "RB", null],
      [4, "RB", null],
      [5, "LB", null],
      [6, "LB", null],
      [7, "LF", null],
      [8, "LF", null],
    ],
  ],
  [
    3,
    15,
    [
      [1, "LB", null],
      [2, "RF", null],
      [3, "LB", null],
      [4, "LF", null],
      [5, "RB", null],
      [6, "RF", null],
      [7, "RB", null],
      [8, "LF", null],
    ],
  ],
  [
    4,
    0,
    [
      [5, "LC", "bottom"],
      [6, "CF", "bottom"],
      [7, "RC", "bottom"],
      [8, "CB", "bottom"],
      [1, "CF", "top"],
      [2, "LC", "top"],
      [3, "CB", "top"],
      [4, "RC", "top"],
    ],
  ],
  [
    4,
    1,
    [
      [5, "LF", "bottom"],
      [6, "RF", "bottom"],
      [7, "RB", "bottom"],
      [8, "LB", "bottom"],
      [1, "RF", "top"],
      [2, "LF", "top"],
      [3, "LB", "top"],
      [4, "RB", "top"],
    ],
  ],
  [
    4,
    2,
    [
      [5, "LF", "bottom"],
      [6, "RF", "bottom"],
      [7, "RB", "bottom"],
      [8, "LB", "bottom"],
      [1, "RF", "top"],
      [2, "LF", "top"],
      [3, "LB", "top"],
      [4, "RB", "top"],
    ],
  ],
  [
    4,
    3,
    [
      [5, "LF", "bottom"],
      [6, "RF", "bottom"],
      [7, "RB", "bottom"],
      [8, "LB", "bottom"],
      [1, "RF", "top"],
      [2, "LF", "top"],
      [3, "LB", "top"],
      [4, "RB", "top"],
    ],
  ],
  [
    4,
    12,
    [
      [5, "RB", "bottom"],
      [6, "RF", "bottom"],
      [7, "LB", "bottom"],
      [8, "LF", "bottom"],
      [1, "RB", "top"],
      [2, "RF", "top"],
      [3, "LB", "top"],
      [4, "LF", "top"],
    ],
  ],
  [
    4,
    14,
    [
      [2, "RF", "bottom"],
      [4, "RB", "bottom"],
      [6, "LB", "bottom"],
      [8, "LF", "bottom"],
      [1, "RF", "top"],
      [3, "RB", "top"],
      [5, "LB", "top"],
      [7, "LF", "top"],
    ],
  ],
  [
    4,
    18,
    [
      [5, "RB", "bottom"],
      [6, "RF", "bottom"],
      [7, "LB", "bottom"],
      [8, "LF", "bottom"],
      [1, "RB", "top"],
      [2, "RF", "top"],
      [3, "LB", "top"],
      [4, "LF", "top"],
    ],
  ],
  [
    5,
    0,
    [
      [1, "RF", "bottom"],
      [3, "LF", "bottom"],
      [4, "CB", "bottom"],
      [2, "LF", "top"],
      [5, "RF", "top"],
      [6, "CB", "top"],
    ],
  ],
  [
    5,
    10,
    [
      [2, "RF", "bottom"],
      [4, "CB", "bottom"],
      [6, "LF", "bottom"],
      [1, "RF", "top"],
      [3, "CB", "top"],
      [5, "LF", "top"],
    ],
  ],
  [
    5,
    11,
    [
      [4, "CB", "bottom"],
      [5, "RF", "bottom"],
      [6, "LF", "bottom"],
      [1, "CB", "top"],
      [2, "RF", "top"],
      [3, "LF", "top"],
    ],
  ],
  [
    7,
    0,
    [
      [1, "RF", null],
      [2, "LF", null],
      [4, "CB", null],
    ],
  ],
  [
    7,
    6,
    [
      [1, "RB", null],
      [2, "LB", null],
      [4, "CF", null],
    ],
  ],
  [
    12,
    0,
    [
      [2, "CF", "bottom"],
      [4, "RF", "bottom"],
      [6, "RB", "bottom"],
      [8, "CB", "bottom"],
      [10, "LB", "bottom"],
      [12, "LF", "bottom"],
      [1, "CF", "top"],
      [3, "RF", "top"],
      [5, "RB", "top"],
      [7, "CB", "top"],
      [9, "LB", "top"],
      [11, "LF", "top"],
    ],
  ],
  [
    12,
    1,
    [
      [2, "RF", "bottom"],
      [4, "RC", "bottom"],
      [6, "RB", "bottom"],
      [8, "LB", "bottom"],
      [10, "LC", "bottom"],
      [12, "LF", "bottom"],
      [1, "RF", "top"],
      [3, "RC", "top"],
      [5, "RB", "top"],
      [7, "LB", "top"],
      [9, "LC", "top"],
      [11, "LF", "top"],
    ],
  ],
  [
    14,
    0,
    [
      [1, "CF", null],
      [2, "RF", null],
      [3, "RF", null],
      [4, "RB", null],
      [5, "RB", null],
      [6, "CB", null],
      [7, "LB", null],
      [8, "LB", null],
      [9, "LF", null],
      [10, "LF", null],
    ],
  ],
  [
    14,
    1,
    [
      [1, "RF", null],
      [2, "RF", null],
      [3, "RC", null],
      [4, "RB", null],
      [5, "RB", null],
      [6, "LB", null],
      [7, "LB", null],
      [8, "LC", null],
      [9, "LF", null],
      [10, "LF", null],
    ],
  ],
];

describe("physical motor layouts", () => {
  it.each(
    officialPositions,
  )("matches official frame %i type %i positions and layers", (frameClass, frameType, expected) => {
    const layout = layoutForCodes(frameClass, frameType)!;
    expect(layout.motors).toHaveLength(expected.length);
    for (const [number, location, layer] of expected) {
      const motor = layout.motors.find((entry) => entry.motorNumber === number)!;
      const { right, forward } = motor.position;
      expect(`${right > 0 ? "R" : right < 0 ? "L" : "C"}${forward > 0 ? "F" : forward < 0 ? "B" : "C"}`).toBe(location);
      expect(motor.position.layer).toBe(layer);
    }
  });

  it("keeps motor test order and rotation independent from geometry", () => {
    const quad = layoutForCodes(1, 1)!.motors;
    expect(
      [...quad].sort((a, b) => a.testOrder - b.testOrder).map((motor) => [motor.motorNumber, motor.rotation]),
    ).toEqual([
      [1, "ccw"],
      [4, "cw"],
      [2, "ccw"],
      [3, "cw"],
    ]);
    expect(layoutForCodes(7, 0)!.motors.map((motor) => [motor.motorNumber, motor.testOrder])).toEqual([
      [1, 1],
      [2, 4],
      [4, 2],
    ]);
  });

  it("separates the tricopter yaw servo and honors its pitch-reversed variant", () => {
    expect(layoutForCodes(7, 0)?.motors.length).toBe(3);
    expect(layoutForCodes(7, 0)?.yawServo).toMatchObject({
      label: "Rear yaw servo",
      controlsMotorNumber: 4,
    });
    expect(layoutForCodes(7, 6)?.yawServo?.label).toBe("Front yaw servo");
    expect(layoutForCodes(7, 123)).toEqual(layoutForCodes(7, 0));
    expect(layoutForCodes(5, 123)).toEqual(layoutForCodes(5, 0));
    expect(layoutForCodes(999, 999)).toBeNull();
  });

  it("fits every catalog motor and separates their glyphs in both diagrams", () => {
    expect(getAllLayouts()).toHaveLength(41);
    for (const layout of getAllLayouts()) {
      for (const [width, height] of [
        [300, 300],
        [320, 300],
      ]) {
        const positions = projectMotorPositions(layout.motors, width, height);
        for (const [index, point] of positions.entries()) {
          expect(point.cx).toBeGreaterThanOrEqual(22);
          expect(point.cx).toBeLessThanOrEqual(width - 22);
          expect(point.cy).toBeGreaterThanOrEqual(35);
          expect(point.cy).toBeLessThanOrEqual(height - 22);
          for (const other of positions.slice(index + 1)) {
            expect(Math.hypot(point.cx - other.cx, point.cy - other.cy)).toBeGreaterThanOrEqual(34);
          }
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  attitudeQuaternion,
  multirotorLayout,
  resolveAttitudeModelKind,
  rotateVectorByQuaternion,
} from "./attitude-orientation";
import { cameraZoomForViewport } from "./attitude-three-scene";

function expectVector(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe("attitudeQuaternion", () => {
  it("keeps a level north-facing model in its identity basis", () => {
    const quaternion = attitudeQuaternion(0, 0, 0);

    expectVector(rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, quaternion), { x: 0, y: 0, z: -1 });
    expect(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w)).toBeCloseTo(1, 8);
  });

  it("maps positive MAVLink yaw clockwise from north toward east", () => {
    const forward = rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, attitudeQuaternion(0, 0, 90));

    expectVector(forward, { x: 1, y: 0, z: 0 });
  });

  it("maps positive pitch nose-up and positive roll right-side-down", () => {
    const pitchedForward = rotateVectorByQuaternion({ x: 0, y: 0, z: -1 }, attitudeQuaternion(0, 30, 0));
    const rolledRight = rotateVectorByQuaternion({ x: 1, y: 0, z: 0 }, attitudeQuaternion(30, 0, 0));

    expectVector(pitchedForward, { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 });
    expectVector(rolledRight, { x: Math.sqrt(3) / 2, y: -0.5, z: 0 });
  });

  it("normalizes wrapped angles and replaces unavailable axes with zero", () => {
    expect(attitudeQuaternion(360, null, Number.NaN)).toEqual(attitudeQuaternion(0, 0, 0));
    expect(attitudeQuaternion(-720, undefined, Number.POSITIVE_INFINITY)).toEqual(attitudeQuaternion(0, 0, 0));
  });
});

describe("cameraZoomForViewport", () => {
  it("fits the compass labels in square panels and caps wide-panel zoom", () => {
    expect(cameraZoomForViewport(260, 260)).toBeCloseTo(0.74);
    expect(cameraZoomForViewport(560, 238)).toBeCloseTo(1);
    expect(cameraZoomForViewport(960, 240)).toBeCloseTo(1);
  });
});

describe("resolveAttitudeModelKind", () => {
  it.each([
    ["fixed_wing", "fixed_wing"],
    ["Plane", "fixed_wing"],
    ["vtol", "vtol"],
    ["QuadPlane", "vtol"],
    ["quadrotor", "multirotor"],
    ["hexarotor", "multirotor"],
    ["octorotor", "multirotor"],
    ["tricopter", "multirotor"],
    ["coaxial", "multirotor"],
    ["helicopter", "helicopter"],
    ["ground_rover", "rover"],
    ["submarine", "submarine"],
    ["generic", "generic"],
    ["unknown", "generic"],
    [null, "generic"],
  ])("maps %s to %s", (vehicleType, expected) => {
    expect(resolveAttitudeModelKind(vehicleType)).toBe(expected);
  });

  it("preserves the available multirotor layouts", () => {
    expect(multirotorLayout("tricopter")).toBe("tri");
    expect(multirotorLayout("quadrotor")).toBe("quad");
    expect(multirotorLayout("hexarotor")).toBe("hex");
    expect(multirotorLayout("octorotor")).toBe("octo");
    expect(multirotorLayout("coaxial")).toBe("coaxial");
  });
});

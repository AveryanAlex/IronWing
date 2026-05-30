import { describe, expect, it } from "vitest";

import {
  degreesToRadians,
  radiansToDegrees,
  rcInputToRollPitchRad,
  resolveCopterTiltCapsDeg,
} from "./copter-angle-mode";

describe("Copter angle-mode tilt mapping", () => {
  it("maps axis stick input to the configured Euler tilt", () => {
    const target = rcInputToRollPitchRad({ roll: 1, pitch: 0 }, 30);

    expect(radiansToDegrees(target.rollRad)).toBeCloseTo(30);
    expect(target.pitchRad).toBeCloseTo(0);
  });

  it("clamps stick input before applying the tan-based mapping", () => {
    const clamped = rcInputToRollPitchRad({ roll: 1, pitch: -1 }, 30);
    const outsideRange = rcInputToRollPitchRad({ roll: 4, pitch: -3 }, 30);

    expect(outsideRange.rollRad).toBeCloseTo(clamped.rollRad);
    expect(outsideRange.pitchRad).toBeCloseTo(clamped.pitchRad);
    expect(outsideRange.thrust).toEqual(clamped.thrust);
  });

  it("caps diagonal thrust-vector length to the applicable angle limit", () => {
    const target = rcInputToRollPitchRad({ roll: 1, pitch: 1 }, 45, 20);

    expect(Math.hypot(target.thrust.x, target.thrust.y)).toBeCloseTo(Math.tan(degreesToRadians(20)));
    expect(target.thrustLimit).toBeCloseTo(Math.tan(degreesToRadians(20)));
  });
});

describe("Copter optional tilt cap resolution", () => {
  it("uses ATC_ANGLE_MAX when PSC_ANGLE_MAX is zero or absent", () => {
    expect(resolveCopterTiltCapsDeg({ atcAngleMaxDeg: 36, pscAngleMaxDeg: 0 }).assistedModeDeg).toBe(36);
    expect(resolveCopterTiltCapsDeg({ atcAngleMaxDeg: 36 }).pscUsesAtc).toBe(true);
  });

  it("uses two thirds of the assisted-mode cap when LOIT_ANG_MAX is zero", () => {
    const caps = resolveCopterTiltCapsDeg({
      atcAngleMaxDeg: 36,
      pscAngleMaxDeg: 30,
      loitAngleMaxDeg: 0,
    });

    expect(caps.assistedModeDeg).toBe(30);
    expect(caps.loiterPilotDeg).toBe(20);
    expect(caps.loiterUsesAutomatic).toBe(true);
  });

  it("never lets configured assisted-mode overrides widen their parent cap", () => {
    const caps = resolveCopterTiltCapsDeg({
      atcAngleMaxDeg: 30,
      pscAngleMaxDeg: 45,
      loitAngleMaxDeg: 40,
    });

    expect(caps.assistedModeDeg).toBe(30);
    expect(caps.loiterPilotDeg).toBe(30);
  });
});

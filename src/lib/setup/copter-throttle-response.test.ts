import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import {
  copterThrottleControlMidpoint,
  copterThrottleToClimbRateMps,
  pwmToCopterThrottleControl,
  resolveCopterThrottleMarker,
} from "./copter-throttle-response";

function response(throttleControl: number, overrides: Partial<Parameters<typeof copterThrottleToClimbRateMps>[0]> = {}) {
  return copterThrottleToClimbRateMps({
    throttleControl,
    throttleMid: 500,
    throttleDeadZone: 100,
    pilotSpeedUpMps: 3,
    pilotSpeedDownMps: 2,
    ...overrides,
  });
}

function item(name: string, value: number): ParameterItemModel {
  return {
    name,
    rawName: name,
    label: name,
    description: null,
    value,
    valueText: String(value),
    valueLabel: null,
    units: null,
    rebootRequired: false,
    order: 0,
    increment: null,
    range: null,
    readOnly: false,
  };
}

function index(values: Record<string, number>): Map<string, ParameterItemModel> {
  return new Map(Object.entries(values).map(([name, value]) => [name, item(name, value)]));
}

describe("copterThrottleToClimbRateMps", () => {
  it("returns zero throughout the throttle deadband", () => {
    expect(response(400)).toBe(0);
    expect(response(500)).toBe(0);
    expect(response(600)).toBe(0);
  });

  it("linearly reaches asymmetric descent and climb limits", () => {
    expect(response(0)).toBeCloseTo(-2);
    expect(response(200)).toBeCloseTo(-1);
    expect(response(800)).toBeCloseTo(1.5);
    expect(response(1000)).toBeCloseTo(3);
  });

  it("clamps throttle input and THR_DZ like ArduCopter", () => {
    expect(response(-100)).toBeCloseTo(-2);
    expect(response(1100)).toBeCloseTo(3);
    expect(response(100, { throttleDeadZone: 999 })).toBe(0);
    expect(response(900, { throttleDeadZone: 999 })).toBe(0);
  });

  it("uses climb speed for descent when PILOT_SPD_DN is zero", () => {
    expect(response(0, { pilotSpeedDownMps: 0 })).toBeCloseTo(-3);
  });
});

describe("Copter throttle PWM range normalization", () => {
  const calibration = { min: 1000, max: 2000, deadZone: 30 };

  it("matches pwm_to_range deadzone and range semantics", () => {
    expect(pwmToCopterThrottleControl(1000, calibration)).toBe(0);
    expect(pwmToCopterThrottleControl(1030, calibration)).toBe(0);
    expect(pwmToCopterThrottleControl(1515, calibration)).toBeCloseTo(500);
    expect(pwmToCopterThrottleControl(2000, calibration)).toBeCloseTo(1000);
    expect(copterThrottleControlMidpoint(calibration)).toBe(484);
  });

  it("reverses PWM before mapping it into the throttle control range", () => {
    expect(pwmToCopterThrottleControl(1000, { ...calibration, reversed: true })).toBeCloseTo(1000);
    expect(pwmToCopterThrottleControl(2000, { ...calibration, reversed: true })).toBe(0);
  });

  it("resolves mapped live throttle PWM and staged calibration values", () => {
    const itemIndex = index({
      RCMAP_THROTTLE: 3,
      RC3_MIN: 1000,
      RC3_MAX: 2000,
      RC3_DZ: 30,
      RC3_REVERSED: 0,
    });
    const stagedValues: Record<string, number> = { RCMAP_THROTTLE: 2, RC2_REVERSED: 1 };
    const marker = resolveCopterThrottleMarker({
      channels: [{ channel: 2, pwm: 1000 }],
      itemIndex,
      resolveValue: (name) => stagedValues[name] ?? itemIndex.get(name)?.value ?? null,
    });

    expect(marker).toMatchObject({ channel: 2, pwm: 1000, stale: false, throttleMid: 480 });
    expect(marker?.throttleControl).toBeCloseTo(1000);
  });
});

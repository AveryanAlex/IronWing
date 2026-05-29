import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../params/parameter-item-model";
import { discoverRateCurveModels } from "./rate-curve-adapters";
import { ardupilotInputExpo, cubicExpo, formatRateValue, interpolateRateCurve, sampleRateCurve } from "./rate-curves";

function item(name: string, value: number, range: { min: number; max: number } | null = null, increment: number | null = null): ParameterItemModel {
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
    increment,
    range,
    readOnly: false,
  };
}

function index(values: Record<string, number>): Map<string, ParameterItemModel> {
  return new Map(Object.entries(values).map(([name, value]) => [name, item(name, value)]));
}

describe("rate curve helpers", () => {
  it("implements ArduPilot rational expo with full-stick preserved", () => {
    expect(ardupilotInputExpo(0, 0.3)).toBeCloseTo(0);
    expect(ardupilotInputExpo(1, 0.3)).toBeCloseTo(1);
    expect(ardupilotInputExpo(-1, 0.3)).toBeCloseTo(-1);
    expect(Math.abs(ardupilotInputExpo(0.25, 0.5))).toBeLessThan(0.25);
  });

  it("implements cubic expo used by Plane and Sub previews", () => {
    expect(cubicExpo(0.5, 0)).toBeCloseTo(0.5);
    expect(cubicExpo(0.5, 1)).toBeCloseTo(0.125);
    expect(cubicExpo(1, 0.8)).toBeCloseTo(1);
  });

  it("interpolates sampled curves for live marker placement", () => {
    const points = sampleRateCurve((stick) => stick * 100, 5);
    expect(interpolateRateCurve(points, 0.25)).toBeCloseTo(25);
  });

  it("preserves fractional degree-per-second labels", () => {
    expect(formatRateValue(202.5)).toBe("202.5 deg/s");
    expect(formatRateValue(151.875)).toBe("151.88 deg/s");
  });
});

describe("rate curve adapters", () => {
  it("detects Copter Acro and links roll/pitch", () => {
    const models = discoverRateCurveModels({
      itemIndex: index({
        ACRO_RP_RATE: 360,
        ACRO_RP_EXPO: 0.3,
        ACRO_Y_RATE: 202.5,
        ACRO_Y_EXPO: 0,
      }),
      getDraftValue: (_name, nextItem) => nextItem.value,
    });

    expect(models.map((model) => model.id)).toContain("copter-acro");
    const copter = models.find((model) => model.id === "copter-acro");
    expect(copter?.axes.map((axis) => axis.id)).toEqual(["roll-pitch", "yaw"]);
    const copterRollPitchPoints = copter?.axes[0].draftPoints ?? [];
    const yawRateControl = copter?.axes[1].controls.find((control) => control.name === "ACRO_Y_RATE");
    expect(copterRollPitchPoints[copterRollPitchPoints.length - 1]?.rateDegS).toBeCloseTo(360);
    expect(yawRateControl?.draftValue).toBe(202.5);
    expect(yawRateControl?.step).toBe(0.1);
  });

  it("detects Plane and QuadPlane models independently", () => {
    const models = discoverRateCurveModels({
      itemIndex: index({
        ACRO_ROLL_RATE: 180,
        ACRO_PITCH_RATE: 160,
        ACRO_YAW_RATE: 90,
        MAN_EXPO_ROLL: 40,
        MAN_EXPO_PITCH: 35,
        MAN_EXPO_RUDDER: 20,
        Q_ACRO_RLL_RATE: 360,
        Q_ACRO_PIT_RATE: 180,
        Q_ACRO_YAW_RATE: 90,
      }),
      getDraftValue: (_name, nextItem) => nextItem.value,
    });

    expect(models.map((model) => model.id)).toEqual(["plane-acro", "quadplane-qacro"]);
    const qacroRollPoints = models[1].axes[0].draftPoints;
    expect(qacroRollPoints[qacroRollPoints.length - 1]?.rateDegS).toBeCloseTo(360);
  });

  it("shows Sub gain-derived full-stick rates", () => {
    const models = discoverRateCurveModels({
      itemIndex: index({
        ACRO_RP_P: 4.5,
        ACRO_YAW_P: 3.375,
        ACRO_EXPO: 0.3,
      }),
      getDraftValue: (_name, nextItem) => nextItem.value,
    });

    const sub = models.find((model) => model.id === "sub-acro");
    const subRollPitchPoints = sub?.axes[0].draftPoints ?? [];
    const subYawPoints = sub?.axes[1].draftPoints ?? [];
    expect(subRollPitchPoints[subRollPitchPoints.length - 1]?.rateDegS).toBeCloseTo(202.5);
    expect(subYawPoints[subYawPoints.length - 1]?.rateDegS).toBeCloseTo(151.875);
    expect(sub?.axes[1].controls[0].draftValue).toBe(3.375);
  });
});

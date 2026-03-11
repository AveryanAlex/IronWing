import { describe, it, expect } from "vitest";
import {
  BOARD_PRESETS,
  SENSOR_PRESETS,
  BATTERY_CHEMISTRIES,
  calcBattArmVolt,
  calcBattLowVolt,
  calcBattCrtVolt,
  calcBattVoltMax,
  calcBattVoltMin,
  calcMotThrustExpo,
  calcGyroFilter,
  INS_ACCEL_FILTER,
  calcRateFilterD,
  calcAccelYMax,
  calcAccelPRMax,
  calcAcroYawP,
  MOT_THST_HOVER,
  ATC_THR_MIX_MAN,
  ATC_RAT_PIT_FLTE,
  ATC_RAT_RLL_FLTE,
  ATC_RAT_YAW_FLTD,
  ATC_RAT_YAW_FLTE,
} from "./battery-presets";

describe("BOARD_PRESETS", () => {
  it("has at least 3 entries", () => {
    expect(BOARD_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("each entry has non-empty label and valid pins", () => {
    for (const b of BOARD_PRESETS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.voltPin).toBeGreaterThanOrEqual(-1);
      expect(b.currPin).toBeGreaterThanOrEqual(-1);
    }
  });

  it("includes Pixhawk / Cube with voltPin=2, currPin=3", () => {
    const pix = BOARD_PRESETS.find((b) => b.label.includes("Pixhawk / Cube"));
    expect(pix).toBeDefined();
    expect(pix!.voltPin).toBe(2);
    expect(pix!.currPin).toBe(3);
  });

  it("includes Pixhawk 6X / 6C with voltPin=8, currPin=4", () => {
    const p6 = BOARD_PRESETS.find((b) => b.label.includes("6"));
    expect(p6).toBeDefined();
    expect(p6!.voltPin).toBe(8);
    expect(p6!.currPin).toBe(4);
  });
});

describe("SENSOR_PRESETS", () => {
  it("includes a 3DR Power Module entry", () => {
    const pwr = SENSOR_PRESETS.find((s) => s.label.includes("3DR"));
    expect(pwr).toBeDefined();
  });

  it("includes AttoPilot 45A, 90A, 180A", () => {
    const a45 = SENSOR_PRESETS.find((s) => s.label === "AttoPilot 45A");
    const a90 = SENSOR_PRESETS.find((s) => s.label === "AttoPilot 90A");
    const a180 = SENSOR_PRESETS.find((s) => s.label === "AttoPilot 180A");
    expect(a45).toBeDefined();
    expect(a90).toBeDefined();
    expect(a180).toBeDefined();
  });

  it("each entry has non-empty label, positive voltMult and ampPerVolt", () => {
    for (const s of SENSOR_PRESETS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.voltMult).toBeGreaterThan(0);
      expect(s.ampPerVolt).toBeGreaterThan(0);
    }
  });
});

describe("BATTERY_CHEMISTRIES", () => {
  it("includes LiPo with cellVoltMax=4.2, cellVoltMin=3.3", () => {
    const lipo = BATTERY_CHEMISTRIES.find((c) => c.label === "LiPo");
    expect(lipo).toBeDefined();
    expect(lipo!.cellVoltMax).toBe(4.2);
    expect(lipo!.cellVoltMin).toBe(3.3);
  });

  it("includes LiIon with cellVoltMax=4.1, cellVoltMin=2.8", () => {
    const liion = BATTERY_CHEMISTRIES.find((c) => c.label === "LiIon");
    expect(liion).toBeDefined();
    expect(liion!.cellVoltMax).toBe(4.1);
    expect(liion!.cellVoltMin).toBe(2.8);
  });

  it("all chemistries satisfy cellVoltMax > cellVoltMin", () => {
    for (const c of BATTERY_CHEMISTRIES) {
      expect(c.cellVoltMax).toBeGreaterThan(c.cellVoltMin);
    }
  });
});

describe("battery voltage formulas (4S LiPo: cellMax=4.2, cellMin=3.3)", () => {
  const cells = 4;
  const cellMin = 3.3;
  const cellMax = 4.2;

  it("calcBattArmVolt(4, 3.3) ≈ 14.7", () => {
    expect(calcBattArmVolt(cells, cellMin)).toBeCloseTo(14.7, 1);
  });

  it("calcBattLowVolt(4, 3.3) ≈ 14.4", () => {
    expect(calcBattLowVolt(cells, cellMin)).toBeCloseTo(14.4, 1);
  });

  it("calcBattCrtVolt(4, 3.3) ≈ 14.0", () => {
    expect(calcBattCrtVolt(cells, cellMin)).toBeCloseTo(14.0, 1);
  });

  it("calcBattVoltMax(4, 4.2) = 16.8", () => {
    expect(calcBattVoltMax(cells, cellMax)).toBe(16.8);
  });

  it("calcBattVoltMin(4, 3.3) = 13.2", () => {
    expect(calcBattVoltMin(cells, cellMin)).toBe(13.2);
  });
});

describe("initial parameter calculator formulas", () => {
  it("calcMotThrustExpo(9) ≈ 0.58", () => {
    expect(calcMotThrustExpo(9)).toBeCloseTo(0.58, 2);
  });

  it("calcMotThrustExpo(5) > 0 and < 0.58", () => {
    const val = calcMotThrustExpo(5);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThan(0.58);
  });

  it("calcMotThrustExpo(20) ≈ 0.71", () => {
    expect(calcMotThrustExpo(20)).toBeCloseTo(0.71, 2);
  });

  it("calcMotThrustExpo caps at 0.80", () => {
    expect(calcMotThrustExpo(100)).toBeLessThanOrEqual(0.8);
  });

  it("calcGyroFilter(9) = 46", () => {
    expect(calcGyroFilter(9)).toBe(46);
  });

  it("calcGyroFilter(5) > 46 (smaller prop = higher filter)", () => {
    expect(calcGyroFilter(5)).toBeGreaterThan(46);
  });

  it("calcGyroFilter(20) ≥ 20 (floor at 20)", () => {
    expect(calcGyroFilter(20)).toBeGreaterThanOrEqual(20);
  });

  it("INS_ACCEL_FILTER is fixed at 10", () => {
    expect(INS_ACCEL_FILTER).toBe(10);
  });

  it("calcRateFilterD = max(10, gyroFilter/2)", () => {
    expect(calcRateFilterD(46)).toBe(23);
    expect(calcRateFilterD(18)).toBe(10);
  });

  it("fixed filter constants match MissionPlanner", () => {
    expect(ATC_RAT_PIT_FLTE).toBe(0);
    expect(ATC_RAT_RLL_FLTE).toBe(0);
    expect(ATC_RAT_YAW_FLTD).toBe(0);
    expect(ATC_RAT_YAW_FLTE).toBe(2);
    expect(MOT_THST_HOVER).toBe(0.2);
    expect(ATC_THR_MIX_MAN).toBe(0.1);
  });

  it("calcAccelYMax(9) = max(8000, roundTo(-900*9+36000, -2))", () => {
    expect(calcAccelYMax(9)).toBe(27900);
  });

  it("calcAccelYMax floors at 8000", () => {
    expect(calcAccelYMax(50)).toBe(8000);
  });

  it("calcAccelPRMax(9) produces a reasonable value", () => {
    const val = calcAccelPRMax(9);
    expect(val).toBeGreaterThanOrEqual(10000);
  });

  it("calcAcroYawP derives from accelYMax", () => {
    expect(calcAcroYawP(27900)).toBeCloseTo((0.5 * 27900) / 4500, 4);
  });
});

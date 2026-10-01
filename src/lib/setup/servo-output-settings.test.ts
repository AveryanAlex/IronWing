import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { buildParameterItemIndex } from "../params/parameter-item-model";
import { buildServoOutputSettings, servoPwmValidationError } from "./servo-output-settings";

function itemIndex(entries: Record<string, number>, metadata: ParamMetadataMap | null = null) {
  const params: ParamStore["params"] = {};
  for (const [index, [name, value]] of Object.entries(entries).entries()) {
    params[name] = { name, value, param_type: "real32", index };
  }
  return buildParameterItemIndex({ params, expected_count: Object.keys(params).length }, metadata);
}

describe("servo PWM settings", () => {
  it("edits the firmware trim parameter as Mid and uses staged values for all point constraints", () => {
    const settings = buildServoOutputSettings(3, itemIndex({
      SERVO3_MIN: 1000,
      SERVO3_TRIM: 1500,
      SERVO3_MAX: 2000,
      SERVO4_MIN: 1200,
    }), {
      SERVO3_MIN: { nextValue: 1100 },
      SERVO3_TRIM: { nextValue: 1600 },
      SERVO3_MAX: { nextValue: 1900 },
    });

    expect(settings.map(({ paramName, value, min, max }) => ({ paramName, value, min, max }))).toEqual([
      { paramName: "SERVO3_MIN", value: 1100, min: 0, max: 1600 },
      { paramName: "SERVO3_TRIM", value: 1600, min: 1100, max: 1900 },
      { paramName: "SERVO3_MAX", value: 1900, min: 1600, max: null },
    ]);
  });

  it("preserves configured points beyond the live command window and respects firmware metadata", () => {
    const metadata: ParamMetadataMap = new Map([
      ["SERVO1_MIN", { humanName: "Minimum", description: "", range: { min: 600, max: 1400 } }],
      ["SERVO1_MAX", { humanName: "Maximum", description: "", range: { min: 1600, max: 2400 }, readOnly: true }],
    ]);
    const settings = buildServoOutputSettings(1, itemIndex({
      SERVO1_MIN: 900,
      SERVO1_TRIM: 1500,
      SERVO1_MAX: 2200,
    }, metadata), {});

    expect(settings[0]).toMatchObject({ value: 900, min: 600, max: 1400 });
    expect(settings[2]).toMatchObject({ value: 2200, min: 1600, max: 2400, item: { readOnly: true } });
    expect(servoPwmValidationError(settings[0], 500)).not.toBeNull();
    expect(servoPwmValidationError(settings[2], 2300)).toBeNull();
  });

  it("rejects crossed endpoints, fractional PWM, and non-finite values without rejecting the center boundaries", () => {
    const [min, mid, max] = buildServoOutputSettings(1, itemIndex({
      SERVO1_MIN: 1000,
      SERVO1_TRIM: 1500,
      SERVO1_MAX: 2000,
    }), {});

    expect(servoPwmValidationError(min, 1501)).not.toBeNull();
    expect(servoPwmValidationError(max, 1499)).not.toBeNull();
    expect(servoPwmValidationError(mid, 1500.5)).not.toBeNull();
    expect(servoPwmValidationError(mid, Number.NaN)).not.toBeNull();
    expect(servoPwmValidationError(mid, Number.POSITIVE_INFINITY)).not.toBeNull();
    expect(servoPwmValidationError(mid, 1000)).toBeNull();
    expect(servoPwmValidationError(mid, 2000)).toBeNull();
  });

  it("keeps missing settings unavailable and constrains remaining points against each other", () => {
    const [min, mid, max] = buildServoOutputSettings(17, itemIndex({ SERVO17_MIN: 900, SERVO17_MAX: 2100 }), {});
    expect(mid).toMatchObject({ item: null, value: null });
    expect(min).toMatchObject({ value: 900, min: 0, max: 2100, sliderMin: 900 });
    expect(max).toMatchObject({ value: 2100, min: 900, max: null, sliderMax: 2100 });
    expect(servoPwmValidationError(min, 800)).toBeNull();
    expect(servoPwmValidationError(max, 2200)).toBeNull();
  });
});

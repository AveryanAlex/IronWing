import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { buildParameterItemModels } from "./parameter-item-model";

function createParamStore(): ParamStore {
  return {
    expected_count: 2,
    params: {
      FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      ARMING_CHECK: { name: "ARMING_CHECK", value: 3, param_type: "uint8", index: 0 },
    },
  };
}

describe("buildParameterItemModels", () => {
  it("projects deterministic shared item models from params plus metadata", () => {
    const metadata = new Map([
      [
        "ARMING_CHECK",
        {
          humanName: "Arming checks",
          description: "Controls pre-arm validation.",
          rebootRequired: true,
          unitText: "flags",
          increment: 1,
          range: { min: 0, max: 7 },
          values: [{ code: 3, label: "All checks" }],
        },
      ],
    ]) as ParamMetadataMap;

    const items = buildParameterItemModels(createParamStore(), metadata);

    expect(items.map((item) => item.name)).toEqual(["ARMING_CHECK", "FS_THR_ENABLE"]);
    expect(items[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "Arming checks",
      description: "Controls pre-arm validation.",
      value: 3,
      valueText: "3",
      valueLabel: "All checks",
      units: "flags",
      rebootRequired: true,
      increment: 1,
      range: { min: 0, max: 7 },
      readOnly: false,
    });
  });

  it("falls back to raw parameter labels when metadata is unavailable", () => {
    const items = buildParameterItemModels(createParamStore(), null);

    expect(items[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "ARMING_CHECK",
      description: null,
      valueText: "3",
      valueLabel: null,
      units: null,
      increment: null,
      range: null,
      rebootRequired: false,
      readOnly: false,
    });
  });

  it("drops malformed numeric and value decorations instead of crashing projections", () => {
    const metadata = new Map([
      [
        "ARMING_CHECK",
        {
          humanName: "   ",
          description: "   ",
          increment: Number.NaN,
          range: { min: 10, max: 1 },
          values: [
            { code: Number.NaN, label: "Broken" },
            { code: 9, label: "   " },
          ],
          bitmask: [
            { bit: -1, label: "Bad bit" },
            { bit: 40, label: "Too high" },
          ],
          unitText: "   ",
          units: "   ",
        },
      ],
    ]) as ParamMetadataMap;

    const items = buildParameterItemModels(createParamStore(), metadata);

    expect(items[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "ARMING_CHECK",
      description: null,
      valueLabel: null,
      units: null,
      increment: null,
      range: null,
    });
  });
});

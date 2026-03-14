import { describe, it, expect } from "vitest";
import { getStagedOrCurrent, getParamMeta, formatParamValue } from "./param-helpers";
import type { ParamInputParams } from "./param-helpers";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let i = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: i++ };
  }
  return { params, expected_count: i };
}

function makeParams(overrides: Partial<ParamInputParams> = {}): ParamInputParams {
  return {
    store: null,
    staged: new Map(),
    metadata: null,
    stage: () => {},
    ...overrides,
  };
}

describe("getStagedOrCurrent", () => {
  it("returns staged value when param is staged", () => {
    const params = makeParams({
      store: makeStore({ ANGLE_MAX: 3000 }),
      staged: new Map([["ANGLE_MAX", 4500]]),
    });
    expect(getStagedOrCurrent("ANGLE_MAX", params)).toBe(4500);
  });

  it("returns current value when param is not staged but exists in store", () => {
    const params = makeParams({
      store: makeStore({ ANGLE_MAX: 3000 }),
    });
    expect(getStagedOrCurrent("ANGLE_MAX", params)).toBe(3000);
  });

  it("returns null when param is neither staged nor in store", () => {
    const params = makeParams({
      store: makeStore({ OTHER: 1 }),
    });
    expect(getStagedOrCurrent("ANGLE_MAX", params)).toBeNull();
  });

  it("returns staged value even when current also exists (staged takes precedence)", () => {
    const params = makeParams({
      store: makeStore({ FS_THR_ENABLE: 0 }),
      staged: new Map([["FS_THR_ENABLE", 1]]),
    });
    expect(getStagedOrCurrent("FS_THR_ENABLE", params)).toBe(1);
  });

  it("handles store === null gracefully", () => {
    const params = makeParams({ store: null });
    expect(getStagedOrCurrent("ANYTHING", params)).toBeNull();
  });

  it("returns staged value when store is null", () => {
    const params = makeParams({
      store: null,
      staged: new Map([["GPS1_TYPE", 5]]),
    });
    expect(getStagedOrCurrent("GPS1_TYPE", params)).toBe(5);
  });
});

describe("getParamMeta", () => {
  const meta: ParamMeta = {
    humanName: "Angle Max",
    description: "Maximum lean angle",
    range: { min: 1000, max: 8000 },
    units: "cdeg",
  };

  const metadataMap: ParamMetadataMap = new Map([["ANGLE_MAX", meta]]);

  it("returns ParamMeta when metadata map has the param", () => {
    expect(getParamMeta("ANGLE_MAX", metadataMap)).toBe(meta);
  });

  it("returns null when param not in metadata map", () => {
    expect(getParamMeta("MISSING_PARAM", metadataMap)).toBeNull();
  });

  it("returns null when metadata is null", () => {
    expect(getParamMeta("ANGLE_MAX", null)).toBeNull();
  });
});

describe("formatParamValue", () => {
  it("returns matching enum label when value matches a values[] entry code", () => {
    const meta: ParamMeta = {
      humanName: "Mode",
      description: "Flight mode",
      values: [
        { code: 0, label: "Stabilize" },
        { code: 5, label: "Loiter" },
      ],
    };
    expect(formatParamValue(5, meta)).toBe("Loiter");
  });

  it("returns raw numeric string when no matching enum entry", () => {
    const meta: ParamMeta = {
      humanName: "Mode",
      description: "Flight mode",
      values: [{ code: 0, label: "Stabilize" }],
    };
    expect(formatParamValue(99, meta)).toBe("99");
  });

  it("appends unitText suffix when available", () => {
    const meta: ParamMeta = {
      humanName: "Alt",
      description: "Altitude",
      unitText: "meters",
    };
    expect(formatParamValue(100, meta)).toBe("100 meters");
  });

  it("appends units suffix when unitText is absent", () => {
    const meta: ParamMeta = {
      humanName: "Alt",
      description: "Altitude",
      units: "m",
    };
    expect(formatParamValue(100, meta)).toBe("100 m");
  });

  it("prefers unitText over units", () => {
    const meta: ParamMeta = {
      humanName: "Alt",
      description: "Altitude",
      units: "m",
      unitText: "meters",
    };
    expect(formatParamValue(100, meta)).toBe("100 meters");
  });

  it("returns raw value when metadata is null", () => {
    expect(formatParamValue(42, null)).toBe("42");
  });

  it("returns enum label without appending units", () => {
    const meta: ParamMeta = {
      humanName: "Type",
      description: "GPS type",
      units: "type",
      values: [
        { code: 0, label: "None" },
        { code: 1, label: "Auto" },
      ],
    };
    expect(formatParamValue(1, meta)).toBe("Auto");
  });
});

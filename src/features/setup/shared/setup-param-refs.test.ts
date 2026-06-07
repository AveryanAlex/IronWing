import { describe, expect, it } from "vitest";

import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  discoverIndexedSetupParamNumbers,
  indexedSetupParamRefs,
  resolveSetupParamRef,
  resolveSetupParamRefs,
} from "./setup-param-refs";

function item(name: string): ParameterItemModel {
  return {
    name,
    rawName: name,
    label: name,
    description: null,
    value: 0,
    valueText: "0",
    valueLabel: null,
    units: null,
    rebootRequired: false,
    order: 0,
    increment: null,
    range: null,
    readOnly: false,
  };
}

describe("setup param refs", () => {
  it("resolves the preferred id before aliases", () => {
    const preferred = item("BARO_ALT_OFFSET");
    const alias = item("GND_ALT_OFFSET");
    const index = new Map([
      [alias.name, alias],
      [preferred.name, preferred],
    ]);

    expect(resolveSetupParamRef({ id: preferred.name, aliases: [alias.name] }, index)).toBe(preferred);
  });

  it("filters unavailable refs and resolves aliases", () => {
    const alias = item("GPS_TYPE");
    const index = new Map([[alias.name, alias]]);

    expect(resolveSetupParamRefs([{ id: "GPS1_TYPE", aliases: ["GPS_TYPE"] }, { id: "MISSING" }], index)).toEqual([
      alias,
    ]);
  });

  it("generates and discovers indexed parameter families", () => {
    expect(indexedSetupParamRefs("BATT", 1, ["MONITOR", "CAPACITY"])).toEqual([
      { id: "BATT_MONITOR" },
      { id: "BATT_CAPACITY" },
    ]);
    expect(indexedSetupParamRefs("BATT", 2, ["MONITOR"])).toEqual([{ id: "BATT2_MONITOR" }]);
    expect(discoverIndexedSetupParamNumbers(["BATT_MONITOR", "BATT2_MONITOR", "BATT10_CAPACITY", "OTHER"], "BATT")).toEqual([
      1,
      2,
      10,
    ]);
  });
});

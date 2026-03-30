import { describe, expect, it } from "vitest";
import type { ParamStore } from "../../../params";
import type { ParamInputParams } from "../primitives/param-helpers";
import {
  GPS_PROTOCOL,
  RC_PROTOCOL,
  findGpsSerialPorts,
  findPortsByProtocol,
  findRcSerialPorts,
} from "./serial-helpers";

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }

  return { params, expected_count: index };
}

function makeParams(
  storeEntries: Record<string, number> | null,
  staged: Record<string, number> = {},
): ParamInputParams {
  return {
    store: storeEntries ? makeStore(storeEntries) : null,
    staged: new Map(Object.entries(staged)),
    metadata: null,
    stage: () => {},
  };
}

describe("serial-helpers", () => {
  it("findPortsByProtocol returns matching ports from store values", () => {
    const params = makeParams({
      SERIAL1_PROTOCOL: 2,
      SERIAL3_PROTOCOL: GPS_PROTOCOL,
      SERIAL4_PROTOCOL: GPS_PROTOCOL,
      SERIAL9_PROTOCOL: 1,
    });

    expect(findPortsByProtocol(GPS_PROTOCOL, params)).toEqual([
      "SERIAL3",
      "SERIAL4",
    ]);
  });

  it("findPortsByProtocol reflects staged values over store values", () => {
    const params = makeParams(
      {
        SERIAL3_PROTOCOL: GPS_PROTOCOL,
        SERIAL4_PROTOCOL: 1,
      },
      {
        SERIAL3_PROTOCOL: 0,
        SERIAL4_PROTOCOL: GPS_PROTOCOL,
      },
    );

    expect(findPortsByProtocol(GPS_PROTOCOL, params)).toEqual(["SERIAL4"]);
  });

  it("findGpsSerialPorts includes SERIAL9 when configured for GPS", () => {
    const params = makeParams({
      SERIAL8_PROTOCOL: GPS_PROTOCOL,
      SERIAL9_PROTOCOL: GPS_PROTOCOL,
    });

    expect(findGpsSerialPorts(params)).toEqual(["SERIAL8", "SERIAL9"]);
  });

  it("findRcSerialPorts finds RC protocol ports", () => {
    const params = makeParams({
      SERIAL1_PROTOCOL: RC_PROTOCOL,
      SERIAL2_PROTOCOL: 2,
      SERIAL6_PROTOCOL: RC_PROTOCOL,
    });

    expect(findRcSerialPorts(params)).toEqual(["SERIAL1", "SERIAL6"]);
  });

  it("returns an empty array for an empty store", () => {
    expect(findPortsByProtocol(GPS_PROTOCOL, makeParams({}))).toEqual([]);
    expect(findPortsByProtocol(GPS_PROTOCOL, makeParams(null))).toEqual([]);
  });
});

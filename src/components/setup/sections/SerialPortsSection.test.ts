import { describe, it, expect } from "vitest";
import {
  detectSerialPorts,
  detectConflicts,
  EXCLUSIVE_PROTOCOLS,
} from "./SerialPortsSection";
import type { SerialPort } from "./SerialPortsSection";
import type { ParamInputParams } from "../primitives/param-helpers";

function makeParams(
  overrides: Partial<ParamInputParams> = {},
): ParamInputParams {
  return {
    store: null,
    staged: new Map(),
    metadata: null,
    stage: () => {},
    ...overrides,
  };
}

function makeStore(paramNames: string[], values?: Record<string, number>) {
  const params: Record<string, { name: string; value: number; param_type: "real32"; index: number }> = {};
  for (const name of paramNames) {
    params[name] = {
      name,
      value: values?.[name] ?? 0,
      param_type: "real32",
      index: Object.keys(params).length,
    };
  }
  return { params, expected_count: paramNames.length };
}

describe("detectSerialPorts", () => {
  it("returns empty array when store is null", () => {
    expect(detectSerialPorts(makeParams())).toEqual([]);
  });

  it("detects ports by SERIALn_BAUD presence", () => {
    const store = makeStore([
      "SERIAL0_BAUD",
      "SERIAL0_PROTOCOL",
      "SERIAL1_BAUD",
      "SERIAL1_PROTOCOL",
      "SERIAL3_BAUD",
      "SERIAL3_PROTOCOL",
    ]);
    const ports = detectSerialPorts(makeParams({ store }));
    expect(ports).toHaveLength(3);
    expect(ports.map((p) => p.index)).toEqual([0, 1, 3]);
  });

  it("assigns board labels for known UART indices", () => {
    const store = makeStore(["SERIAL0_BAUD", "SERIAL1_BAUD", "SERIAL7_BAUD"]);
    const ports = detectSerialPorts(makeParams({ store }));
    expect(ports[0].boardLabel).toBe("USB");
    expect(ports[1].boardLabel).toBe("TELEM1");
    expect(ports[2].boardLabel).toBeUndefined();
  });

  it("builds correct prefix strings", () => {
    const store = makeStore(["SERIAL2_BAUD", "SERIAL5_BAUD"]);
    const ports = detectSerialPorts(makeParams({ store }));
    expect(ports.map((p) => p.prefix)).toEqual(["SERIAL2", "SERIAL5"]);
  });
});

describe("detectConflicts", () => {
  const ports: SerialPort[] = [
    { index: 1, prefix: "SERIAL1", boardLabel: "TELEM1" },
    { index: 3, prefix: "SERIAL3", boardLabel: "GPS1" },
    { index: 4, prefix: "SERIAL4", boardLabel: "GPS2" },
  ];

  it("returns empty when no exclusive protocols are duplicated", () => {
    const store = makeStore(
      ["SERIAL1_PROTOCOL", "SERIAL3_PROTOCOL", "SERIAL4_PROTOCOL"],
      { SERIAL1_PROTOCOL: 2, SERIAL3_PROTOCOL: 5, SERIAL4_PROTOCOL: 1 },
    );
    const conflicts = detectConflicts(ports, makeParams({ store }));
    expect(conflicts).toEqual([]);
  });

  it("detects GPS protocol assigned to multiple ports", () => {
    const store = makeStore(
      ["SERIAL1_PROTOCOL", "SERIAL3_PROTOCOL", "SERIAL4_PROTOCOL"],
      { SERIAL1_PROTOCOL: 2, SERIAL3_PROTOCOL: 5, SERIAL4_PROTOCOL: 5 },
    );
    const conflicts = detectConflicts(ports, makeParams({ store }));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].protocol).toBe(5);
    expect(conflicts[0].protocolLabel).toBe("GPS");
    expect(conflicts[0].ports).toEqual(["SERIAL3", "SERIAL4"]);
  });

  it("uses staged values over current for conflict detection", () => {
    const store = makeStore(
      ["SERIAL1_PROTOCOL", "SERIAL3_PROTOCOL", "SERIAL4_PROTOCOL"],
      { SERIAL1_PROTOCOL: 2, SERIAL3_PROTOCOL: 5, SERIAL4_PROTOCOL: 1 },
    );
    const staged = new Map([["SERIAL4_PROTOCOL", 5]]);
    const conflicts = detectConflicts(ports, makeParams({ store, staged }));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ports).toEqual(["SERIAL3", "SERIAL4"]);
  });

  it("ignores disabled protocols (0 and -1)", () => {
    const store = makeStore(
      ["SERIAL1_PROTOCOL", "SERIAL3_PROTOCOL", "SERIAL4_PROTOCOL"],
      { SERIAL1_PROTOCOL: 0, SERIAL3_PROTOCOL: -1, SERIAL4_PROTOCOL: 5 },
    );
    const conflicts = detectConflicts(ports, makeParams({ store }));
    expect(conflicts).toEqual([]);
  });

  it("only flags exclusive protocols, not arbitrary duplicates", () => {
    const store = makeStore(
      ["SERIAL1_PROTOCOL", "SERIAL3_PROTOCOL", "SERIAL4_PROTOCOL"],
      { SERIAL1_PROTOCOL: 2, SERIAL3_PROTOCOL: 2, SERIAL4_PROTOCOL: 2 },
    );
    const conflicts = detectConflicts(ports, makeParams({ store }));
    expect(conflicts).toEqual([]);
  });
});

describe("EXCLUSIVE_PROTOCOLS", () => {
  it("includes GPS, RCInput, and Scripting", () => {
    expect(EXCLUSIVE_PROTOCOLS[5]).toBe("GPS");
    expect(EXCLUSIVE_PROTOCOLS[23]).toBe("RCInput");
    expect(EXCLUSIVE_PROTOCOLS[28]).toBe("Scripting");
  });
});

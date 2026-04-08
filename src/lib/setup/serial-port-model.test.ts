import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  GPS_PROTOCOL,
  RC_PROTOCOL,
  buildSerialPortModel,
  detectSerialProtocolConflicts,
  detectSerialPorts,
  findPortsByProtocol,
} from "./serial-port-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "uint8" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function createMetadata(): ParamMetadataMap {
  return new Map([
    [
      "SERIAL1_PROTOCOL",
      {
        humanName: "SERIAL1 protocol",
        description: "Protocol selection for SERIAL1.",
        values: [
          { code: 0, label: "None" },
          { code: 2, label: "MAVLink2" },
          { code: GPS_PROTOCOL, label: "GPS" },
          { code: RC_PROTOCOL, label: "RCInput" },
        ],
      },
    ],
    [
      "SERIAL1_BAUD",
      {
        humanName: "SERIAL1 baud",
        description: "Baud selection for SERIAL1.",
        values: [
          { code: 57, label: "57600" },
          { code: 115, label: "115200" },
        ],
      },
    ],
    [
      "SERIAL2_PROTOCOL",
      {
        humanName: "SERIAL2 protocol",
        description: "Protocol selection for SERIAL2.",
        values: [
          { code: 0, label: "None" },
          { code: 2, label: "MAVLink2" },
          { code: GPS_PROTOCOL, label: "GPS" },
          { code: RC_PROTOCOL, label: "RCInput" },
        ],
      },
    ],
    [
      "SERIAL2_BAUD",
      {
        humanName: "SERIAL2 baud",
        description: "Baud selection for SERIAL2.",
        values: [
          { code: 57, label: "57600" },
          { code: 115, label: "115200" },
        ],
      },
    ],
    [
      "SERIAL3_PROTOCOL",
      {
        humanName: "SERIAL3 protocol",
        description: "Protocol selection for SERIAL3.",
        values: [
          { code: 0, label: "None" },
          { code: 2, label: "MAVLink2" },
          { code: GPS_PROTOCOL, label: "GPS" },
          { code: RC_PROTOCOL, label: "RCInput" },
        ],
      },
    ],
    [
      "SERIAL3_BAUD",
      {
        humanName: "SERIAL3 baud",
        description: "Baud selection for SERIAL3.",
        values: [
          { code: 57, label: "57600" },
          { code: 115, label: "115200" },
        ],
      },
    ],
  ]);
}

describe("serial-port-model", () => {
  it("detects staged exclusive-protocol conflicts before apply", () => {
    const rows = detectSerialPorts({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: GPS_PROTOCOL,
        SERIAL1_BAUD: 115,
        SERIAL2_PROTOCOL: 2,
        SERIAL2_BAUD: 57,
      }),
      metadata: createMetadata(),
      stagedEdits: {
        SERIAL2_PROTOCOL: { nextValue: GPS_PROTOCOL },
      },
    });

    expect(detectSerialProtocolConflicts(rows)).toEqual([
      {
        protocol: GPS_PROTOCOL,
        protocolLabel: "GPS",
        ports: ["SERIAL1", "SERIAL2"],
        message: "GPS is assigned to SERIAL1, SERIAL2. Keep this exclusive protocol on one port only before applying or rebooting.",
      },
    ]);
  });

  it("exposes reboot-required pending changes and truthful protocol summaries", () => {
    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: 2,
        SERIAL1_BAUD: 57,
        SERIAL3_PROTOCOL: GPS_PROTOCOL,
        SERIAL3_BAUD: 115,
      }),
      metadata: createMetadata(),
      stagedEdits: {
        SERIAL1_BAUD: { nextValue: 115 },
      },
    });

    expect(model.hasPendingChanges).toBe(true);
    expect(model.summaryText).toContain("2 detected");
    expect(model.summaryText).toContain("GPS on SERIAL3");
    expect(model.rebootWarningText).toContain("require a reboot");
    expect(model.ports.find((row) => row.prefix === "SERIAL1")?.hasPendingChange).toBe(true);
  });

  it("builds recovery copy when protocol or baud metadata is partial", () => {
    const metadata = new Map([
      [
        "SERIAL1_PROTOCOL",
        {
          humanName: "SERIAL1 protocol",
          description: "Protocol selection for SERIAL1.",
          values: [{ code: GPS_PROTOCOL, label: "GPS" }],
        },
      ],
    ] satisfies Parameters<typeof Map>[0]);

    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: GPS_PROTOCOL,
        SERIAL1_BAUD: 115,
      }),
      metadata,
      stagedEdits: {},
    });

    expect(model.recoveryText).toContain("SERIAL1_BAUD metadata is missing or malformed");
    expect(model.recoveryText).toContain("Full Parameters recovery");
    expect(model.ports[0]?.baudMetadataReady).toBe(false);
    expect(model.ports[0]?.recoveryText).toContain("SERIAL1_BAUD metadata is missing or malformed");
  });

  it("tracks protocol ownership summaries across sparse port sets", () => {
    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: RC_PROTOCOL,
        SERIAL1_BAUD: 57,
        SERIAL8_PROTOCOL: GPS_PROTOCOL,
        SERIAL8_BAUD: 115,
        SERIAL9_PROTOCOL: GPS_PROTOCOL,
        SERIAL9_BAUD: 115,
      }),
      metadata: null,
      stagedEdits: {},
    });

    expect(findPortsByProtocol(GPS_PROTOCOL, {
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: RC_PROTOCOL,
        SERIAL1_BAUD: 57,
        SERIAL8_PROTOCOL: GPS_PROTOCOL,
        SERIAL8_BAUD: 115,
        SERIAL9_PROTOCOL: GPS_PROTOCOL,
        SERIAL9_BAUD: 115,
      }),
      metadata: null,
      stagedEdits: {},
    })).toEqual(["SERIAL8", "SERIAL9"]);
    expect(model.gpsPorts).toEqual(["SERIAL8", "SERIAL9"]);
    expect(model.rcPorts).toEqual(["SERIAL1"]);
    expect(model.summaryText).toContain("RCInput on SERIAL1");
  });
});

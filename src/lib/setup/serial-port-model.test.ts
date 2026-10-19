import { ArduPilotSerialProtocol } from "../ardupilot/serial";
import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  buildSerialPortModel,
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
          { code: ArduPilotSerialProtocol.Gps, label: "GPS" },
          { code: ArduPilotSerialProtocol.RcInput, label: "RCInput" },
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
          { code: ArduPilotSerialProtocol.Gps, label: "GPS" },
          { code: ArduPilotSerialProtocol.RcInput, label: "RCInput" },
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
          { code: ArduPilotSerialProtocol.Gps, label: "GPS" },
          { code: ArduPilotSerialProtocol.RcInput, label: "RCInput" },
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
  it.each([ArduPilotSerialProtocol.Gps, ArduPilotSerialProtocol.RcInput, ArduPilotSerialProtocol.Scripting])(
    "preserves multiple ports using protocol %s",
    (protocol) => {
      const model = buildSerialPortModel({
        paramStore: createParamStore({ SERIAL3_PROTOCOL: protocol, SERIAL3_BAUD: 115, SERIAL4_PROTOCOL: 2, SERIAL4_BAUD: 115 }),
        metadata: createMetadata(),
        stagedEdits: { SERIAL4_PROTOCOL: { nextValue: protocol } },
      });
      expect(model.ports.map((port) => port.protocolValue)).toEqual([protocol, protocol]);
      expect(model.configuredPortCount).toBe(2);
      expect(model.ports.map((port) => port.boardLabel)).toEqual([null, null]);
      expect(model.summaryText).not.toContain("conflict");
    },
  );

  it("exposes reboot-required pending changes and protocol summaries", () => {
    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: 2,
        SERIAL1_BAUD: 57,
        SERIAL3_PROTOCOL: ArduPilotSerialProtocol.Gps,
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
    expect(model.rebootWarningText).toContain("require apply and reboot");
    expect(model.ports.find((row) => row.prefix === "SERIAL1")?.hasPendingChange).toBe(true);
  });

  it("builds recovery copy when protocol or baud metadata is partial", () => {
    const metadata = new Map([
      [
        "SERIAL1_PROTOCOL",
        {
          humanName: "SERIAL1 protocol",
          description: "Protocol selection for SERIAL1.",
          values: [{ code: ArduPilotSerialProtocol.Gps, label: "GPS" }],
        },
      ],
    ] satisfies Parameters<typeof Map>[0]);

    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: ArduPilotSerialProtocol.Gps,
        SERIAL1_BAUD: 115,
      }),
      metadata,
      stagedEdits: {},
    });

    expect(model.recoveryText).toContain("SERIAL1_BAUD option labels are unavailable");
    expect(model.recoveryText).toContain("Use Parameters");
    expect(model.ports[0]?.baudMetadataReady).toBe(false);
    expect(model.ports[0]?.recoveryText).toContain("SERIAL1_BAUD option labels are unavailable");
  });

  it("tracks protocol summaries across sparse port sets", () => {
    const model = buildSerialPortModel({
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: ArduPilotSerialProtocol.RcInput,
        SERIAL1_BAUD: 57,
        SERIAL8_PROTOCOL: ArduPilotSerialProtocol.Gps,
        SERIAL8_BAUD: 115,
        SERIAL9_PROTOCOL: ArduPilotSerialProtocol.Gps,
        SERIAL9_BAUD: 115,
      }),
      metadata: null,
      stagedEdits: {},
    });

    expect(findPortsByProtocol(ArduPilotSerialProtocol.Gps, {
      paramStore: createParamStore({
        SERIAL1_PROTOCOL: ArduPilotSerialProtocol.RcInput,
        SERIAL1_BAUD: 57,
        SERIAL8_PROTOCOL: ArduPilotSerialProtocol.Gps,
        SERIAL8_BAUD: 115,
        SERIAL9_PROTOCOL: ArduPilotSerialProtocol.Gps,
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

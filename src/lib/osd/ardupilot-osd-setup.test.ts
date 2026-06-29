import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import type { SerialPortRow } from "../setup/serial-port-model";
import {
  OSD_TYPE_ANALOG,
  OSD_TYPE_DISPLAYPORT,
  OSD_TYPE_MSP,
  SERIAL_BAUD_115200,
  SERIAL_PROTOCOL_DISPLAYPORT,
  SERIAL_PROTOCOL_NONE,
  buildMspPortStagePlan,
  buildOsdProfileStagePlan,
} from "./ardupilot-osd-setup";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "int16" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function row(index: number, protocolValue: number, baudValue = 57): SerialPortRow {
  const prefix = `SERIAL${index}`;

  return {
    index,
    prefix,
    boardLabel: null,
    protocolParamName: `${prefix}_PROTOCOL`,
    baudParamName: `${prefix}_BAUD`,
    hasProtocolParam: true,
    hasBaudParam: true,
    protocolValue,
    protocolValueText: String(protocolValue),
    baudValue,
    baudValueText: String(baudValue),
    protocolOptions: [],
    baudOptions: [],
    protocolMetadataReady: true,
    baudMetadataReady: true,
    recoveryText: null,
    summaryText: `${prefix} ${protocolValue} @ ${baudValue}`,
    hasPendingChange: false,
    pendingChangeCount: 0,
  };
}

describe("ardupilot-osd-setup", () => {
  it("stages DJI custom OSD core parameters with font-compatible option bits", () => {
    const plan = buildOsdProfileStagePlan({
      profileId: "dji",
      paramStore: createParamStore({
        OSD_TYPE: OSD_TYPE_ANALOG,
        MSP_OPTIONS: 1,
        OSD_OPTIONS: 0,
      }),
    });

    expect(Object.fromEntries(plan.map((target) => [target.name, target.value]))).toEqual({
      OSD_TYPE: OSD_TYPE_MSP,
      MSP_OPTIONS: 4,
      OSD_OPTIONS: 32,
    });
  });

  it("stages Walksnail as a single primary DisplayPort backend", () => {
    const plan = buildOsdProfileStagePlan({
      profileId: "walksnail",
      paramStore: createParamStore({
        OSD_TYPE: OSD_TYPE_ANALOG,
        MSP_OPTIONS: 1,
      }),
    });

    expect(Object.fromEntries(plan.map((target) => [target.name, target.value]))).toEqual({
      OSD_TYPE: OSD_TYPE_DISPLAYPORT,
      MSP_OPTIONS: 0,
    });
  });

  it("stages selected DisplayPort UART and resets the previous DisplayPort UART to ArduPilot None", () => {
    expect(SERIAL_PROTOCOL_NONE).toBe(-1);

    const plan = buildMspPortStagePlan({
      ports: [row(1, SERIAL_PROTOCOL_DISPLAYPORT, SERIAL_BAUD_115200), row(2, 2, 57)],
      selectedPortPrefix: "SERIAL2",
      protocol: SERIAL_PROTOCOL_DISPLAYPORT,
      protocolLabel: "MSP DisplayPort (42)",
    });

    expect(plan.map((target) => [target.name, target.value])).toEqual([
      ["SERIAL1_PROTOCOL", SERIAL_PROTOCOL_NONE],
      ["SERIAL2_PROTOCOL", SERIAL_PROTOCOL_DISPLAYPORT],
      ["SERIAL2_BAUD", SERIAL_BAUD_115200],
    ]);
  });
});

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
  buildOsdConfigurationPlan,
  buildOsdProfileStagePlan,
  detectOsdConfiguration,
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

function row(
  index: number,
  protocolValue: number,
  baudValue = 57,
  overrides: Partial<SerialPortRow> = {},
): SerialPortRow {
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
    ...overrides,
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

  it("keeps a live disabled OSD_TYPE=0 distinct from staged analog OSD", () => {
    expect(detectOsdConfiguration({
      paramStore: createParamStore({ OSD_TYPE: 0 }),
      stagedEdits: { OSD_TYPE: { nextValue: OSD_TYPE_ANALOG } },
    })).toEqual({ state: "disabled", osdType: 0 });
  });

  it("reports unsupported or unavailable live OSD backends as unknown", () => {
    expect(detectOsdConfiguration({ paramStore: createParamStore({ OSD_TYPE: 2 }) }))
      .toEqual({ state: "unknown", osdType: 2 });
    expect(detectOsdConfiguration({ paramStore: createParamStore({}) }))
      .toEqual({ state: "unknown", osdType: null });
  });

  it("detects each supported live OSD backend", () => {
    expect(detectOsdConfiguration({ paramStore: createParamStore({ OSD_TYPE: OSD_TYPE_ANALOG }) }).state)
      .toBe("analog");
    expect(detectOsdConfiguration({ paramStore: createParamStore({ OSD_TYPE: OSD_TYPE_MSP }) }).state)
      .toBe("dji");
    expect(detectOsdConfiguration({ paramStore: createParamStore({ OSD_TYPE: OSD_TYPE_DISPLAYPORT }) }).state)
      .toBe("walksnail");
  });

  it("builds an analog transition from disabled without requiring a UART", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "analog",
      selectedPortPrefix: null,
      ports: [],
      paramStore: createParamStore({ OSD_TYPE: 0 }),
    });

    expect(plan).toMatchObject({
      profileId: "analog",
      selectedPortPrefix: null,
      canStage: true,
      issues: [],
    });
    expect(plan.targets.map((target) => [target.name, target.value])).toEqual([
      ["OSD_TYPE", OSD_TYPE_ANALOG],
    ]);
  });

  it("blocks a digital plan until a writable UART is selected", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "dji",
      selectedPortPrefix: null,
      ports: [row(1, 2)],
      paramStore: createParamStore({ OSD_TYPE: 0, MSP_OPTIONS: 0, OSD_OPTIONS: 0 }),
    });

    expect(plan.canStage).toBe(false);
    expect(plan.issues).toContain("Select the UART wired to the video system.");
    expect(plan.targets).toEqual([]);
  });

  it("builds one complete DJI plan, preserving unrelated option bits and staged edits", () => {
    const paramStore = createParamStore({
      OSD_TYPE: 0,
      MSP_OPTIONS: 0b10000001,
      OSD_OPTIONS: 0b10000001,
    });
    const stagedEdits = {
      MSP_OPTIONS: { nextValue: 0b10010001 },
      OSD_OPTIONS: { nextValue: 0b10000001 },
      UNRELATED_PARAM: { nextValue: 77 },
    };
    const plan = buildOsdConfigurationPlan({
      profileId: "dji",
      selectedPortPrefix: "SERIAL2",
      ports: [
        row(1, 33, SERIAL_BAUD_115200),
        row(2, 2, 57),
      ],
      paramStore,
      stagedEdits,
    });

    expect(plan.canStage).toBe(true);
    expect(plan.issues).toEqual([]);
    expect(plan.targets.map((target) => [target.name, target.currentValue, target.value])).toEqual([
      ["OSD_TYPE", 0, OSD_TYPE_MSP],
      ["MSP_OPTIONS", 0b10010001, 0b10010100],
      ["OSD_OPTIONS", 0b10000001, 0b10100001],
      ["SERIAL1_PROTOCOL", 33, SERIAL_PROTOCOL_NONE],
      ["SERIAL2_PROTOCOL", 2, 33],
      ["SERIAL2_BAUD", 57, SERIAL_BAUD_115200],
    ]);
    expect(paramStore.params.MSP_OPTIONS?.value).toBe(0b10000001);
    expect(stagedEdits).toEqual({
      MSP_OPTIONS: { nextValue: 0b10010001 },
      OSD_OPTIONS: { nextValue: 0b10000001 },
      UNRELATED_PARAM: { nextValue: 77 },
    });
  });

  it("builds one complete Walksnail plan", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "walksnail",
      selectedPortPrefix: "SERIAL3",
      ports: [
        row(1, SERIAL_PROTOCOL_DISPLAYPORT, SERIAL_BAUD_115200),
        row(3, 5, 57),
      ],
      paramStore: createParamStore({
        OSD_TYPE: 0,
        MSP_OPTIONS: 0b10000011,
      }),
    });

    expect(plan.canStage).toBe(true);
    expect(plan.targets.map((target) => [target.name, target.value])).toEqual([
      ["OSD_TYPE", OSD_TYPE_DISPLAYPORT],
      ["MSP_OPTIONS", 0b10000010],
      ["SERIAL1_PROTOCOL", SERIAL_PROTOCOL_NONE],
      ["SERIAL3_PROTOCOL", SERIAL_PROTOCOL_DISPLAYPORT],
      ["SERIAL3_BAUD", SERIAL_BAUD_115200],
    ]);
  });

  it("cleans up a staged DJI UART when switching to Walksnail", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "walksnail",
      selectedPortPrefix: "SERIAL2",
      ports: [row(1, 33), row(2, 2)],
      paramStore: createParamStore({ OSD_TYPE: OSD_TYPE_MSP, MSP_OPTIONS: 4 }),
    });

    expect(plan.canStage).toBe(true);
    expect(plan.targets.map((target) => [target.name, target.value])).toEqual([
      ["OSD_TYPE", OSD_TYPE_DISPLAYPORT],
      ["MSP_OPTIONS", 4],
      ["SERIAL1_PROTOCOL", SERIAL_PROTOCOL_NONE],
      ["SERIAL2_PROTOCOL", SERIAL_PROTOCOL_DISPLAYPORT],
      ["SERIAL2_BAUD", SERIAL_BAUD_115200],
    ]);
  });

  it("cleans up DJI and Walksnail UARTs, but not generic MSP, when switching to analog", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "analog",
      selectedPortPrefix: null,
      ports: [
        row(1, 33),
        row(2, SERIAL_PROTOCOL_DISPLAYPORT),
        row(3, 32),
      ],
      paramStore: createParamStore({ OSD_TYPE: OSD_TYPE_MSP }),
    });

    expect(plan.canStage).toBe(true);
    expect(plan.targets.map((target) => [target.name, target.value])).toEqual([
      ["OSD_TYPE", OSD_TYPE_ANALOG],
      ["SERIAL1_PROTOCOL", SERIAL_PROTOCOL_NONE],
      ["SERIAL2_PROTOCOL", SERIAL_PROTOCOL_NONE],
    ]);
  });

  it("reassigns the same digital protocol by disabling its old UART in the atomic plan", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "dji",
      selectedPortPrefix: "SERIAL2",
      ports: [row(1, 33), row(2, 2)],
      paramStore: createParamStore({ OSD_TYPE: 3, MSP_OPTIONS: 4, OSD_OPTIONS: 32 }),
    });

    expect(plan.canStage).toBe(true);
    expect(plan.targets.slice(-3).map((target) => [target.name, target.value])).toEqual([
      ["SERIAL1_PROTOCOL", SERIAL_PROTOCOL_NONE],
      ["SERIAL2_PROTOCOL", 33],
      ["SERIAL2_BAUD", SERIAL_BAUD_115200],
    ]);
  });

  it("rejects read-only UARTs and missing backend parameters without yielding a partial plan", () => {
    const readOnlyUart = buildOsdConfigurationPlan({
      profileId: "dji",
      selectedPortPrefix: "SERIAL1",
      ports: [row(1, 2, 57, { protocolMetadataReady: false })],
      paramStore: createParamStore({ OSD_TYPE: 0, MSP_OPTIONS: 0, OSD_OPTIONS: 0 }),
    });
    const missingBackendParameter = buildOsdConfigurationPlan({
      profileId: "walksnail",
      selectedPortPrefix: "SERIAL1",
      ports: [row(1, 2)],
      paramStore: createParamStore({ OSD_TYPE: 0 }),
    });
    const readOnlyCleanupUart = buildOsdConfigurationPlan({
      profileId: "walksnail",
      selectedPortPrefix: "SERIAL2",
      ports: [
        row(1, 33, 57, { protocolMetadataReady: false }),
        row(2, 2),
      ],
      paramStore: createParamStore({ OSD_TYPE: 0, MSP_OPTIONS: 0 }),
    });

    expect(readOnlyUart).toMatchObject({
      canStage: false,
      targets: [],
    });
    expect(readOnlyUart.issues).toContain("SERIAL1_PROTOCOL is read-only in the guided serial view.");
    expect(missingBackendParameter).toMatchObject({
      canStage: false,
      targets: [],
    });
    expect(missingBackendParameter.issues).toContain("MSP_OPTIONS is unavailable on this vehicle.");
    expect(readOnlyCleanupUart).toMatchObject({
      canStage: false,
      targets: [],
    });
    expect(readOnlyCleanupUart.issues).toContain("SERIAL1_PROTOCOL is read-only in the guided serial view.");
  });

  it("does not require metadata for selected UART fields that are already at their targets", () => {
    const plan = buildOsdConfigurationPlan({
      profileId: "dji",
      selectedPortPrefix: "SERIAL1",
      ports: [row(1, 33, SERIAL_BAUD_115200, {
        protocolMetadataReady: false,
        baudMetadataReady: false,
      })],
      paramStore: createParamStore({
        OSD_TYPE: OSD_TYPE_ANALOG,
        MSP_OPTIONS: 1,
        OSD_OPTIONS: 0,
      }),
    });

    expect(plan.canStage).toBe(true);
    expect(plan.issues).toEqual([]);
    expect(plan.targets.filter((target) => target.willChange).map((target) => target.name)).toEqual([
      "OSD_TYPE",
      "MSP_OPTIONS",
      "OSD_OPTIONS",
    ]);
  });
});

import type { ParamStore } from "../../params";
import type { SerialPortRow } from "../setup/serial-port-model";
import type { StagedParameterEdit } from "../stores/params";

export const OSD_TYPE_ANALOG = 1;
export const OSD_TYPE_MSP = 3;
export const OSD_TYPE_DISPLAYPORT = 5;

export const SERIAL_PROTOCOL_NONE = -1;
export const SERIAL_PROTOCOL_MSP = 32;
export const SERIAL_PROTOCOL_DJI_FPV = 33;
export const SERIAL_PROTOCOL_DISPLAYPORT = 42;
export const SERIAL_BAUD_115200 = 115;

const OSD_PROFILE_SERIAL_PROTOCOLS = [
  SERIAL_PROTOCOL_DJI_FPV,
  SERIAL_PROTOCOL_DISPLAYPORT,
] as const;

export const MSP_OPTIONS_TELEMETRY_MODE_BIT = 0;
export const MSP_OPTIONS_DJI_BETAFLIGHT_FONT_BIT = 2;
export const OSD_OPTIONS_TRANSLATE_ARROWS_BIT = 5;

export type OsdVideoSystemId = "analog" | "dji" | "walksnail";
export type OsdDetectedState = "disabled" | OsdVideoSystemId | "unknown";

export type OsdVideoSystemProfile = {
  id: OsdVideoSystemId;
  label: string;
  shortLabel: string;
  summary: string;
  serialProtocol: number | null;
  serialProtocolLabel: string | null;
  primaryOsdType: number;
  keyParams: string[];
  operatorNotes: string[];
};

export type OsdSetupStageTarget = {
  name: string;
  value: number;
  currentValue: number | null;
  label: string;
  detail: string;
  willChange: boolean;
};

export type MspPortStageTarget = OsdSetupStageTarget & {
  portPrefix: string;
  action: "disable" | "enable" | "baud";
};

export type OsdSetupValueInput = {
  paramStore: ParamStore | null;
  stagedEdits?: Record<string, Pick<StagedParameterEdit, "nextValue"> | undefined>;
};

export type OsdConfigurationPlan = {
  profileId: OsdVideoSystemId;
  selectedPortPrefix: string | null;
  canStage: boolean;
  issues: string[];
  targets: OsdSetupStageTarget[];
};

export type OsdConfigurationPlanInput = OsdSetupValueInput & {
  profileId: OsdVideoSystemId;
  selectedPortPrefix: string | null;
  ports: SerialPortRow[];
};

export const OSD_VIDEO_SYSTEM_PROFILES: Record<OsdVideoSystemId, OsdVideoSystemProfile> = {
  analog: {
    id: "analog",
    label: "Analog onboard OSD",
    shortLabel: "Analog",
    summary: "Use the flight controller's onboard MAX7456-style analog overlay. No MSP UART is required.",
    serialProtocol: null,
    serialProtocolLabel: null,
    primaryOsdType: OSD_TYPE_ANALOG,
    keyParams: ["OSD_TYPE=1", "OSDn_ENABLE", "OSDn_<ITEM>_EN/X/Y"],
    operatorNotes: [
      "Wire camera and VTX video through the flight controller's analog video pads.",
      "Use the layout editor below to enable items and place them on the 30 x 16 style character grid.",
    ],
  },
  dji: {
    id: "dji",
    label: "DJI Custom OSD",
    shortLabel: "DJI",
    summary: "Use DJI FPV/RE/compatible goggles custom OSD over MSP on the UART wired to the air unit.",
    serialProtocol: SERIAL_PROTOCOL_DJI_FPV,
    serialProtocolLabel: "DJI FPV / Custom OSD (33)",
    primaryOsdType: OSD_TYPE_MSP,
    keyParams: ["OSD_TYPE=3", "SERIALn_PROTOCOL=33", "SERIALn_BAUD=115", "MSP_OPTIONS bit2", "OSD_OPTIONS bit5"],
    operatorNotes: [
      "Enable Custom OSD in the goggles display menu.",
      "Use both TX and RX between the flight controller UART and the DJI air unit for normal MSP operation.",
    ],
  },
  walksnail: {
    id: "walksnail",
    label: "Walksnail DisplayPort",
    shortLabel: "Walksnail",
    summary: "Use Walksnail/Avatar DisplayPort so ArduPilot draws the OSD layout directly on the HD system.",
    serialProtocol: SERIAL_PROTOCOL_DISPLAYPORT,
    serialProtocolLabel: "MSP DisplayPort (42)",
    primaryOsdType: OSD_TYPE_DISPLAYPORT,
    keyParams: ["OSD_TYPE=5", "SERIALn_PROTOCOL=42", "SERIALn_BAUD=115", "OSDn_TXT_RES"],
    operatorNotes: [
      "Wire TX and RX from the selected UART to the Walksnail/Avatar VTX or air unit.",
      "Choose a text resolution that matches the goggles font/grid before placing HD items.",
    ],
  },
};

export const OSD_VIDEO_SYSTEM_PROFILE_LIST = [
  OSD_VIDEO_SYSTEM_PROFILES.analog,
  OSD_VIDEO_SYSTEM_PROFILES.dji,
  OSD_VIDEO_SYSTEM_PROFILES.walksnail,
];

export function detectOsdConfiguration(input: OsdSetupValueInput): {
  state: OsdDetectedState;
  osdType: number | null;
} {
  const osdType = liveParamValue(input.paramStore, "OSD_TYPE");
  if (osdType === 0) {
    return { state: "disabled", osdType };
  }
  if (osdType === OSD_TYPE_ANALOG) {
    return { state: "analog", osdType };
  }
  if (osdType === OSD_TYPE_MSP) {
    return { state: "dji", osdType };
  }
  if (osdType === OSD_TYPE_DISPLAYPORT) {
    return { state: "walksnail", osdType };
  }

  return { state: "unknown", osdType };
}

export function buildOsdConfigurationPlan(input: OsdConfigurationPlanInput): OsdConfigurationPlan {
  const selectedPortPrefix = normalizePortPrefix(input.selectedPortPrefix);
  const issues = missingProfileParameterIssues(input);
  const profile = OSD_VIDEO_SYSTEM_PROFILES[input.profileId];

  if (profile.serialProtocol === null) {
    const cleanupRows = osdProfileCleanupRows(input.ports, null);
    for (const row of cleanupRows) {
      issues.push(...serialFieldTargetIssues(row, "protocol", SERIAL_PROTOCOL_NONE));
    }

    return completePlanOrIssues(input.profileId, selectedPortPrefix, issues, () => [
      ...buildOsdProfileStagePlan(input),
      ...buildOsdProfileCleanupStagePlan(cleanupRows),
    ]);
  }
  const serialProtocol = profile.serialProtocol;
  const cleanupRows = osdProfileCleanupRows(input.ports, selectedPortPrefix);

  const selectedRow = selectedPortPrefix === null
    ? null
    : input.ports.find((row) => row.prefix === selectedPortPrefix) ?? null;
  if (selectedPortPrefix === null) {
    issues.push("Select the UART wired to the video system.");
  } else if (selectedRow === null) {
    issues.push(`${selectedPortPrefix} is unavailable on this vehicle.`);
  } else {
    issues.push(...serialFieldTargetIssues(selectedRow, "protocol", serialProtocol));
    issues.push(...serialFieldTargetIssues(selectedRow, "baud", SERIAL_BAUD_115200));
  }

  for (const row of cleanupRows) {
    issues.push(...serialFieldTargetIssues(row, "protocol", SERIAL_PROTOCOL_NONE));
  }

  return completePlanOrIssues(input.profileId, selectedPortPrefix, issues, () => [
    ...buildOsdProfileStagePlan(input),
    ...buildDigitalOsdPortStagePlan({
      ports: input.ports,
      selectedPortPrefix,
      protocol: serialProtocol,
      protocolLabel: profile.serialProtocolLabel ?? `Protocol ${serialProtocol}`,
    }),
  ]);
}

export function buildOsdProfileStagePlan(input: OsdSetupValueInput & {
  profileId: OsdVideoSystemId;
}): OsdSetupStageTarget[] {
  const targets: Array<OsdSetupStageTarget | null> = [];

  switch (input.profileId) {
    case "analog":
      targets.push(buildParamTarget(input, "OSD_TYPE", OSD_TYPE_ANALOG, "OSD backend", "Enable onboard analog OSD (OSD_TYPE=1)."));
      break;
    case "dji":
      targets.push(buildParamTarget(
        input,
        "OSD_TYPE",
        OSD_TYPE_MSP,
        "OSD backend",
        "Enable MSP OSD backend for DJI Custom OSD (OSD_TYPE=3).",
      ));
      targets.push(buildParamTarget(
        input,
        "MSP_OPTIONS",
        setBit(setBit(effectiveParamValue(input, "MSP_OPTIONS") ?? 0, MSP_OPTIONS_TELEMETRY_MODE_BIT, false), MSP_OPTIONS_DJI_BETAFLIGHT_FONT_BIT, true),
        "MSP options",
        "Use normal two-wire MSP and DJI/Betaflight font indexes.",
      ));
      targets.push(buildParamTarget(
        input,
        "OSD_OPTIONS",
        setBit(effectiveParamValue(input, "OSD_OPTIONS") ?? 0, OSD_OPTIONS_TRANSLATE_ARROWS_BIT, true),
        "OSD options",
        "Translate direction arrows for DJI Betaflight-compatible fonts.",
      ));
      break;
    case "walksnail":
      targets.push(buildParamTarget(
        input,
        "OSD_TYPE",
        OSD_TYPE_DISPLAYPORT,
        "OSD backend",
        "Enable MSP DisplayPort as the OSD backend (OSD_TYPE=5).",
      ));
      targets.push(buildParamTarget(
        input,
        "MSP_OPTIONS",
        setBit(effectiveParamValue(input, "MSP_OPTIONS") ?? 0, MSP_OPTIONS_TELEMETRY_MODE_BIT, false),
        "MSP options",
        "Use normal two-wire MSP DisplayPort instead of one-wire telemetry push mode.",
      ));
      break;
  }

  return targets.filter((target): target is OsdSetupStageTarget => target !== null);
}

export function buildMspPortStagePlan(input: {
  ports: SerialPortRow[];
  selectedPortPrefix: string | null;
  protocol: number;
  protocolLabel: string;
}): MspPortStageTarget[] {
  const selectedPortPrefix = input.selectedPortPrefix?.trim();
  if (!selectedPortPrefix) {
    return [];
  }

  const targets: MspPortStageTarget[] = [];
  for (const row of input.ports) {
    if (row.prefix === selectedPortPrefix) {
      continue;
    }

    if (row.protocolValue === input.protocol && row.hasProtocolParam) {
      targets.push(buildPortTarget(row, "protocol", SERIAL_PROTOCOL_NONE, "disable", `Disable ${input.protocolLabel} on ${portLabel(row)}.`));
    }
  }

  const selectedRow = input.ports.find((row) => row.prefix === selectedPortPrefix);
  if (!selectedRow) {
    return targets;
  }

  if (selectedRow.hasProtocolParam) {
    targets.push(buildPortTarget(selectedRow, "protocol", input.protocol, "enable", `Enable ${input.protocolLabel} on ${portLabel(selectedRow)}.`));
  }
  if (selectedRow.hasBaudParam) {
    targets.push(buildPortTarget(selectedRow, "baud", SERIAL_BAUD_115200, "baud", `Set ${portLabel(selectedRow)} to 115200 baud.`));
  }

  return targets;
}

export function effectiveParamValue(input: OsdSetupValueInput, name: string): number | null {
  const stagedValue = input.stagedEdits?.[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return stagedValue;
  }

  const value = input.paramStore?.params[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function liveParamValue(paramStore: ParamStore | null, name: string): number | null {
  const value = paramStore?.params[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isMspOsdProtocol(protocol: number | null): boolean {
  return protocol === SERIAL_PROTOCOL_MSP
    || protocol === SERIAL_PROTOCOL_DJI_FPV
    || protocol === SERIAL_PROTOCOL_DISPLAYPORT;
}

export function setBit(value: number, bit: number, enabled: boolean): number {
  if (!Number.isInteger(bit) || bit < 0 || bit > 30) {
    return value;
  }

  const mask = 1 << bit;
  return enabled ? value | mask : value & ~mask;
}

function buildParamTarget(
  input: OsdSetupValueInput,
  name: string,
  value: number,
  label: string,
  detail: string,
): OsdSetupStageTarget | null {
  if (input.paramStore?.params[name] === undefined) {
    return null;
  }

  const currentValue = effectiveParamValue(input, name);
  return {
    name,
    value,
    currentValue,
    label,
    detail,
    willChange: currentValue !== value,
  };
}

function buildPortTarget(
  row: SerialPortRow,
  field: "protocol" | "baud",
  value: number,
  action: MspPortStageTarget["action"],
  detail: string,
): MspPortStageTarget {
  const name = field === "protocol" ? row.protocolParamName : row.baudParamName;
  const currentValue = field === "protocol" ? row.protocolValue : row.baudValue;

  return {
    name,
    value,
    currentValue,
    label: `${portLabel(row)} ${field === "protocol" ? "protocol" : "baud"}`,
    detail,
    willChange: currentValue !== value,
    portPrefix: row.prefix,
    action,
  };
}

function portLabel(row: Pick<SerialPortRow, "prefix" | "boardLabel">): string {
  return row.boardLabel ? `${row.prefix} (${row.boardLabel})` : row.prefix;
}

function normalizePortPrefix(prefix: string | null): string | null {
  const normalized = prefix?.trim();
  return normalized ? normalized : null;
}

function missingProfileParameterIssues(input: OsdConfigurationPlanInput): string[] {
  return requiredProfileParamNames(input.profileId)
    .filter((name) => input.paramStore?.params[name] === undefined)
    .map((name) => `${name} is unavailable on this vehicle.`);
}

function requiredProfileParamNames(profileId: OsdVideoSystemId): string[] {
  switch (profileId) {
    case "analog":
      return ["OSD_TYPE"];
    case "dji":
      return ["OSD_TYPE", "MSP_OPTIONS", "OSD_OPTIONS"];
    case "walksnail":
      return ["OSD_TYPE", "MSP_OPTIONS"];
  }
}

function serialFieldIssues(row: SerialPortRow, field: "protocol" | "baud"): string[] {
  const hasParam = field === "protocol" ? row.hasProtocolParam : row.hasBaudParam;
  const metadataReady = field === "protocol" ? row.protocolMetadataReady : row.baudMetadataReady;
  const name = field === "protocol" ? row.protocolParamName : row.baudParamName;

  if (!hasParam) {
    return [`${name} is unavailable on this vehicle.`];
  }
  if (!metadataReady) {
    return [`${name} is read-only in the guided serial view.`];
  }

  return [];
}

function serialFieldTargetIssues(
  row: SerialPortRow,
  field: "protocol" | "baud",
  targetValue: number,
): string[] {
  const currentValue = field === "protocol" ? row.protocolValue : row.baudValue;
  return currentValue === targetValue ? [] : serialFieldIssues(row, field);
}

function osdProfileCleanupRows(ports: SerialPortRow[], excludedPortPrefix: string | null): SerialPortRow[] {
  return ports.filter((row) => (
    row.prefix !== excludedPortPrefix && isOsdProfileSerialProtocol(row.protocolValue)
  ));
}

function isOsdProfileSerialProtocol(protocol: number | null): boolean {
  return OSD_PROFILE_SERIAL_PROTOCOLS.some((candidate) => candidate === protocol);
}

function buildOsdProfileCleanupStagePlan(rows: SerialPortRow[]): MspPortStageTarget[] {
  return rows.flatMap((row) => (
    row.hasProtocolParam
      ? [buildPortTarget(
        row,
        "protocol",
        SERIAL_PROTOCOL_NONE,
        "disable",
        `Disable ${osdProfileProtocolLabel(row.protocolValue)} on ${portLabel(row)}.`,
      )]
      : []
  ));
}

function buildDigitalOsdPortStagePlan(input: {
  ports: SerialPortRow[];
  selectedPortPrefix: string | null;
  protocol: number;
  protocolLabel: string;
}): MspPortStageTarget[] {
  const selectedPortPrefix = input.selectedPortPrefix?.trim();
  const targets = buildOsdProfileCleanupStagePlan(
    osdProfileCleanupRows(input.ports, selectedPortPrefix ?? null),
  );
  if (!selectedPortPrefix) {
    return targets;
  }

  const selectedRow = input.ports.find((row) => row.prefix === selectedPortPrefix);
  if (!selectedRow) {
    return targets;
  }

  if (selectedRow.hasProtocolParam) {
    targets.push(buildPortTarget(selectedRow, "protocol", input.protocol, "enable", `Enable ${input.protocolLabel} on ${portLabel(selectedRow)}.`));
  }
  if (selectedRow.hasBaudParam) {
    targets.push(buildPortTarget(selectedRow, "baud", SERIAL_BAUD_115200, "baud", `Set ${portLabel(selectedRow)} to 115200 baud.`));
  }

  return targets;
}

function osdProfileProtocolLabel(protocol: number | null): string {
  if (protocol === SERIAL_PROTOCOL_DJI_FPV) {
    return OSD_VIDEO_SYSTEM_PROFILES.dji.serialProtocolLabel ?? "DJI FPV / Custom OSD";
  }
  if (protocol === SERIAL_PROTOCOL_DISPLAYPORT) {
    return OSD_VIDEO_SYSTEM_PROFILES.walksnail.serialProtocolLabel ?? "MSP DisplayPort";
  }

  return "OSD profile protocol";
}

function completePlanOrIssues(
  profileId: OsdVideoSystemId,
  selectedPortPrefix: string | null,
  issues: string[],
  buildTargets: () => OsdSetupStageTarget[],
): OsdConfigurationPlan {
  if (issues.length > 0) {
    return {
      profileId,
      selectedPortPrefix,
      canStage: false,
      issues,
      targets: [],
    };
  }

  return {
    profileId,
    selectedPortPrefix,
    canStage: true,
    issues: [],
    targets: buildTargets(),
  };
}

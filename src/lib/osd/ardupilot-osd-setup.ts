import { setBit, type BitIndex } from "../bitmask";
import { ArduPilotSerialProtocol, ArduPilotSerialBaud } from "../ardupilot/serial";
import type { SerialPortRow } from "../setup/serial-port-model";
import {
  readAppliedParameter as liveParamValue,
  readProposedParameter as effectiveParamValue,
  type ParameterValueSource,
} from "../params/parameter-values";
import { ArduPilotOsdType, MspOptionBit, OsdOptionBit } from "../ardupilot/osd";
export {
  readAppliedParameter as liveParamValue,
  readProposedParameter as effectiveParamValue,
} from "../params/parameter-values";

export type OsdVideoSystemId = "analog" | "dji" | "displayport";
export type OsdDetectedState = "disabled" | OsdVideoSystemId | "unknown";

type BitParameterRule = {
  name: "MSP_OPTIONS" | "OSD_OPTIONS";
  edits: readonly { bit: BitIndex; enabled: boolean }[];
  label: string;
  detail: string;
};
type ProfileDefinition = {
  label: string;
  shortLabel: string;
  summary: string;
  backendDetail: string;
  bitRules: readonly BitParameterRule[];
  layoutParams: readonly string[];
  operatorNotes: string[];
} & (
  | { kind: "onboard"; id: "analog"; primaryOsdType: ArduPilotOsdType.Analog }
  | {
      kind: "serial";
      id: "dji";
      primaryOsdType: ArduPilotOsdType.Msp;
      serialProtocol: ArduPilotSerialProtocol.DjiFpv;
      serialProtocolLabel: string;
    }
  | {
      kind: "serial";
      id: "displayport";
      primaryOsdType: ArduPilotOsdType.DisplayPort;
      serialProtocol: ArduPilotSerialProtocol.MspDisplayPort;
      serialProtocolLabel: string;
    }
);
export type OsdVideoSystemProfile = ProfileDefinition & { keyParams: string[] };

function defineProfile<P extends ProfileDefinition>(profile: P): P & { keyParams: string[] } {
  return {
    ...profile,
    keyParams: [
      `OSD_TYPE=${profile.primaryOsdType}`,
      ...(profile.kind === "serial"
        ? [`SERIALn_PROTOCOL=${profile.serialProtocol}`, `SERIALn_BAUD=${ArduPilotSerialBaud.Baud115200}`]
        : []),
      ...profile.bitRules.map(
        (rule) => `${rule.name} ${rule.edits.map((edit) => `bit${edit.bit}=${Number(edit.enabled)}`).join(", ")}`,
      ),
      ...profile.layoutParams,
    ],
  };
}

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

export type OsdSetupValueInput = ParameterValueSource;

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

export const OSD_VIDEO_SYSTEM_PROFILES = {
  analog: defineProfile({
    kind: "onboard",
    id: "analog",
    label: "Analog",
    shortLabel: "Analog",
    summary: "Use the flight controller's onboard MAX7456-style analog overlay. No MSP UART is required.",
    primaryOsdType: ArduPilotOsdType.Analog,
    backendDetail: `Enable onboard analog OSD (OSD_TYPE=${ArduPilotOsdType.Analog}).`,
    bitRules: [],
    layoutParams: ["OSDn_ENABLE", "OSDn_<ITEM>_EN/X/Y"],
    operatorNotes: [
      "Wire camera and VTX video through the flight controller's analog video pads.",
      "Use the layout editor below to enable items and place them on the 30 x 16 style character grid.",
    ],
  }),
  dji: defineProfile({
    kind: "serial",
    id: "dji",
    label: "DJI Stock Custom OSD",
    shortLabel: "DJI",
    summary: "Use DJI FPV/RE/compatible goggles custom OSD over MSP on the UART wired to the air unit.",
    serialProtocol: ArduPilotSerialProtocol.DjiFpv,
    serialProtocolLabel: `DJI FPV / Custom OSD (${ArduPilotSerialProtocol.DjiFpv})`,
    primaryOsdType: ArduPilotOsdType.Msp,
    backendDetail: `Enable MSP OSD backend for DJI Custom OSD (OSD_TYPE=${ArduPilotOsdType.Msp}).`,
    bitRules: [
      {
        name: "MSP_OPTIONS",
        edits: [
          { bit: MspOptionBit.TelemetryMode, enabled: false },
          { bit: MspOptionBit.DjiBetaflightFont, enabled: true },
        ],
        label: "MSP options",
        detail: "Use normal two-wire MSP and DJI/Betaflight font indexes.",
      },
      {
        name: "OSD_OPTIONS",
        edits: [{ bit: OsdOptionBit.TranslateArrows, enabled: true }],
        label: "OSD options",
        detail: "Translate direction arrows for DJI Betaflight-compatible fonts.",
      },
    ],
    layoutParams: [],
    operatorNotes: [
      "Enable Custom OSD in the goggles display menu.",
      "Use both TX and RX between the flight controller UART and the DJI air unit for normal MSP operation.",
    ],
  }),
  displayport: defineProfile({
    kind: "serial",
    id: "displayport",
    label: "MSP DisplayPort",
    shortLabel: "DisplayPort",
    summary: "Use MSP DisplayPort so ArduPilot draws the OSD layout directly on a compatible digital display.",
    serialProtocol: ArduPilotSerialProtocol.MspDisplayPort,
    serialProtocolLabel: `MSP DisplayPort (${ArduPilotSerialProtocol.MspDisplayPort})`,
    primaryOsdType: ArduPilotOsdType.DisplayPort,
    backendDetail: `Enable MSP DisplayPort as the OSD backend (OSD_TYPE=${ArduPilotOsdType.DisplayPort}).`,
    bitRules: [
      {
        name: "MSP_OPTIONS",
        edits: [{ bit: MspOptionBit.TelemetryMode, enabled: false }],
        label: "MSP options",
        detail: "Use normal two-wire MSP DisplayPort instead of one-wire telemetry push mode.",
      },
    ],
    layoutParams: ["OSDn_TXT_RES"],
    operatorNotes: [
      "Wire TX and RX from the selected UART to the DisplayPort VTX or air unit.",
      "Select the connected display target and stage its required text-resolution mode before placing HD items.",
    ],
  }),
} satisfies { [Id in OsdVideoSystemId]: Extract<OsdVideoSystemProfile, { id: Id }> };

export const OSD_VIDEO_SYSTEM_PROFILE_LIST = [
  OSD_VIDEO_SYSTEM_PROFILES.analog,
  OSD_VIDEO_SYSTEM_PROFILES.dji,
  OSD_VIDEO_SYSTEM_PROFILES.displayport,
];

export function detectOsdConfiguration(input: OsdSetupValueInput): {
  state: OsdDetectedState;
  osdType: number | null;
} {
  const osdType = liveParamValue(input.paramStore, "OSD_TYPE");
  if (osdType === ArduPilotOsdType.Disabled) return { state: "disabled", osdType };
  const profile = OSD_VIDEO_SYSTEM_PROFILE_LIST.find((profile) => profile.primaryOsdType === osdType);
  return { state: profile?.id ?? "unknown", osdType };
}

export function buildOsdConfigurationPlan(input: OsdConfigurationPlanInput): OsdConfigurationPlan {
  const selectedPortPrefix = normalizePortPrefix(input.selectedPortPrefix);
  const profile = OSD_VIDEO_SYSTEM_PROFILES[input.profileId];
  const issues = ["OSD_TYPE", ...profile.bitRules.map((rule) => rule.name)]
    .filter((name) => input.paramStore?.params[name] === undefined)
    .map((name) => `${name} is unavailable on this vehicle.`);
  const cleanupRows = osdProfileCleanupRows(input.ports, profile.kind === "serial" ? selectedPortPrefix : null);
  const portTargets: MspPortStageTarget[] = [];

  if (profile.kind === "serial") {
    const selected = input.ports.find((row) => row.prefix === selectedPortPrefix);
    if (selectedPortPrefix === null) issues.push("Select the UART wired to the video system.");
    else if (!selected) issues.push(`${selectedPortPrefix} is unavailable on this vehicle.`);
    else {
      issues.push(...serialFieldTargetIssues(selected, "protocol", profile.serialProtocol));
      issues.push(...serialFieldTargetIssues(selected, "baud", ArduPilotSerialBaud.Baud115200));
      portTargets.push(
        buildPortTarget(
          selected,
          "protocol",
          profile.serialProtocol,
          "enable",
          `Enable ${profile.serialProtocolLabel} on ${portLabel(selected)}.`,
        ),
        buildPortTarget(
          selected,
          "baud",
          ArduPilotSerialBaud.Baud115200,
          "baud",
          `Set ${portLabel(selected)} to 115200 baud.`,
        ),
      );
    }
  }
  for (const row of cleanupRows)
    issues.push(...serialFieldTargetIssues(row, "protocol", ArduPilotSerialProtocol.Disabled));
  return completePlanOrIssues(input.profileId, selectedPortPrefix, issues, () => [
    ...buildOsdProfileStagePlan(input),
    ...buildOsdProfileCleanupStagePlan(cleanupRows),
    ...portTargets,
  ]);
}

export function buildOsdProfileStagePlan(
  input: OsdSetupValueInput & { profileId: OsdVideoSystemId },
): OsdSetupStageTarget[] {
  const profile = OSD_VIDEO_SYSTEM_PROFILES[input.profileId];
  const targets = [buildParamTarget(input, "OSD_TYPE", profile.primaryOsdType, "OSD backend", profile.backendDetail)];
  for (const rule of profile.bitRules) {
    const current = effectiveParamValue(input, rule.name) ?? 0;
    const value = rule.edits.reduce((mask, edit) => setBit(mask, edit.bit, edit.enabled), current);
    targets.push(buildParamTarget(input, rule.name, value, rule.label, rule.detail));
  }
  return targets.filter((target): target is OsdSetupStageTarget => target !== null);
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

function serialFieldTargetIssues(row: SerialPortRow, field: "protocol" | "baud", targetValue: number): string[] {
  const currentValue = field === "protocol" ? row.protocolValue : row.baudValue;
  return currentValue === targetValue ? [] : serialFieldIssues(row, field);
}

function osdProfileCleanupRows(ports: SerialPortRow[], excludedPortPrefix: string | null): SerialPortRow[] {
  return ports.filter((row) => row.prefix !== excludedPortPrefix && isOsdProfileSerialProtocol(row.protocolValue));
}

function isOsdProfileSerialProtocol(protocol: number | null): boolean {
  return OSD_VIDEO_SYSTEM_PROFILE_LIST.some(
    (profile) => profile.kind === "serial" && profile.serialProtocol === protocol,
  );
}

function buildOsdProfileCleanupStagePlan(rows: SerialPortRow[]): MspPortStageTarget[] {
  return rows.flatMap((row) =>
    row.hasProtocolParam
      ? [
          buildPortTarget(
            row,
            "protocol",
            ArduPilotSerialProtocol.Disabled,
            "disable",
            `Disable ${osdProfileProtocolLabel(row.protocolValue)} on ${portLabel(row)}.`,
          ),
        ]
      : [],
  );
}

function osdProfileProtocolLabel(protocol: number | null): string {
  const profile = OSD_VIDEO_SYSTEM_PROFILE_LIST.find(
    (profile) => profile.kind === "serial" && profile.serialProtocol === protocol,
  );
  return profile?.kind === "serial" ? profile.serialProtocolLabel : "OSD profile protocol";
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

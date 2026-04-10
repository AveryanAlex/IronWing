import type { Page } from "@playwright/test";

import type { CalibrationDomain } from "../../src/calibration";
import type { ConfigurationFactsDomain } from "../../src/configuration-facts";
import type {
  MockCommandBehavior,
  MockGuidedStateValue,
  MockInvocation,
  MockLiveVehicleState,
  MockParamProgressState,
  MockParamStoreState,
} from "../../src/platform/mock/backend";
import type { SessionEnvelope } from "../../src/session";
import type { StatusTextDomain } from "../../src/statustext";
import type { SupportDomain } from "../../src/support";
import type { TelemetryDomain, TelemetryState } from "../../src/telemetry";
import {
  connectionSelectors,
  expect,
  openSetupWorkspace,
  parameterReviewRowLocator,
  parameterWorkspaceSelectors,
  setupCalibrationActionLocator,
  setupCalibrationCardLocator,
  setupFrameBannerLocator,
  setupFrameInputLocator,
  setupFrameStageButtonLocator,
  setupMotorsEscBannerLocator,
  setupMotorsEscRowAvailabilityLocator,
  setupMotorsEscRowLocator,
  setupMotorsEscRowResultLocator,
  setupMotorsEscRowReverseLocator,
  setupMotorsEscRowReversedLocator,
  setupMotorsEscRowTestLocator,
  setupNavLocator,
  setupNavGroupProgressLocator,
  setupOverviewCardLocator,
  setupOverviewGroupProgressLocator,
  setupOverviewDocLinkLocator,
  setupOverviewGroupCountLocator,
  setupOverviewMetricLocator,
  setupOverviewQuickActionLocator,
  setupRcBarLocator,
  setupRcInputLocator,
  setupRcPresetLocator,
  setupRcStageButtonLocator,
  setupServoOutputsBannerLocator,
  setupServoOutputsFunctionGroupLocator,
  setupServoOutputsRawAvailabilityLocator,
  setupServoOutputsRawInputLocator,
  setupServoOutputsRawReadbackLocator,
  setupServoOutputsRawRowLocator,
  setupServoOutputsRawSendLocator,
  setupServoOutputsRowLocator,
  setupServoOutputsRowMinLocator,
  setupServoOutputsRowResultLocator,
  setupServoOutputsRowReverseLocator,
  setupServoOutputsRowReversedLocator,
  setupWorkspaceSelectors,
} from "../fixtures/mock-platform";

type SetupParamType = MockParamStoreState["params"][string]["param_type"];
type SetupMetadataOption = { code: number; label: string };
type SetupMetadataParam = {
  name: string;
  humanName: string;
  documentation: string;
  rebootRequired?: boolean;
  unitText?: string;
  values?: SetupMetadataOption[];
  bitmask?: Array<{ bit: number; label: string }>;
};
type SetupParamSeed = {
  name: string;
  value: number;
  param_type?: SetupParamType;
};

type SetupTelemetryOverrides = Omit<Partial<TelemetryDomain>, "value"> & {
  value?: Partial<NonNullable<TelemetryDomain["value"]>>;
};

export type SetupMockPlatform = {
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
  clearCommandBehavior: (cmd: string) => Promise<void>;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  emit: (event: string, payload: unknown) => Promise<void>;
  emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
  emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
  emitLiveTelemetryDomain: (telemetry: TelemetryDomain) => Promise<void>;
  emitLiveSupportDomain: (support: SupportDomain) => Promise<void>;
  emitLiveConfigurationFactsDomain: (facts: ConfigurationFactsDomain) => Promise<void>;
  emitLiveCalibrationDomain: (calibration: CalibrationDomain) => Promise<void>;
  emitLiveStatusTextDomain: (statusText: StatusTextDomain) => Promise<void>;
  getInvocations: () => Promise<MockInvocation[]>;
  getLiveEnvelope: () => Promise<SessionEnvelope | null>;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMetadataXml(vehicle: "ArduCopter" | "ArduPlane", params: SetupMetadataParam[]): string {
  const body = params.map((param) => {
    const fields: string[] = [];
    if (param.rebootRequired) {
      fields.push('    <field name="RebootRequired">true</field>');
    }
    if (param.unitText) {
      fields.push(`    <field name="UnitText">${escapeXml(param.unitText)}</field>`);
    }

    const values = Array.isArray(param.values) && param.values.length > 0
      ? [
          "    <values>",
          ...param.values.map((option) => (
            `      <value code="${option.code}">${escapeXml(option.label)}</value>`
          )),
          "    </values>",
        ]
      : [];
    const bitmask = Array.isArray(param.bitmask) && param.bitmask.length > 0
      ? [
          "    <bitmask>",
          ...param.bitmask.map((option) => (
            `      <bit code="${option.bit}">${escapeXml(option.label)}</bit>`
          )),
          "    </bitmask>",
        ]
      : [];

    const lines = [...fields, ...values, ...bitmask];
    const children = lines.length > 0 ? `\n${lines.join("\n")}\n` : "";

    return `  <param name="${vehicle}:${param.name}" humanName="${escapeXml(param.humanName)}" documentation="${escapeXml(param.documentation)}" user="Standard">${children}  </param>`;
  });

  return `<?xml version="1.0"?>\n<parameters>\n${body.join("\n")}\n</parameters>`;
}

function inferParamType(name: string, value: number): SetupParamType {
  if (!Number.isInteger(value)) {
    return "real32";
  }

  if (name === "COMPASS_DEV_ID") {
    return "uint32";
  }

  if (/^SERVO\d+_(FUNCTION|MIN|MAX|TRIM)$/.test(name) || /^RC1_(MIN|MAX)$/.test(name)) {
    return "int16";
  }

  return "uint8";
}

function buildParamStore(entries: SetupParamSeed[]): MockParamStoreState {
  const params = Object.fromEntries(entries.map((entry, index) => [
    entry.name,
    {
      name: entry.name,
      value: entry.value,
      param_type: entry.param_type ?? inferParamType(entry.name, entry.value),
      index,
    },
  ]));

  return {
    expected_count: entries.length,
    params,
  };
}

function mergeParamSeeds(base: SetupParamSeed[], overrides: Record<string, number>): SetupParamSeed[] {
  const merged = new Map(base.map((entry) => [entry.name, { ...entry }]));

  for (const [name, value] of Object.entries(overrides)) {
    const existing = merged.get(name);
    merged.set(name, {
      name,
      value,
      param_type: existing?.param_type ?? inferParamType(name, value),
    });
  }

  return Array.from(merged.values());
}

const qEnableValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Enabled (QuadPlane)" },
] satisfies SetupMetadataOption[];
const qFrameClassValues = [
  { code: 1, label: "Quad" },
  { code: 10, label: "Custom" },
] satisfies SetupMetadataOption[];
const qFrameTypeValues = [
  { code: 0, label: "Plus" },
  { code: 1, label: "X" },
] satisfies SetupMetadataOption[];
const orientationValues = [
  { code: 0, label: "None" },
  { code: 1, label: "Yaw 45" },
] satisfies SetupMetadataOption[];
const reverseValues = [
  { code: 0, label: "Normal" },
  { code: 1, label: "Reversed" },
] satisfies SetupMetadataOption[];
const gpsTypeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Auto" },
  { code: 5, label: "u-blox" },
] satisfies SetupMetadataOption[];
const gpsAutoSwitchValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Use best" },
  { code: 2, label: "Blend" },
] satisfies SetupMetadataOption[];
const enabledDisabledValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Enabled" },
] satisfies SetupMetadataOption[];
const batteryMonitorValues = [
  { code: 0, label: "Disabled" },
  { code: 3, label: "Analog voltage only" },
  { code: 4, label: "Analog voltage and current" },
  { code: 7, label: "SMBus" },
] satisfies SetupMetadataOption[];
const serialProtocolValues = [
  { code: 0, label: "None" },
  { code: 2, label: "MAVLink2" },
  { code: 5, label: "GPS" },
  { code: 23, label: "RCInput" },
  { code: 28, label: "Scripting" },
] satisfies SetupMetadataOption[];
const serialBaudValues = [
  { code: 38, label: "38400" },
  { code: 57, label: "57600" },
  { code: 115, label: "115200" },
  { code: 921, label: "921600" },
] satisfies SetupMetadataOption[];
const armingRequireValues = [
  { code: 0, label: "Disabled (no arming required)" },
  { code: 1, label: "Throttle-Yaw-Right (rudder arm)" },
  { code: 2, label: "Arm Switch (RC switch)" },
] satisfies SetupMetadataOption[];
const armingCheckBitmaskValues = [
  { bit: 1, label: "Barometer" },
  { bit: 2, label: "Compass" },
  { bit: 3, label: "GPS" },
  { bit: 4, label: "INS" },
  { bit: 5, label: "RC" },
] as const;
const slotBitmaskValues = Array.from({ length: 6 }, (_, index) => ({
  bit: index,
  label: `Slot ${index + 1}`,
}));
const gpsGnssBitmaskValues = [
  { bit: 0, label: "GPS" },
  { bit: 1, label: "SBAS" },
  { bit: 2, label: "Galileo" },
  { bit: 3, label: "BeiDou" },
] as const;
const fenceTypeBitmaskValues = [
  { bit: 0, label: "Alt max" },
  { bit: 1, label: "Circle" },
  { bit: 2, label: "Polygon" },
  { bit: 3, label: "Alt min" },
] as const;
const copterFailsafeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "RTL" },
  { code: 2, label: "Continue Mission (Auto)" },
  { code: 3, label: "Land" },
  { code: 4, label: "SmartRTL → RTL" },
  { code: 5, label: "SmartRTL → Land" },
  { code: 6, label: "Auto DO_LAND_START → RTL" },
  { code: 7, label: "Brake → Land" },
] satisfies SetupMetadataOption[];
const batteryFailsafeValues = [
  { code: 0, label: "Warn Only" },
  { code: 1, label: "Land" },
  { code: 2, label: "RTL" },
  { code: 3, label: "SmartRTL → RTL" },
  { code: 4, label: "SmartRTL → Land" },
  { code: 5, label: "Terminate (dangerous)" },
  { code: 6, label: "Auto DO_LAND_START → RTL" },
  { code: 7, label: "Brake → Land" },
] satisfies SetupMetadataOption[];
const planeLongFailsafeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "RTL" },
] satisfies SetupMetadataOption[];
const planeShortFailsafeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Circle" },
] satisfies SetupMetadataOption[];
const roverFailsafeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "RTL" },
  { code: 2, label: "Hold" },
  { code: 3, label: "SmartRTL → RTL" },
  { code: 4, label: "SmartRTL → Hold" },
] satisfies SetupMetadataOption[];
const rtlAutolandValues = [
  { code: 0, label: "Loiter at home" },
  { code: 1, label: "Land if DO_LAND_START defined" },
  { code: 2, label: "Always land at home" },
] satisfies SetupMetadataOption[];
const fenceActionValues = [
  { code: 0, label: "Report only" },
  { code: 1, label: "RTL / Hold" },
] satisfies SetupMetadataOption[];
const insHntchEnableValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Enabled" },
] satisfies SetupMetadataOption[];
const insHntchModeValues = [
  { code: 0, label: "Fixed" },
  { code: 3, label: "ESC telemetry" },
  { code: 4, label: "Dynamic FFT" },
] satisfies SetupMetadataOption[];
const rangefinderTypeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Analog" },
] satisfies SetupMetadataOption[];
const opticalFlowTypeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "PX4Flow" },
] satisfies SetupMetadataOption[];
const mountTypeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Servo" },
] satisfies SetupMetadataOption[];
const droneCanProtocolValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "DroneCAN" },
] satisfies SetupMetadataOption[];
const efiTypeValues = [
  { code: 0, label: "Disabled" },
  { code: 1, label: "Generic EFI" },
] satisfies SetupMetadataOption[];
const servoFunctionValues = [
  { code: 4, label: "Aileron" },
  { code: 19, label: "Elevator" },
  { code: 21, label: "Rudder" },
  { code: 33, label: "Motor 1" },
  { code: 34, label: "Motor 2" },
  { code: 35, label: "Motor 3" },
  { code: 36, label: "Motor 4" },
  { code: 37, label: "Motor 5" },
  { code: 38, label: "Motor 6" },
  { code: 39, label: "Motor 7" },
  { code: 40, label: "Motor 8" },
  { code: 75, label: "Tilt Front Left" },
  { code: 76, label: "Tilt Front Right" },
  { code: 79, label: "Aileron Right" },
  { code: 88, label: "Elevon Left" },
] satisfies SetupMetadataOption[];

export const setupCopterAvailableModes = [
  { custom_mode: 0, name: "Stabilize" },
  { custom_mode: 2, name: "AltHold" },
  { custom_mode: 3, name: "Auto" },
  { custom_mode: 5, name: "Loiter" },
  { custom_mode: 6, name: "RTL" },
  { custom_mode: 9, name: "Land" },
] as const;

export const setupPlaneAvailableModes = [
  { custom_mode: 0, name: "Manual" },
  { custom_mode: 5, name: "FBW-A" },
  { custom_mode: 6, name: "FBW-B" },
  { custom_mode: 10, name: "Auto" },
  { custom_mode: 11, name: "RTL" },
  { custom_mode: 12, name: "Loiter" },
] as const;

const copterFlightModeValues = setupCopterAvailableModes.map((entry) => ({
  code: entry.custom_mode,
  label: entry.name,
}));
const planeFlightModeValues = setupPlaneAvailableModes.map((entry) => ({
  code: entry.custom_mode,
  label: entry.name,
}));

const REQUIRED_FULL_SETUP_FIXTURE_NAMES = [
  "GPS1_TYPE",
  "BATT_MONITOR",
  "SERIAL1_PROTOCOL",
  "FLTMODE1",
  "FS_THR_ENABLE",
  "RTL_ALT",
  "FENCE_ENABLE",
  "ARMING_REQUIRE",
  "MOT_THST_EXPO",
  "ATC_RAT_RLL_P",
  "RNGFND1_TYPE",
  "COMPASS_ENABLE",
] as const;
const REQUIRED_PLANE_FIXTURE_NAMES = [
  "Q_ENABLE",
  "Q_FRAME_CLASS",
  "Q_FRAME_TYPE",
  "Q_TILT_ENABLE",
  "Q_TAILSIT_ENABLE",
] as const;

function assertFixtureCoverage(fixtureName: string, requiredNames: readonly string[], availableNames: Iterable<string>) {
  const available = new Set(availableNames);
  const missing = requiredNames.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`${fixtureName} is missing required setup fixture rows: ${missing.join(", ")}`);
  }
}

function assertAvailableModesFixture(
  fixtureName: string,
  modes: ReadonlyArray<{ custom_mode: number; name: string }>,
) {
  const malformed = modes.filter((entry, index, values) => {
    const duplicate = values.findIndex((candidate) => candidate.custom_mode === entry.custom_mode) !== index;
    return !Number.isInteger(entry.custom_mode) || entry.name.trim().length === 0 || duplicate;
  });

  if (modes.length === 0 || malformed.length > 0) {
    throw new Error(`${fixtureName} is malformed. Expected unique integer custom_mode rows with non-empty names.`);
  }
}

function numericParam(
  name: string,
  humanName: string,
  documentation: string,
  options: { unitText?: string; rebootRequired?: boolean } = {},
): SetupMetadataParam {
  return {
    name,
    humanName,
    documentation,
    unitText: options.unitText,
    rebootRequired: options.rebootRequired,
  } satisfies SetupMetadataParam;
}

function enumParam(
  name: string,
  humanName: string,
  documentation: string,
  values: SetupMetadataOption[],
  options: { rebootRequired?: boolean; unitText?: string } = {},
): SetupMetadataParam {
  return {
    name,
    humanName,
    documentation,
    values,
    rebootRequired: options.rebootRequired,
    unitText: options.unitText,
  } satisfies SetupMetadataParam;
}

function bitmaskParam(
  name: string,
  humanName: string,
  documentation: string,
  bitmask: Array<{ bit: number; label: string }>,
  options: { rebootRequired?: boolean; unitText?: string } = {},
): SetupMetadataParam {
  return {
    name,
    humanName,
    documentation,
    bitmask,
    rebootRequired: options.rebootRequired,
    unitText: options.unitText,
  } satisfies SetupMetadataParam;
}

function createServoMetadata(maxServo = 17): SetupMetadataParam[] {
  const params: SetupMetadataParam[] = [];

  for (let index = 1; index <= maxServo; index += 1) {
    params.push(
      enumParam(`SERVO${index}_FUNCTION`, `Servo ${index} function`, `Assigned output function for SERVO${index}.`, servoFunctionValues),
      numericParam(`SERVO${index}_MIN`, `Servo ${index} min`, `Minimum PWM for SERVO${index}.`, { unitText: "µs" }),
      numericParam(`SERVO${index}_MAX`, `Servo ${index} max`, `Maximum PWM for SERVO${index}.`, { unitText: "µs" }),
      numericParam(`SERVO${index}_TRIM`, `Servo ${index} trim`, `Trim PWM for SERVO${index}.`, { unitText: "µs" }),
      enumParam(`SERVO${index}_REVERSED`, `Servo ${index} reversed`, `Reverse the direction of SERVO${index}.`, reverseValues),
    );
  }

  return params;
}

function createSerialMetadata(maxIndex = 9): SetupMetadataParam[] {
  const params: SetupMetadataParam[] = [];

  for (let index = 0; index <= maxIndex; index += 1) {
    params.push(
      enumParam(`SERIAL${index}_PROTOCOL`, `SERIAL${index} protocol`, `Protocol selection for SERIAL${index}.`, serialProtocolValues, { rebootRequired: true }),
      enumParam(`SERIAL${index}_BAUD`, `SERIAL${index} baud`, `Baud selection for SERIAL${index}.`, serialBaudValues, { rebootRequired: true }),
    );
  }

  return params;
}

function createRatePidMetadata(prefix: string, axisLabel: string): SetupMetadataParam[] {
  return [
    numericParam(`${prefix}_P`, `${axisLabel} P`, `${axisLabel} proportional gain.`),
    numericParam(`${prefix}_I`, `${axisLabel} I`, `${axisLabel} integral gain.`),
    numericParam(`${prefix}_D`, `${axisLabel} D`, `${axisLabel} derivative gain.`),
    numericParam(`${prefix}_FF`, `${axisLabel} feed-forward`, `${axisLabel} feed-forward gain.`),
    numericParam(`${prefix}_FLTD`, `${axisLabel} D filter`, `${axisLabel} derivative filter bandwidth.`, { unitText: "Hz" }),
    numericParam(`${prefix}_FLTE`, `${axisLabel} error filter`, `${axisLabel} error filter bandwidth.`, { unitText: "Hz" }),
    numericParam(`${prefix}_FLTT`, `${axisLabel} target filter`, `${axisLabel} target filter bandwidth.`, { unitText: "Hz" }),
    numericParam(`${prefix}_IMAX`, `${axisLabel} I max`, `${axisLabel} integrator clamp.`),
  ];
}

function createCommonSetupMetadataParams(modeValues: SetupMetadataOption[]): SetupMetadataParam[] {
  return [
    enumParam("FRAME_CLASS", "Frame class", "Vehicle frame family.", [
      { code: 1, label: "Quad" },
      { code: 2, label: "Hexa" },
      { code: 12, label: "Dodecahexa" },
    ], { rebootRequired: true }),
    enumParam("FRAME_TYPE", "Frame type", "Vehicle frame layout.", [
      { code: 0, label: "Plus" },
      { code: 1, label: "X" },
    ], { rebootRequired: true }),
    enumParam("AHRS_ORIENTATION", "Board orientation", "Autopilot board orientation.", orientationValues, { rebootRequired: true }),
    enumParam("GPS1_TYPE", "GPS 1 type", "Primary GPS receiver type.", gpsTypeValues),
    enumParam("GPS_TYPE", "GPS type", "Legacy primary GPS receiver type.", gpsTypeValues),
    enumParam("GPS2_TYPE", "GPS 2 type", "Secondary GPS receiver type.", gpsTypeValues),
    enumParam("GPS_AUTO_SWITCH", "GPS auto switch", "How the autopilot switches between GPS receivers.", gpsAutoSwitchValues),
    enumParam("GPS_AUTO_CONFIG", "GPS auto config", "Automatically configure the attached GPS receiver on boot.", enabledDisabledValues),
    bitmaskParam("GPS_GNSS_MODE", "GNSS constellation mask", "Select which GNSS constellations remain enabled.", [...gpsGnssBitmaskValues]),
    enumParam("BATT_MONITOR", "Battery monitor", "Primary battery monitor backend.", batteryMonitorValues),
    enumParam("BATT2_MONITOR", "Battery 2 monitor", "Secondary battery monitor backend.", batteryMonitorValues),
    numericParam("BATT_VOLT_PIN", "Voltage pin", "Analog voltage sense pin."),
    numericParam("BATT_CURR_PIN", "Current pin", "Analog current sense pin."),
    numericParam("BATT_VOLT_MULT", "Voltage multiplier", "Voltage scaling multiplier."),
    numericParam("BATT_AMP_PERVLT", "Amps per volt", "Current scaling in amps per volt."),
    numericParam("BATT_CAPACITY", "Battery capacity", "Configured pack capacity.", { unitText: "mAh" }),
    numericParam("BATT_ARM_VOLT", "Arm voltage", "Minimum arm voltage threshold.", { unitText: "V" }),
    numericParam("BATT_LOW_VOLT", "Low voltage", "Low-voltage failsafe threshold.", { unitText: "V" }),
    numericParam("BATT_CRT_VOLT", "Critical voltage", "Critical-voltage failsafe threshold.", { unitText: "V" }),
    ...createSerialMetadata(),
    bitmaskParam("ARMING_CHECK", "Arming checks", "Controls which pre-arm checks remain enabled.", [...armingCheckBitmaskValues]),
    enumParam("ARMING_REQUIRE", "Arming method", "How the vehicle can be armed before flight.", armingRequireValues),
    numericParam("FLTMODE_CH", "Flight-mode channel", "RC channel used to select the six flight-mode slots."),
    ...Array.from({ length: 6 }, (_, index) => enumParam(
      `FLTMODE${index + 1}`,
      `Flight mode ${index + 1}`,
      `Configured flight mode for slot ${index + 1}.`,
      modeValues,
    )),
    bitmaskParam("SIMPLE", "Simple mode mask", "Mode slots that use Simple mode heading behavior.", slotBitmaskValues),
    bitmaskParam("SUPER_SIMPLE", "Super Simple mode mask", "Mode slots that use Super Simple home-relative behavior.", slotBitmaskValues),
    enumParam("FS_THR_ENABLE", "Throttle failsafe", "Select the copter radio failsafe behavior.", copterFailsafeValues),
    numericParam("FS_THR_VALUE", "Throttle PWM threshold", "PWM threshold that trips the throttle failsafe.", { unitText: "PWM" }),
    enumParam("FS_GCS_ENABLE", "GCS failsafe", "Select the copter ground-control-station failsafe behavior.", copterFailsafeValues),
    enumParam("FS_EKF_ACTION", "EKF failsafe", "Action taken when EKF health falls below the configured threshold.", [
      { code: 0, label: "Disabled" },
      { code: 1, label: "Land" },
      { code: 2, label: "AltHold" },
      { code: 3, label: "Land even in Stabilize" },
    ]),
    numericParam("FS_EKF_THRESH", "EKF threshold", "Variance threshold that trips the EKF failsafe."),
    enumParam("FS_CRASH_CHECK", "Crash detection", "Automatically disarm after a detected crash event.", enabledDisabledValues),
    enumParam("BATT_FS_LOW_ACT", "Low-battery action", "Action taken when the battery reaches the low threshold.", batteryFailsafeValues),
    numericParam("BATT_LOW_MAH", "Low mAh remaining", "Remaining capacity threshold for the low-battery action.", { unitText: "mAh" }),
    enumParam("BATT_FS_CRT_ACT", "Critical-battery action", "Action taken when the battery reaches the critical threshold.", batteryFailsafeValues),
    numericParam("BATT_CRT_MAH", "Critical mAh remaining", "Remaining capacity threshold for the critical battery action.", { unitText: "mAh" }),
    enumParam("THR_FAILSAFE", "Plane throttle failsafe", "Enable or disable the plane radio failsafe.", enabledDisabledValues),
    numericParam("THR_FS_VALUE", "Plane throttle PWM threshold", "PWM threshold that trips the plane throttle failsafe.", { unitText: "PWM" }),
    enumParam("FS_LONG_ACTN", "Plane long failsafe", "Action taken when the plane long GCS failsafe triggers.", planeLongFailsafeValues),
    enumParam("FS_SHORT_ACTN", "Plane short failsafe", "Action taken when the plane short GCS failsafe triggers.", planeShortFailsafeValues),
    enumParam("FS_ACTION", "Rover failsafe action", "Combined radio/GCS failsafe action for rover families.", roverFailsafeValues),
    numericParam("FS_TIMEOUT", "Failsafe timeout", "Combined rover timeout before the failsafe action triggers.", { unitText: "s" }),
    numericParam("RTL_ALT", "RTL altitude", "Copter return altitude.", { unitText: "cm" }),
    numericParam("RTL_ALT_FINAL", "RTL final altitude", "Copter final RTL altitude.", { unitText: "cm" }),
    numericParam("RTL_CLIMB_MIN", "RTL minimum climb", "Minimum RTL climb height.", { unitText: "cm" }),
    numericParam("RTL_SPEED", "RTL speed", "Return-home speed.", { unitText: "cm/s" }),
    numericParam("RTL_LOIT_TIME", "RTL loiter time", "RTL loiter time before descent.", { unitText: "ms" }),
    numericParam("ALT_HOLD_RTL", "RTL altitude hold", "Plane RTL altitude target.", { unitText: "cm" }),
    enumParam("RTL_AUTOLAND", "RTL auto-land", "How Plane RTL finishes after reaching home.", rtlAutolandValues),
    numericParam("WP_RADIUS", "Waypoint radius", "Arrival radius used for return and fence workflows.", { unitText: "m" }),
    enumParam("FENCE_ENABLE", "Fence enable", "Turn geofence enforcement on or off.", enabledDisabledValues),
    bitmaskParam("FENCE_TYPE", "Fence type", "Boundary types enforced by the current geofence.", [...fenceTypeBitmaskValues]),
    enumParam("FENCE_ACTION", "Fence breach action", "Action taken when the vehicle breaches the configured geofence.", fenceActionValues),
    numericParam("FENCE_ALT_MAX", "Fence max altitude", "Maximum allowed geofence altitude.", { unitText: "m" }),
    numericParam("FENCE_ALT_MIN", "Fence min altitude", "Minimum allowed geofence altitude.", { unitText: "m" }),
    numericParam("FENCE_RADIUS", "Fence radius", "Circular fence radius.", { unitText: "m" }),
    numericParam("FENCE_MARGIN", "Fence margin", "Fence breach margin.", { unitText: "m" }),
    numericParam("RCMAP_ROLL", "Roll", "Primary roll channel.", { rebootRequired: true }),
    numericParam("RCMAP_PITCH", "Pitch", "Primary pitch channel.", { rebootRequired: true }),
    numericParam("RCMAP_THROTTLE", "Throttle", "Primary throttle channel.", { rebootRequired: true }),
    numericParam("RCMAP_YAW", "Yaw", "Primary yaw channel.", { rebootRequired: true }),
    numericParam("INS_ACCOFFS_X", "Accel X Offset", "Accelerometer X offset.", { unitText: "m/s²" }),
    numericParam("INS_ACCOFFS_Y", "Accel Y Offset", "Accelerometer Y offset.", { unitText: "m/s²" }),
    numericParam("INS_ACCOFFS_Z", "Accel Z Offset", "Accelerometer Z offset.", { unitText: "m/s²" }),
    numericParam("COMPASS_DEV_ID", "Compass Device", "Primary compass device id."),
    numericParam("RC1_MIN", "CH1 Min", "Channel 1 minimum PWM.", { unitText: "µs" }),
    numericParam("RC1_MAX", "CH1 Max", "Channel 1 maximum PWM.", { unitText: "µs" }),
    numericParam("MOT_THST_EXPO", "Thrust expo", "Multirotor thrust curve compensation."),
    numericParam("MOT_THST_HOVER", "Hover thrust", "Estimated hover throttle."),
    numericParam("MOT_BAT_VOLT_MAX", "Motor battery max", "Maximum battery voltage used for compensation.", { unitText: "V" }),
    numericParam("MOT_BAT_VOLT_MIN", "Motor battery min", "Minimum battery voltage used for compensation.", { unitText: "V" }),
    numericParam("INS_GYRO_FILTER", "Gyro low-pass", "Primary gyro filter bandwidth.", { unitText: "Hz" }),
    numericParam("INS_ACCEL_FILTER", "Accelerometer low-pass", "Primary accelerometer filter bandwidth.", { unitText: "Hz" }),
    numericParam("ATC_ACCEL_P_MAX", "Pitch accel max", "Pitch acceleration limit."),
    numericParam("ATC_ACCEL_R_MAX", "Roll accel max", "Roll acceleration limit."),
    numericParam("ATC_ACCEL_Y_MAX", "Yaw accel max", "Yaw acceleration limit."),
    numericParam("ATC_THR_MIX_MAN", "Throttle mix manual", "Manual throttle mixing."),
    numericParam("ACRO_YAW_P", "Acro yaw P", "Acro yaw response gain."),
    ...createRatePidMetadata("ATC_RAT_RLL", "Roll rate"),
    ...createRatePidMetadata("ATC_RAT_PIT", "Pitch rate"),
    ...createRatePidMetadata("ATC_RAT_YAW", "Yaw rate"),
    numericParam("ATC_ANG_RLL_P", "Angle roll P", "Outer-loop roll angle gain."),
    numericParam("ATC_ANG_PIT_P", "Angle pitch P", "Outer-loop pitch angle gain."),
    numericParam("ATC_ANG_YAW_P", "Angle yaw P", "Outer-loop yaw angle gain."),
    numericParam("PSC_ACCZ_P", "Accel Z P", "Vertical acceleration proportional gain."),
    numericParam("PSC_ACCZ_I", "Accel Z I", "Vertical acceleration integral gain."),
    numericParam("PSC_ACCZ_D", "Accel Z D", "Vertical acceleration derivative gain."),
    numericParam("PSC_VELZ_P", "Velocity Z P", "Vertical velocity proportional gain."),
    numericParam("PSC_POSZ_P", "Position Z P", "Vertical position proportional gain."),
    numericParam("PSC_VELXY_P", "Velocity XY P", "Horizontal velocity proportional gain."),
    numericParam("PSC_VELXY_I", "Velocity XY I", "Horizontal velocity integral gain."),
    numericParam("PSC_VELXY_D", "Velocity XY D", "Horizontal velocity derivative gain."),
    numericParam("PSC_POSXY_P", "Position XY P", "Horizontal position proportional gain."),
    enumParam("INS_HNTCH_ENABLE", "Harmonic notch enable", "Enable the harmonic notch filter.", insHntchEnableValues),
    enumParam("INS_HNTCH_MODE", "Harmonic notch mode", "Select the notch-frequency source.", insHntchModeValues),
    numericParam("INS_HNTCH_FREQ", "Harmonic notch frequency", "Primary harmonic notch center frequency.", { unitText: "Hz" }),
    numericParam("INS_HNTCH_BW", "Harmonic notch bandwidth", "Primary harmonic notch bandwidth.", { unitText: "Hz" }),
    numericParam("INS_HNTCH_REF", "Harmonic notch reference", "Primary harmonic notch reference."),
    enumParam("RNGFND1_TYPE", "Rangefinder 1 type", "Primary rangefinder backend.", rangefinderTypeValues),
    numericParam("RNGFND1_MIN_CM", "Rangefinder 1 minimum", "Minimum measurable range.", { unitText: "cm" }),
    numericParam("RNGFND1_MAX_CM", "Rangefinder 1 maximum", "Maximum measurable range.", { unitText: "cm" }),
    enumParam("FLOW_TYPE", "Optical-flow type", "Primary optical-flow backend.", opticalFlowTypeValues),
    numericParam("FLOW_ORIENT_YAW", "Optical-flow yaw", "Optical-flow yaw orientation.", { unitText: "deg" }),
    enumParam("MNT1_TYPE", "Mount 1 type", "Primary gimbal backend.", mountTypeValues),
    numericParam("MNT1_RC_RATE", "Mount 1 RC rate", "Primary gimbal RC rate."),
    enumParam("COMPASS_ENABLE", "Compass enable", "Enable the primary compass family.", enabledDisabledValues),
    enumParam("COMPASS_USE", "Compass use", "Use the primary compass for navigation.", enabledDisabledValues),
    enumParam("CAN_D1_PROTOCOL", "CAN D1 protocol", "Protocol on DroneCAN port 1.", droneCanProtocolValues),
    enumParam("CAN_P1_DRIVER", "CAN P1 driver", "Driver selection for CAN peripheral port 1.", enabledDisabledValues),
    enumParam("EFI_TYPE", "EFI type", "Electronic fuel injection backend.", efiTypeValues),
    numericParam("EFI_COEF1", "EFI coefficient 1", "Primary EFI coefficient."),
    numericParam("EFI_COEF2", "EFI coefficient 2", "Secondary EFI coefficient."),
    ...createServoMetadata(),
  ];
}

function createPlaneSetupMetadataParams(): SetupMetadataParam[] {
  return [
    ...createCommonSetupMetadataParams(planeFlightModeValues),
    enumParam("Q_ENABLE", "QuadPlane enable", "Enable QuadPlane-specific VTOL parameters on Plane firmware.", qEnableValues, { rebootRequired: true }),
    enumParam("Q_FRAME_CLASS", "QuadPlane frame class", "QuadPlane lift-motor frame family.", qFrameClassValues, { rebootRequired: true }),
    enumParam("Q_FRAME_TYPE", "QuadPlane frame type", "QuadPlane lift-motor layout.", qFrameTypeValues, { rebootRequired: true }),
    enumParam("Q_TILT_ENABLE", "Tilt-rotor enable", "Enable tilt-rotor behavior for QuadPlane layouts.", enabledDisabledValues),
    enumParam("Q_TAILSIT_ENABLE", "Tailsitter enable", "Enable tailsitter behavior for QuadPlane layouts.", enabledDisabledValues),
    ...createRatePidMetadata("Q_A_RAT_RLL", "VTOL roll rate"),
    ...createRatePidMetadata("Q_A_RAT_PIT", "VTOL pitch rate"),
    ...createRatePidMetadata("Q_A_RAT_YAW", "VTOL yaw rate"),
    numericParam("Q_A_ACCEL_P_MAX", "VTOL pitch accel max", "VTOL pitch acceleration limit."),
    numericParam("Q_A_ACCEL_R_MAX", "VTOL roll accel max", "VTOL roll acceleration limit."),
    numericParam("Q_A_ACCEL_Y_MAX", "VTOL yaw accel max", "VTOL yaw acceleration limit."),
    numericParam("Q_A_THR_MIX_MAN", "VTOL throttle mix manual", "VTOL manual throttle mixing."),
    numericParam("Q_M_THST_EXPO", "VTOL thrust expo", "QuadPlane lift-motor thrust curve compensation."),
    numericParam("Q_M_THST_HOVER", "VTOL hover thrust", "QuadPlane lift-motor hover throttle."),
    numericParam("Q_M_BAT_VOLT_MAX", "VTOL battery max", "Maximum QuadPlane lift-motor compensation voltage.", { unitText: "V" }),
    numericParam("Q_M_BAT_VOLT_MIN", "VTOL battery min", "Minimum QuadPlane lift-motor compensation voltage.", { unitText: "V" }),
  ];
}

const setupCopterMetadataParams = createCommonSetupMetadataParams(copterFlightModeValues);
const setupPlaneMetadataParams = createPlaneSetupMetadataParams();

assertFixtureCoverage(
  "ArduCopter setup metadata",
  REQUIRED_FULL_SETUP_FIXTURE_NAMES,
  setupCopterMetadataParams.map((param) => param.name),
);
assertFixtureCoverage(
  "ArduPlane setup metadata",
  [...REQUIRED_FULL_SETUP_FIXTURE_NAMES, ...REQUIRED_PLANE_FIXTURE_NAMES],
  setupPlaneMetadataParams.map((param) => param.name),
);
assertAvailableModesFixture("ArduCopter availableModes fixture", setupCopterAvailableModes);
assertAvailableModesFixture("ArduPlane availableModes fixture", setupPlaneAvailableModes);

export const setupParamMetadataXml = buildMetadataXml("ArduCopter", setupCopterMetadataParams);
export const setupPlaneParamMetadataXml = buildMetadataXml("ArduPlane", setupPlaneMetadataParams);

const setupParamStoreEntries: SetupParamSeed[] = [
  { name: "FRAME_CLASS", value: 1 },
  { name: "FRAME_TYPE", value: 1 },
  { name: "AHRS_ORIENTATION", value: 0 },
  { name: "GPS1_TYPE", value: 1 },
  { name: "GPS_AUTO_CONFIG", value: 1 },
  { name: "GPS_GNSS_MODE", value: 5 },
  { name: "GPS2_TYPE", value: 0 },
  { name: "GPS_AUTO_SWITCH", value: 1 },
  { name: "BATT_MONITOR", value: 4 },
  { name: "BATT_VOLT_PIN", value: 2 },
  { name: "BATT_CURR_PIN", value: 3 },
  { name: "BATT_VOLT_MULT", value: 10.101 },
  { name: "BATT_AMP_PERVLT", value: 18.002 },
  { name: "BATT_CAPACITY", value: 5200 },
  { name: "BATT_ARM_VOLT", value: 13.3 },
  { name: "BATT_LOW_VOLT", value: 14.4 },
  { name: "BATT_CRT_VOLT", value: 14.0 },
  { name: "BATT2_MONITOR", value: 0 },
  { name: "SERIAL1_PROTOCOL", value: 23 },
  { name: "SERIAL1_BAUD", value: 57 },
  { name: "SERIAL2_PROTOCOL", value: 2 },
  { name: "SERIAL2_BAUD", value: 57 },
  { name: "SERIAL3_PROTOCOL", value: 5 },
  { name: "SERIAL3_BAUD", value: 115 },
  { name: "ARMING_CHECK", value: 1 },
  { name: "ARMING_REQUIRE", value: 1 },
  { name: "FLTMODE_CH", value: 5 },
  { name: "FLTMODE1", value: 0 },
  { name: "FLTMODE2", value: 2 },
  { name: "FLTMODE3", value: 5 },
  { name: "FLTMODE4", value: 6 },
  { name: "FLTMODE5", value: 9 },
  { name: "FLTMODE6", value: 3 },
  { name: "SIMPLE", value: 0 },
  { name: "SUPER_SIMPLE", value: 0 },
  { name: "FS_THR_ENABLE", value: 1 },
  { name: "FS_THR_VALUE", value: 975 },
  { name: "FS_GCS_ENABLE", value: 1 },
  { name: "FS_EKF_ACTION", value: 1 },
  { name: "FS_EKF_THRESH", value: 0.8 },
  { name: "FS_CRASH_CHECK", value: 1 },
  { name: "BATT_FS_LOW_ACT", value: 2 },
  { name: "BATT_LOW_MAH", value: 1200 },
  { name: "BATT_FS_CRT_ACT", value: 1 },
  { name: "BATT_CRT_MAH", value: 500 },
  { name: "THR_FAILSAFE", value: 1 },
  { name: "THR_FS_VALUE", value: 950 },
  { name: "FS_LONG_ACTN", value: 1 },
  { name: "FS_SHORT_ACTN", value: 1 },
  { name: "FS_ACTION", value: 1 },
  { name: "FS_TIMEOUT", value: 5 },
  { name: "RTL_ALT", value: 1500 },
  { name: "RTL_ALT_FINAL", value: 0 },
  { name: "RTL_CLIMB_MIN", value: 0 },
  { name: "RTL_SPEED", value: 500 },
  { name: "RTL_LOIT_TIME", value: 5000 },
  { name: "ALT_HOLD_RTL", value: -1 },
  { name: "RTL_AUTOLAND", value: 0 },
  { name: "WP_RADIUS", value: 2 },
  { name: "FENCE_ENABLE", value: 1 },
  { name: "FENCE_TYPE", value: 0b0111 },
  { name: "FENCE_ACTION", value: 1 },
  { name: "FENCE_ALT_MAX", value: 120 },
  { name: "FENCE_ALT_MIN", value: 20 },
  { name: "FENCE_RADIUS", value: 300 },
  { name: "FENCE_MARGIN", value: 5 },
  { name: "RCMAP_ROLL", value: 1 },
  { name: "RCMAP_PITCH", value: 2 },
  { name: "RCMAP_THROTTLE", value: 3 },
  { name: "RCMAP_YAW", value: 4 },
  { name: "INS_ACCOFFS_X", value: 0 },
  { name: "INS_ACCOFFS_Y", value: 0 },
  { name: "INS_ACCOFFS_Z", value: 0 },
  { name: "COMPASS_DEV_ID", value: 12345 },
  { name: "RC1_MIN", value: 1000 },
  { name: "RC1_MAX", value: 2000 },
  { name: "MOT_THST_EXPO", value: 0.42 },
  { name: "MOT_THST_HOVER", value: 0.25 },
  { name: "MOT_BAT_VOLT_MAX", value: 16.2 },
  { name: "MOT_BAT_VOLT_MIN", value: 13.2 },
  { name: "INS_GYRO_FILTER", value: 20 },
  { name: "INS_ACCEL_FILTER", value: 20 },
  { name: "ATC_RAT_PIT_FLTD", value: 15 },
  { name: "ATC_RAT_PIT_FLTE", value: 5 },
  { name: "ATC_RAT_PIT_FLTT", value: 15 },
  { name: "ATC_RAT_RLL_FLTD", value: 15 },
  { name: "ATC_RAT_RLL_FLTE", value: 5 },
  { name: "ATC_RAT_RLL_FLTT", value: 15 },
  { name: "ATC_RAT_YAW_FLTD", value: 0 },
  { name: "ATC_RAT_YAW_FLTE", value: 2 },
  { name: "ATC_RAT_YAW_FLTT", value: 10 },
  { name: "ATC_ACCEL_P_MAX", value: 8000 },
  { name: "ATC_ACCEL_R_MAX", value: 8000 },
  { name: "ATC_ACCEL_Y_MAX", value: 8000 },
  { name: "ATC_THR_MIX_MAN", value: 0.2 },
  { name: "ACRO_YAW_P", value: 0.8 },
  { name: "ATC_RAT_RLL_P", value: 0.11 },
  { name: "ATC_RAT_RLL_I", value: 0.12 },
  { name: "ATC_RAT_RLL_D", value: 0.004 },
  { name: "ATC_RAT_RLL_FF", value: 0.15 },
  { name: "ATC_RAT_PIT_P", value: 0.11 },
  { name: "ATC_RAT_PIT_I", value: 0.12 },
  { name: "ATC_RAT_PIT_D", value: 0.004 },
  { name: "ATC_RAT_PIT_FF", value: 0.15 },
  { name: "ATC_RAT_YAW_P", value: 0.18 },
  { name: "ATC_RAT_YAW_I", value: 0.12 },
  { name: "ATC_RAT_YAW_D", value: 0.001 },
  { name: "ATC_RAT_YAW_FF", value: 0.05 },
  { name: "ATC_ANG_RLL_P", value: 4.5 },
  { name: "ATC_ANG_PIT_P", value: 4.5 },
  { name: "ATC_ANG_YAW_P", value: 4.0 },
  { name: "PSC_ACCZ_P", value: 0.3 },
  { name: "PSC_ACCZ_I", value: 0.4 },
  { name: "PSC_ACCZ_D", value: 0.01 },
  { name: "PSC_VELZ_P", value: 5.0 },
  { name: "PSC_POSZ_P", value: 1.0 },
  { name: "PSC_VELXY_P", value: 1.5 },
  { name: "PSC_VELXY_I", value: 0.5 },
  { name: "PSC_VELXY_D", value: 0.2 },
  { name: "PSC_POSXY_P", value: 1.0 },
  { name: "INS_HNTCH_ENABLE", value: 1 },
  { name: "INS_HNTCH_MODE", value: 3 },
  { name: "INS_HNTCH_FREQ", value: 90 },
  { name: "INS_HNTCH_BW", value: 45 },
  { name: "INS_HNTCH_REF", value: 1.0 },
  { name: "RNGFND1_TYPE", value: 1 },
  { name: "RNGFND1_MIN_CM", value: 20 },
  { name: "RNGFND1_MAX_CM", value: 400 },
  { name: "FLOW_TYPE", value: 0 },
  { name: "FLOW_ORIENT_YAW", value: 0 },
  { name: "MNT1_TYPE", value: 0 },
  { name: "MNT1_RC_RATE", value: 10 },
  { name: "COMPASS_ENABLE", value: 1 },
  { name: "COMPASS_USE", value: 1 },
  { name: "CAN_D1_PROTOCOL", value: 0 },
  { name: "CAN_P1_DRIVER", value: 0 },
  { name: "EFI_TYPE", value: 1 },
  { name: "EFI_COEF1", value: 1.2 },
  { name: "EFI_COEF2", value: 0.8 },
];

assertFixtureCoverage(
  "Full setup param-store fixture",
  REQUIRED_FULL_SETUP_FIXTURE_NAMES,
  setupParamStoreEntries.map((entry) => entry.name),
);

export function createFullExpertSetupParamStore(overrides: Record<string, number> = {}): MockParamStoreState {
  return buildParamStore(mergeParamSeeds(setupParamStoreEntries, overrides));
}

export const setupConnectedVehicleState: MockLiveVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "LOITER",
  system_status: "STANDBY",
  vehicle_type: "quadrotor",
  autopilot: "ardu_pilot_mega",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
};

export const setupPlaneVehicleState: MockLiveVehicleState = {
  ...setupConnectedVehicleState,
  mode_name: "FBWA",
  vehicle_type: "fixed_wing",
};

export const setupMetadataUnavailableVehicleState: MockLiveVehicleState = {
  ...setupConnectedVehicleState,
  vehicle_type: "submarine",
};

export const setupGuidedState: MockGuidedStateValue = {
  status: "blocked",
  session: null,
  entered_at_unix_msec: null,
  blocking_reason: "vehicle_disarmed",
  termination: null,
  last_command: null,
  actions: {
    start: { allowed: false, blocking_reason: "vehicle_disarmed" },
    update: { allowed: false, blocking_reason: "vehicle_disarmed" },
    stop: { allowed: false, blocking_reason: "live_session_required" },
  },
};

export const setupParamStore: MockParamStoreState = createFullExpertSetupParamStore();

export function createPlainPlaneSetupParamStore(overrides: Record<string, number> = {}): MockParamStoreState {
  return buildParamStore(mergeParamSeeds([
    { name: "Q_ENABLE", value: 0 },
    { name: "AHRS_ORIENTATION", value: 0 },
  ], overrides));
}

export function createQuadPlaneSetupParamStore(overrides: Record<string, number> = {}): MockParamStoreState {
  return buildParamStore(mergeParamSeeds([
    { name: "Q_ENABLE", value: 1 },
    { name: "Q_FRAME_CLASS", value: 1 },
    { name: "Q_FRAME_TYPE", value: 1 },
    { name: "Q_TILT_ENABLE", value: 0 },
    { name: "Q_TAILSIT_ENABLE", value: 0 },
    { name: "AHRS_ORIENTATION", value: 0 },
    { name: "SERVO1_FUNCTION", value: 33 },
    { name: "SERVO1_REVERSED", value: 0 },
    { name: "SERVO2_FUNCTION", value: 34 },
    { name: "SERVO2_REVERSED", value: 0 },
    { name: "SERVO3_FUNCTION", value: 35 },
    { name: "SERVO3_REVERSED", value: 0 },
    { name: "SERVO4_FUNCTION", value: 36 },
    { name: "SERVO4_REVERSED", value: 0 },
  ], overrides));
}

export function createDodecahexaMotorSetupParamStore(overrides: Record<string, number> = {}): MockParamStoreState {
  const seeds: SetupParamSeed[] = [
    { name: "FRAME_CLASS", value: 12 },
    { name: "FRAME_TYPE", value: 0 },
    { name: "AHRS_ORIENTATION", value: 0 },
  ];

  for (let index = 1; index <= 12; index += 1) {
    seeds.push(
      { name: `SERVO${index}_FUNCTION`, value: 32 + index },
      { name: `SERVO${index}_REVERSED`, value: 0 },
    );
  }

  return buildParamStore(mergeParamSeeds(seeds, overrides));
}

export function createTailsitterServoSetupParamStore(overrides: Record<string, number> = {}): MockParamStoreState {
  return buildParamStore(mergeParamSeeds([
    { name: "Q_ENABLE", value: 1 },
    { name: "Q_FRAME_CLASS", value: 10 },
    { name: "Q_FRAME_TYPE", value: 0 },
    { name: "Q_TAILSIT_ENABLE", value: 1 },
    { name: "AHRS_ORIENTATION", value: 0 },
    { name: "SERVO1_FUNCTION", value: 88 },
    { name: "SERVO1_MIN", value: 1000 },
    { name: "SERVO1_MAX", value: 2000 },
    { name: "SERVO1_TRIM", value: 1500 },
    { name: "SERVO1_REVERSED", value: 0 },
    { name: "SERVO2_FUNCTION", value: 4 },
    { name: "SERVO2_MIN", value: 1000 },
    { name: "SERVO2_MAX", value: 2000 },
    { name: "SERVO2_TRIM", value: 1500 },
    { name: "SERVO2_REVERSED", value: 0 },
    { name: "SERVO17_FUNCTION", value: 21 },
    { name: "SERVO17_MIN", value: 1000 },
    { name: "SERVO17_MAX", value: 2000 },
    { name: "SERVO17_TRIM", value: 1500 },
    { name: "SERVO17_REVERSED", value: 0 },
  ], overrides));
}

export function createSetupTelemetryDomain(
  radio: TelemetryState["radio"] | null,
  options: SetupTelemetryOverrides = {},
): TelemetryDomain {
  const { value: valueOverrides, ...domainOverrides } = options;

  return {
    available: true,
    complete: true,
    provenance: "stream",
    ...domainOverrides,
    value: {
      flight: null,
      navigation: null,
      attitude: null,
      power: null,
      gps: null,
      terrain: null,
      radio: radio ?? {},
      ...valueOverrides,
    },
  } as TelemetryDomain;
}

export function createSetupSupportDomain(overrides: Partial<NonNullable<SupportDomain["value"]>> = {}): SupportDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      can_request_prearm_checks: true,
      can_calibrate_accel: true,
      can_calibrate_compass: true,
      can_calibrate_radio: false,
      ...overrides,
    },
  };
}

export function createSetupConfigurationFactsDomain(
  overrides: Partial<NonNullable<ConfigurationFactsDomain["value"]>> = {},
): ConfigurationFactsDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      frame: { configured: true },
      gps: { configured: true },
      battery_monitor: { configured: true },
      motors_esc: { configured: true },
      ...overrides,
    },
  };
}

export function createSetupCalibrationDomain(
  overrides: Partial<NonNullable<CalibrationDomain["value"]>> = {},
): CalibrationDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      accel: { lifecycle: "not_started", progress: null, report: null },
      compass: { lifecycle: "not_started", progress: null, report: null },
      radio: { lifecycle: "not_started", progress: null, report: null },
      ...overrides,
    },
  };
}

export function createSetupStatusTextDomain(
  entries: Array<{ sequence: number; text: string; severity: string; timestamp_usec: number }>,
): StatusTextDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: { entries },
  };
}

export async function primeSetupMetadata(page: Page): Promise<void> {
  await page.addInitScript(({ copterXml, planeXml, ts }) => {
    window.localStorage.setItem("param_meta_ArduCopter", copterXml);
    window.localStorage.setItem("param_meta_ArduCopter_ts", String(ts));
    window.localStorage.setItem("param_meta_ArduPlane", planeXml);
    window.localStorage.setItem("param_meta_ArduPlane_ts", String(ts));
  }, {
    copterXml: setupParamMetadataXml,
    planeXml: setupPlaneParamMetadataXml,
    ts: Date.now(),
  });
}

function defaultSetupAvailableModes(vehicleState: MockLiveVehicleState): unknown {
  switch (vehicleState.vehicle_type) {
    case "fixed_wing":
      return setupPlaneAvailableModes;
    case "quadrotor":
      return setupCopterAvailableModes;
    default:
      return [];
  }
}

export async function connectSetupSession(
  page: Page,
  mockPlatform: SetupMockPlatform,
  options: {
    vehicleState?: MockLiveVehicleState;
    telemetry?: TelemetryDomain;
    support?: SupportDomain;
    configurationFacts?: ConfigurationFactsDomain;
    calibration?: CalibrationDomain;
    statusText?: StatusTextDomain;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    availableModes?: unknown;
  } = {},
): Promise<void> {
  const vehicleState = options.vehicleState ?? setupConnectedVehicleState;
  const paramStore = options.paramStore ?? setupParamStore;
  const paramProgress = options.paramProgress ?? "completed";
  const availableModes = Object.prototype.hasOwnProperty.call(options, "availableModes")
    ? options.availableModes
    : defaultSetupAvailableModes(vehicleState);

  await mockPlatform.setCommandBehavior("get_available_modes", {
    type: "resolve",
    result: availableModes,
  });
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
  await page.locator(connectionSelectors.connectButton).click();
  await expect(page.locator(connectionSelectors.statusText)).toContainText("Connecting", { timeout: 10_000 });

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState,
    paramStore,
    paramProgress,
    guidedState: setupGuidedState,
  });

  await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", { timeout: 10_000 });

  await mockPlatform.emitParamStore(paramStore);
  await mockPlatform.emitParamProgress(paramProgress);

  if (options.telemetry) {
    await mockPlatform.emitLiveTelemetryDomain(options.telemetry);
  }
  if (options.support) {
    await mockPlatform.emitLiveSupportDomain(options.support);
  }
  if (options.configurationFacts) {
    await mockPlatform.emitLiveConfigurationFactsDomain(options.configurationFacts);
  }
  if (options.calibration) {
    await mockPlatform.emitLiveCalibrationDomain(options.calibration);
  }
  if (options.statusText) {
    await mockPlatform.emitLiveStatusTextDomain(options.statusText);
  }
}

export async function openConnectedSetupWorkspace(page: Page): Promise<void> {
  await openSetupWorkspace(page);
  await expect(page.locator(setupWorkspaceSelectors.metadata)).toContainText(/Metadata/i, { timeout: 10_000 });
}

export async function emitSetupScopeEnvelope(
  mockPlatform: Pick<SetupMockPlatform, "emit">,
  envelope: SessionEnvelope,
  payloads: {
    vehicleState: MockLiveVehicleState;
    telemetry?: TelemetryDomain;
    support?: SupportDomain;
    configurationFacts?: ConfigurationFactsDomain;
    calibration?: CalibrationDomain;
    statusText?: StatusTextDomain;
  },
): Promise<void> {
  await mockPlatform.emit("session://state", {
    envelope,
    value: {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: payloads.vehicleState,
        home_position: null,
      },
    },
  });

  if (payloads.telemetry) {
    await mockPlatform.emit("telemetry://state", { envelope, value: payloads.telemetry });
  }
  if (payloads.support) {
    await mockPlatform.emit("support://state", { envelope, value: payloads.support });
  }
  if (payloads.configurationFacts) {
    await mockPlatform.emit("configuration_facts://state", { envelope, value: payloads.configurationFacts });
  }
  if (payloads.calibration) {
    await mockPlatform.emit("calibration://state", { envelope, value: payloads.calibration });
  }
  if (payloads.statusText) {
    await mockPlatform.emit("status_text://state", { envelope, value: payloads.statusText });
  }
}

export async function simulateSetupReconnectSameScope(
  mockPlatform: SetupMockPlatform,
  payloads: {
    vehicleState?: MockLiveVehicleState;
    telemetry?: TelemetryDomain;
    support?: SupportDomain;
    configurationFacts?: ConfigurationFactsDomain;
    calibration?: CalibrationDomain;
    statusText?: StatusTextDomain;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    availableModes?: unknown;
  } = {},
): Promise<SessionEnvelope> {
  const currentEnvelope = await mockPlatform.getLiveEnvelope();
  if (!currentEnvelope) {
    throw new Error("Cannot simulate same-scope reconnect before a live envelope exists.");
  }

  const resumedEnvelope: SessionEnvelope = {
    ...currentEnvelope,
    reset_revision: currentEnvelope.reset_revision + 1,
  };
  const vehicleState = payloads.vehicleState ?? setupConnectedVehicleState;
  const availableModes = Object.prototype.hasOwnProperty.call(payloads, "availableModes")
    ? payloads.availableModes
    : defaultSetupAvailableModes(vehicleState);

  await mockPlatform.setCommandBehavior("get_available_modes", {
    type: "resolve",
    result: availableModes,
  });

  await emitSetupScopeEnvelope(mockPlatform, resumedEnvelope, {
    vehicleState,
    telemetry: payloads.telemetry,
    support: payloads.support,
    configurationFacts: payloads.configurationFacts,
    calibration: payloads.calibration,
    statusText: payloads.statusText,
  });

  if (payloads.paramStore) {
    await mockPlatform.emit("param://store", {
      envelope: resumedEnvelope,
      value: payloads.paramStore,
    });
  }
  if (payloads.paramProgress) {
    await mockPlatform.emit("param://progress", {
      envelope: resumedEnvelope,
      value: payloads.paramProgress,
    });
  }

  return resumedEnvelope;
}

export async function expectQueuedRcReviewRows(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await expect(parameterReviewRowLocator(page, name)).toContainText(name);
  }
}

export {
  parameterReviewRowLocator,
  parameterWorkspaceSelectors,
  setupCalibrationActionLocator,
  setupCalibrationCardLocator,
  setupFrameBannerLocator,
  setupFrameInputLocator,
  setupFrameStageButtonLocator,
  setupMotorsEscBannerLocator,
  setupMotorsEscRowAvailabilityLocator,
  setupMotorsEscRowLocator,
  setupMotorsEscRowResultLocator,
  setupMotorsEscRowReverseLocator,
  setupMotorsEscRowReversedLocator,
  setupMotorsEscRowTestLocator,
  setupNavLocator,
  setupNavGroupProgressLocator,
  setupOverviewCardLocator,
  setupOverviewGroupProgressLocator,
  setupOverviewDocLinkLocator,
  setupOverviewGroupCountLocator,
  setupOverviewMetricLocator,
  setupOverviewQuickActionLocator,
  setupRcBarLocator,
  setupRcInputLocator,
  setupRcPresetLocator,
  setupRcStageButtonLocator,
  setupServoOutputsBannerLocator,
  setupServoOutputsFunctionGroupLocator,
  setupServoOutputsRawAvailabilityLocator,
  setupServoOutputsRawInputLocator,
  setupServoOutputsRawReadbackLocator,
  setupServoOutputsRawRowLocator,
  setupServoOutputsRawSendLocator,
  setupServoOutputsRowLocator,
  setupServoOutputsRowMinLocator,
  setupServoOutputsRowResultLocator,
  setupServoOutputsRowReverseLocator,
  setupServoOutputsRowReversedLocator,
  setupWorkspaceSelectors,
};

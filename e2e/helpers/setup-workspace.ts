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
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

    const lines = [...fields, ...values];
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

function createServoMetadata(maxServo = 17): SetupMetadataParam[] {
  const params: SetupMetadataParam[] = [];

  for (let index = 1; index <= maxServo; index += 1) {
    params.push(
      {
        name: `SERVO${index}_FUNCTION`,
        humanName: `Servo ${index} function`,
        documentation: `Assigned output function for SERVO${index}.`,
        values: servoFunctionValues,
      },
      {
        name: `SERVO${index}_MIN`,
        humanName: `Servo ${index} min`,
        documentation: `Minimum PWM for SERVO${index}.`,
        unitText: "µs",
      },
      {
        name: `SERVO${index}_MAX`,
        humanName: `Servo ${index} max`,
        documentation: `Maximum PWM for SERVO${index}.`,
        unitText: "µs",
      },
      {
        name: `SERVO${index}_TRIM`,
        humanName: `Servo ${index} trim`,
        documentation: `Trim PWM for SERVO${index}.`,
        unitText: "µs",
      },
      {
        name: `SERVO${index}_REVERSED`,
        humanName: `Servo ${index} reversed`,
        documentation: `Reverse the direction of SERVO${index}.`,
        values: reverseValues,
      },
    );
  }

  return params;
}

export const setupParamMetadataXml = buildMetadataXml("ArduCopter", [
  {
    name: "FRAME_CLASS",
    humanName: "Frame class",
    documentation: "Vehicle frame family.",
    rebootRequired: true,
    values: [
      { code: 1, label: "Quad" },
      { code: 2, label: "Hexa" },
      { code: 12, label: "Dodecahexa" },
    ],
  },
  {
    name: "FRAME_TYPE",
    humanName: "Frame type",
    documentation: "Vehicle frame layout.",
    rebootRequired: true,
    values: [
      { code: 0, label: "Plus" },
      { code: 1, label: "X" },
    ],
  },
  {
    name: "AHRS_ORIENTATION",
    humanName: "Board orientation",
    documentation: "Autopilot board orientation.",
    rebootRequired: true,
    values: orientationValues,
  },
  {
    name: "ARMING_CHECK",
    humanName: "Arming checks",
    documentation: "Controls pre-arm validation.",
  },
  {
    name: "FS_THR_ENABLE",
    humanName: "Throttle failsafe",
    documentation: "Select the throttle failsafe behavior.",
  },
  {
    name: "RCMAP_ROLL",
    humanName: "Roll",
    documentation: "Primary roll channel.",
    rebootRequired: true,
  },
  {
    name: "RCMAP_PITCH",
    humanName: "Pitch",
    documentation: "Primary pitch channel.",
    rebootRequired: true,
  },
  {
    name: "RCMAP_THROTTLE",
    humanName: "Throttle",
    documentation: "Primary throttle channel.",
    rebootRequired: true,
  },
  {
    name: "RCMAP_YAW",
    humanName: "Yaw",
    documentation: "Primary yaw channel.",
    rebootRequired: true,
  },
  {
    name: "INS_ACCOFFS_X",
    humanName: "Accel X Offset",
    documentation: "Accelerometer X offset.",
    unitText: "m/s²",
  },
  {
    name: "INS_ACCOFFS_Y",
    humanName: "Accel Y Offset",
    documentation: "Accelerometer Y offset.",
    unitText: "m/s²",
  },
  {
    name: "INS_ACCOFFS_Z",
    humanName: "Accel Z Offset",
    documentation: "Accelerometer Z offset.",
    unitText: "m/s²",
  },
  {
    name: "COMPASS_DEV_ID",
    humanName: "Compass Device",
    documentation: "Primary compass device id.",
  },
  {
    name: "RC1_MIN",
    humanName: "CH1 Min",
    documentation: "Channel 1 minimum PWM.",
    unitText: "µs",
  },
  {
    name: "RC1_MAX",
    humanName: "CH1 Max",
    documentation: "Channel 1 maximum PWM.",
    unitText: "µs",
  },
  ...createServoMetadata(),
]);

export const setupPlaneParamMetadataXml = buildMetadataXml("ArduPlane", [
  {
    name: "Q_ENABLE",
    humanName: "QuadPlane enable",
    documentation: "Enable QuadPlane-specific VTOL parameters on Plane firmware.",
    rebootRequired: true,
    values: qEnableValues,
  },
  {
    name: "Q_FRAME_CLASS",
    humanName: "QuadPlane frame class",
    documentation: "QuadPlane lift-motor frame family.",
    rebootRequired: true,
    values: qFrameClassValues,
  },
  {
    name: "Q_FRAME_TYPE",
    humanName: "QuadPlane frame type",
    documentation: "QuadPlane lift-motor layout.",
    rebootRequired: true,
    values: qFrameTypeValues,
  },
  {
    name: "Q_TILT_ENABLE",
    humanName: "Tilt-rotor enable",
    documentation: "Enable tilt-rotor behavior for QuadPlane layouts.",
    values: [
      { code: 0, label: "Disabled" },
      { code: 1, label: "Enabled" },
    ],
  },
  {
    name: "Q_TAILSIT_ENABLE",
    humanName: "Tailsitter enable",
    documentation: "Enable tailsitter behavior for QuadPlane layouts.",
    values: [
      { code: 0, label: "Disabled" },
      { code: 1, label: "Enabled" },
    ],
  },
  {
    name: "AHRS_ORIENTATION",
    humanName: "Board orientation",
    documentation: "Autopilot board orientation.",
    rebootRequired: true,
    values: orientationValues,
  },
  ...createServoMetadata(),
]);

const setupParamStoreEntries: SetupParamSeed[] = [
  { name: "FRAME_CLASS", value: 1 },
  { name: "FRAME_TYPE", value: 1 },
  { name: "AHRS_ORIENTATION", value: 0 },
  { name: "ARMING_CHECK", value: 1 },
  { name: "FS_THR_ENABLE", value: 1 },
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
];

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

export const setupParamStore: MockParamStoreState = buildParamStore(setupParamStoreEntries);

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
  } = {},
): Promise<void> {
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
  await page.locator(connectionSelectors.connectButton).click();
  await expect(page.locator(connectionSelectors.statusText)).toContainText("Connecting", { timeout: 10_000 });

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState: options.vehicleState ?? setupConnectedVehicleState,
    paramStore: options.paramStore ?? setupParamStore,
    paramProgress: options.paramProgress ?? "completed",
    guidedState: setupGuidedState,
  });

  await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", { timeout: 10_000 });

  await mockPlatform.emitParamStore(options.paramStore ?? setupParamStore);
  await mockPlatform.emitParamProgress(options.paramProgress ?? "completed");

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

  await emitSetupScopeEnvelope(mockPlatform, resumedEnvelope, {
    vehicleState: payloads.vehicleState ?? setupConnectedVehicleState,
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

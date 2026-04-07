import type { Page } from "@playwright/test";

import type { CalibrationDomain } from "../../src/calibration";
import type { ConfigurationFactsDomain } from "../../src/configuration-facts";
import type {
  MockCommandBehavior,
  MockGuidedStateValue,
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
  setupNavLocator,
  setupRcBarLocator,
  setupRcInputLocator,
  setupRcPresetLocator,
  setupRcStageButtonLocator,
  setupWorkspaceSelectors,
} from "../fixtures/mock-platform";

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
  getLiveEnvelope: () => Promise<SessionEnvelope | null>;
};

export const setupParamMetadataXml = `<?xml version="1.0"?>
<parameters>
  <param name="ArduCopter:FRAME_CLASS" humanName="Frame class" documentation="Vehicle frame family." user="Standard">
    <field name="RebootRequired">true</field>
    <values>
      <value code="1">Quad</value>
      <value code="2">Hexa</value>
    </values>
  </param>
  <param name="ArduCopter:FRAME_TYPE" humanName="Frame type" documentation="Vehicle frame layout." user="Standard">
    <field name="RebootRequired">true</field>
    <values>
      <value code="0">Plus</value>
      <value code="1">X</value>
    </values>
  </param>
  <param name="ArduCopter:AHRS_ORIENTATION" humanName="Board orientation" documentation="Autopilot board orientation." user="Standard">
    <field name="RebootRequired">true</field>
    <values>
      <value code="0">None</value>
      <value code="1">Yaw 45</value>
    </values>
  </param>
  <param name="ArduCopter:ARMING_CHECK" humanName="Arming checks" documentation="Controls pre-arm validation." user="Standard" />
  <param name="ArduCopter:FS_THR_ENABLE" humanName="Throttle failsafe" documentation="Select the throttle failsafe behavior." user="Standard" />
  <param name="ArduCopter:RCMAP_ROLL" humanName="Roll" documentation="Primary roll channel." user="Standard">
    <field name="RebootRequired">true</field>
  </param>
  <param name="ArduCopter:RCMAP_PITCH" humanName="Pitch" documentation="Primary pitch channel." user="Standard">
    <field name="RebootRequired">true</field>
  </param>
  <param name="ArduCopter:RCMAP_THROTTLE" humanName="Throttle" documentation="Primary throttle channel." user="Standard">
    <field name="RebootRequired">true</field>
  </param>
  <param name="ArduCopter:RCMAP_YAW" humanName="Yaw" documentation="Primary yaw channel." user="Standard">
    <field name="RebootRequired">true</field>
  </param>
  <param name="ArduCopter:INS_ACCOFFS_X" humanName="Accel X Offset" documentation="Accelerometer X offset." user="Standard">
    <field name="UnitText">m/s²</field>
  </param>
  <param name="ArduCopter:INS_ACCOFFS_Y" humanName="Accel Y Offset" documentation="Accelerometer Y offset." user="Standard">
    <field name="UnitText">m/s²</field>
  </param>
  <param name="ArduCopter:INS_ACCOFFS_Z" humanName="Accel Z Offset" documentation="Accelerometer Z offset." user="Standard">
    <field name="UnitText">m/s²</field>
  </param>
  <param name="ArduCopter:COMPASS_DEV_ID" humanName="Compass Device" documentation="Primary compass device id." user="Standard" />
  <param name="ArduCopter:RC1_MIN" humanName="CH1 Min" documentation="Channel 1 minimum PWM." user="Standard">
    <field name="UnitText">µs</field>
  </param>
  <param name="ArduCopter:RC1_MAX" humanName="CH1 Max" documentation="Channel 1 maximum PWM." user="Standard">
    <field name="UnitText">µs</field>
  </param>
</parameters>`;

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

export const setupParamStore: MockParamStoreState = {
  expected_count: 15,
  params: {
    FRAME_CLASS: { name: "FRAME_CLASS", value: 1, param_type: "uint8", index: 0 },
    FRAME_TYPE: { name: "FRAME_TYPE", value: 1, param_type: "uint8", index: 1 },
    AHRS_ORIENTATION: { name: "AHRS_ORIENTATION", value: 0, param_type: "uint8", index: 2 },
    ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 3 },
    FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 1, param_type: "uint8", index: 4 },
    RCMAP_ROLL: { name: "RCMAP_ROLL", value: 1, param_type: "uint8", index: 5 },
    RCMAP_PITCH: { name: "RCMAP_PITCH", value: 2, param_type: "uint8", index: 6 },
    RCMAP_THROTTLE: { name: "RCMAP_THROTTLE", value: 3, param_type: "uint8", index: 7 },
    RCMAP_YAW: { name: "RCMAP_YAW", value: 4, param_type: "uint8", index: 8 },
    INS_ACCOFFS_X: { name: "INS_ACCOFFS_X", value: 0, param_type: "real32", index: 9 },
    INS_ACCOFFS_Y: { name: "INS_ACCOFFS_Y", value: 0, param_type: "real32", index: 10 },
    INS_ACCOFFS_Z: { name: "INS_ACCOFFS_Z", value: 0, param_type: "real32", index: 11 },
    COMPASS_DEV_ID: { name: "COMPASS_DEV_ID", value: 12345, param_type: "uint32", index: 12 },
    RC1_MIN: { name: "RC1_MIN", value: 1000, param_type: "uint16", index: 13 },
    RC1_MAX: { name: "RC1_MAX", value: 2000, param_type: "uint16", index: 14 },
  },
};

export function createSetupTelemetryDomain(
  radio: TelemetryState["radio"] | null,
  options: Partial<TelemetryDomain> = {},
): TelemetryDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: radio
      ? {
          flight: null,
          navigation: null,
          attitude: null,
          power: null,
          gps: null,
          terrain: null,
          radio,
        }
      : {
          flight: null,
          navigation: null,
          attitude: null,
          power: null,
          gps: null,
          terrain: null,
          radio: {},
        },
    ...options,
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
  await page.addInitScript((xml) => {
    window.localStorage.setItem("param_meta_ArduCopter", xml);
    window.localStorage.setItem("param_meta_ArduCopter_ts", String(Date.now()));
  }, setupParamMetadataXml);
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
  setupNavLocator,
  setupRcBarLocator,
  setupRcInputLocator,
  setupRcPresetLocator,
  setupRcStageButtonLocator,
  setupWorkspaceSelectors,
};

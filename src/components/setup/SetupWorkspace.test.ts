// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calibrationMocks = vi.hoisted(() => ({
  calibrateCompassStart: vi.fn(async () => undefined),
  calibrateCompassAccept: vi.fn(async () => undefined),
  calibrateCompassCancel: vi.fn(async () => undefined),
  motorTest: vi.fn(async () => undefined),
  setServo: vi.fn(async () => undefined),
  requestPrearmChecks: vi.fn(async () => undefined),
}));

const telemetryMocks = vi.hoisted(() => ({
  armVehicle: vi.fn(async () => undefined),
  disarmVehicle: vi.fn(async () => undefined),
}));

vi.mock("../../calibration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../calibration")>();
  return {
    ...actual,
    ...calibrationMocks,
  };
});

vi.mock("../../telemetry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../telemetry")>();
  return {
    ...actual,
    ...telemetryMocks,
  };
});

import type { DomainValue } from "../../lib/domain-status";
import { missingDomainValue } from "../../lib/domain-status";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import {
  createParamsStore,
} from "../../lib/stores/params";
import type { SessionStore, SessionStoreState } from "../../lib/stores/session";
import {
  createSetupWorkspaceStore,
  createSetupWorkspaceViewStore,
} from "../../lib/stores/setup-workspace";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { createStaticShellChromeStore, withShellContexts } from "../../test/context-harnesses";
import type { ShellChromeStore } from "../../app/shell/runtime-context";
import type { TelemetryState, VehicleState } from "../../telemetry";
import { appShellTestIds } from "../../app/shell/chrome-state";
import ParameterReviewTray from "../../app/shell/ParameterReviewTray.svelte";
import { parameterWorkspaceTestIds } from "../params/parameter-workspace-test-ids";
import SetupOverviewSection from "./SetupOverviewSection.svelte";
import SetupWorkspace from "./SetupWorkspace.svelte";
import SetupWorkspaceSectionNav from "./SetupWorkspaceSectionNav.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

function createTelemetryDomain(
  value: TelemetryState["radio"] | null,
  options: Partial<DomainValue<TelemetryState>> = {},
): DomainValue<TelemetryState> {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: value
      ? {
          flight: null,
          navigation: null,
          attitude: null,
          power: null,
          gps: null,
          terrain: null,
          radio: value,
        }
      : null,
    ...options,
  } as DomainValue<TelemetryState>;
}

function createTelemetryDomainState(
  value: Partial<TelemetryState> | null,
  options: Partial<DomainValue<TelemetryState>> = {},
): DomainValue<TelemetryState> {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: value
      ? {
          flight: null,
          navigation: null,
          attitude: null,
          power: null,
          gps: null,
          terrain: null,
          radio: null,
          ...value,
        }
      : null,
    ...options,
  } as DomainValue<TelemetryState>;
}

function createParamStoreFromEntries(entries: Record<string, number>): ParamStore {
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

function createSetupParamStore(): ParamStore {
  return createParamStoreFromEntries({
    FRAME_CLASS: 1,
    FRAME_TYPE: 1,
    AHRS_ORIENTATION: 0,
    GPS1_TYPE: 1,
    GPS_AUTO_CONFIG: 1,
    GPS_GNSS_MODE: 5,
    GPS2_TYPE: 0,
    GPS_AUTO_SWITCH: 1,
    BATT_MONITOR: 4,
    BATT_VOLT_PIN: 2,
    BATT_CURR_PIN: 3,
    BATT_VOLT_MULT: 10.101,
    BATT_AMP_PERVLT: 18.002,
    BATT_CAPACITY: 5200,
    BATT_ARM_VOLT: 13.3,
    BATT_LOW_VOLT: 14.4,
    BATT_CRT_VOLT: 14.0,
    BATT2_MONITOR: 0,
    SERIAL1_PROTOCOL: 23,
    SERIAL1_BAUD: 57,
    SERIAL2_PROTOCOL: 2,
    SERIAL2_BAUD: 57,
    SERIAL3_PROTOCOL: 5,
    SERIAL3_BAUD: 115,
    ARMING_CHECK: 1,
    ARMING_REQUIRE: 1,
    FLTMODE_CH: 5,
    FLTMODE1: 0,
    FLTMODE2: 2,
    FLTMODE3: 5,
    FLTMODE4: 6,
    FLTMODE5: 9,
    FLTMODE6: 3,
    SIMPLE: 0,
    SUPER_SIMPLE: 0,
    FS_THR_ENABLE: 1,
    FS_THR_VALUE: 975,
    FS_GCS_ENABLE: 1,
    FS_EKF_ACTION: 1,
    FS_EKF_THRESH: 0.8,
    FS_CRASH_CHECK: 1,
    BATT_FS_LOW_ACT: 2,
    BATT_LOW_MAH: 1200,
    BATT_FS_CRT_ACT: 1,
    BATT_CRT_MAH: 500,
    THR_FAILSAFE: 1,
    THR_FS_VALUE: 950,
    FS_LONG_ACTN: 1,
    FS_SHORT_ACTN: 1,
    FS_ACTION: 1,
    FS_TIMEOUT: 5,
    RTL_ALT: 1500,
    RTL_ALT_FINAL: 0,
    RTL_CLIMB_MIN: 0,
    RTL_SPEED: 500,
    RTL_LOIT_TIME: 5000,
    ALT_HOLD_RTL: -1,
    RTL_AUTOLAND: 0,
    WP_RADIUS: 2,
    FENCE_ENABLE: 1,
    FENCE_TYPE: 0b0111,
    FENCE_ACTION: 1,
    FENCE_ALT_MAX: 120,
    FENCE_ALT_MIN: 20,
    FENCE_RADIUS: 300,
    FENCE_MARGIN: 5,
    RCMAP_ROLL: 1,
    RCMAP_PITCH: 2,
    RCMAP_THROTTLE: 3,
    RCMAP_YAW: 4,
    INS_ACCOFFS_X: 0,
    INS_ACCOFFS_Y: 0,
    INS_ACCOFFS_Z: 0,
    COMPASS_DEV_ID: 12345,
    RC1_MIN: 1000,
    RC1_MAX: 2000,
  });
}

function paramEntries(paramStore: ParamStore): Record<string, number> {
  return Object.fromEntries(Object.values(paramStore.params).map((param) => [param.name, param.value]));
}

function createPlaneSetupParamStore(entries: Record<string, number>): ParamStore {
  return createParamStoreFromEntries({
    Q_ENABLE: 0,
    AHRS_ORIENTATION: 0,
    ...entries,
  });
}

function createSetupMetadata(options: {
  omitFrameType?: boolean;
  omitOrientation?: boolean;
} = {}): ParamMetadataMap {
  const metadata = new Map<string, ParamMetadataMap extends Map<string, infer T> ? T : never>([
    [
      "FRAME_CLASS",
      {
        humanName: "Frame class",
        description: "Vehicle frame family.",
        values: [
          { code: 1, label: "Quad" },
          { code: 2, label: "Hexa" },
        ],
        rebootRequired: true,
      },
    ],
    [
      "Q_ENABLE",
      {
        humanName: "QuadPlane enable",
        description: "Enable QuadPlane-specific VTOL parameters on Plane firmware.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled (QuadPlane)" },
        ],
        rebootRequired: true,
      },
    ],
    [
      "Q_FRAME_CLASS",
      {
        humanName: "QuadPlane frame class",
        description: "QuadPlane lift-motor frame family.",
        values: [
          { code: 1, label: "Quad" },
          { code: 10, label: "Custom" },
        ],
        rebootRequired: true,
      },
    ],
    [
      "Q_FRAME_TYPE",
      {
        humanName: "QuadPlane frame type",
        description: "QuadPlane lift-motor layout.",
        values: [
          { code: 0, label: "Plus" },
          { code: 1, label: "X" },
        ],
        rebootRequired: true,
      },
    ],
    [
      "Q_TILT_ENABLE",
      {
        humanName: "Tilt-rotor enable",
        description: "Enable tilt-rotor behavior for QuadPlane layouts.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "Q_TAILSIT_ENABLE",
      {
        humanName: "Tailsitter enable",
        description: "Enable tailsitter behavior for QuadPlane layouts.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "ARMING_CHECK",
      {
        humanName: "Arming checks",
        description: "Controls which pre-arm checks remain enabled.",
        bitmask: [
          { bit: 1, label: "Barometer" },
          { bit: 2, label: "Compass" },
          { bit: 3, label: "GPS" },
          { bit: 4, label: "INS" },
          { bit: 5, label: "RC" },
        ],
      },
    ],
    [
      "ARMING_REQUIRE",
      {
        humanName: "Arming method",
        description: "How the vehicle can be armed before flight.",
        values: [
          { code: 0, label: "Disabled (no arming required)" },
          { code: 1, label: "Throttle-Yaw-Right (rudder arm)" },
          { code: 2, label: "Arm Switch (RC switch)" },
        ],
      },
    ],
    [
      "FLTMODE_CH",
      {
        humanName: "Flight-mode channel",
        description: "RC channel used to select the six flight-mode slots.",
      },
    ],
    [
      "SIMPLE",
      {
        humanName: "Simple mode mask",
        description: "Mode slots that use Simple mode heading behavior.",
        bitmask: [
          { bit: 0, label: "Slot 1" },
          { bit: 1, label: "Slot 2" },
          { bit: 2, label: "Slot 3" },
          { bit: 3, label: "Slot 4" },
          { bit: 4, label: "Slot 5" },
          { bit: 5, label: "Slot 6" },
        ],
      },
    ],
    [
      "SUPER_SIMPLE",
      {
        humanName: "Super Simple mode mask",
        description: "Mode slots that use Super Simple home-relative behavior.",
        bitmask: [
          { bit: 0, label: "Slot 1" },
          { bit: 1, label: "Slot 2" },
          { bit: 2, label: "Slot 3" },
          { bit: 3, label: "Slot 4" },
          { bit: 4, label: "Slot 5" },
          { bit: 5, label: "Slot 6" },
        ],
      },
    ],
    [
      "FS_THR_ENABLE",
      {
        humanName: "Throttle failsafe",
        description: "Select the copter radio failsafe behavior.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "RTL" },
          { code: 2, label: "Continue Mission (Auto)" },
          { code: 3, label: "Land" },
          { code: 4, label: "SmartRTL → RTL" },
          { code: 5, label: "SmartRTL → Land" },
          { code: 6, label: "Auto DO_LAND_START → RTL" },
          { code: 7, label: "Brake → Land" },
        ],
      },
    ],
    [
      "FS_GCS_ENABLE",
      {
        humanName: "GCS failsafe",
        description: "Select the copter ground-control-station failsafe behavior.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "RTL" },
          { code: 2, label: "Continue Mission (Auto)" },
          { code: 3, label: "SmartRTL → RTL" },
          { code: 4, label: "SmartRTL → Land" },
          { code: 5, label: "Land" },
          { code: 6, label: "Auto DO_LAND_START → RTL" },
          { code: 7, label: "Brake → Land" },
        ],
      },
    ],
    [
      "FS_EKF_ACTION",
      {
        humanName: "EKF failsafe",
        description: "Action taken when EKF health falls below the configured threshold.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Land" },
          { code: 2, label: "AltHold" },
          { code: 3, label: "Land even in Stabilize" },
        ],
      },
    ],
    [
      "FS_CRASH_CHECK",
      {
        humanName: "Crash detection",
        description: "Automatically disarm after a detected crash event.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "BATT_FS_LOW_ACT",
      {
        humanName: "Low-battery action",
        description: "Action taken when the battery reaches the low threshold.",
        values: [
          { code: 0, label: "Warn Only" },
          { code: 1, label: "Land" },
          { code: 2, label: "RTL" },
          { code: 3, label: "SmartRTL → RTL" },
          { code: 4, label: "SmartRTL → Land" },
          { code: 5, label: "Terminate (dangerous)" },
          { code: 6, label: "Auto DO_LAND_START → RTL" },
          { code: 7, label: "Brake → Land" },
        ],
      },
    ],
    [
      "BATT_FS_CRT_ACT",
      {
        humanName: "Critical-battery action",
        description: "Action taken when the battery reaches the critical threshold.",
        values: [
          { code: 0, label: "Warn Only" },
          { code: 1, label: "Land" },
          { code: 2, label: "RTL" },
          { code: 3, label: "SmartRTL → RTL" },
          { code: 4, label: "SmartRTL → Land" },
          { code: 5, label: "Terminate (dangerous)" },
          { code: 6, label: "Auto DO_LAND_START → RTL" },
          { code: 7, label: "Brake → Land" },
        ],
      },
    ],
    [
      "THR_FAILSAFE",
      {
        humanName: "Plane throttle failsafe",
        description: "Enable or disable the plane radio failsafe.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "FS_LONG_ACTN",
      {
        humanName: "Plane long failsafe",
        description: "Action taken when the plane long GCS failsafe triggers.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "RTL" },
        ],
      },
    ],
    [
      "FS_SHORT_ACTN",
      {
        humanName: "Plane short failsafe",
        description: "Action taken when the plane short GCS failsafe triggers.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Circle" },
        ],
      },
    ],
    [
      "FS_ACTION",
      {
        humanName: "Rover failsafe action",
        description: "Combined radio/GCS failsafe action for rover families.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "RTL" },
          { code: 2, label: "Hold" },
          { code: 3, label: "SmartRTL → RTL" },
          { code: 4, label: "SmartRTL → Hold" },
        ],
      },
    ],
    [
      "RTL_AUTOLAND",
      {
        humanName: "RTL auto-land",
        description: "How Plane RTL finishes after reaching home.",
        values: [
          { code: 0, label: "Loiter at home" },
          { code: 1, label: "Land if DO_LAND_START defined" },
          { code: 2, label: "Always land at home" },
        ],
      },
    ],
    [
      "FENCE_ENABLE",
      {
        humanName: "Fence enable",
        description: "Turn geofence enforcement on or off.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "FENCE_TYPE",
      {
        humanName: "Fence type",
        description: "Boundary types enforced by the current geofence.",
        bitmask: [
          { bit: 0, label: "Alt max" },
          { bit: 1, label: "Circle" },
          { bit: 2, label: "Polygon" },
          { bit: 3, label: "Alt min" },
        ],
      },
    ],
    [
      "FENCE_ACTION",
      {
        humanName: "Fence breach action",
        description: "Action taken when the vehicle breaches the configured geofence.",
        values: [
          { code: 0, label: "Report only" },
          { code: 1, label: "RTL / Hold" },
        ],
      },
    ],
    [
      "GPS1_TYPE",
      {
        humanName: "GPS 1 type",
        description: "Primary GPS receiver type.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Auto" },
          { code: 5, label: "u-blox" },
        ],
      },
    ],
    [
      "GPS_TYPE",
      {
        humanName: "GPS type",
        description: "Legacy primary GPS receiver type.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Auto" },
          { code: 5, label: "u-blox" },
        ],
      },
    ],
    [
      "GPS2_TYPE",
      {
        humanName: "GPS 2 type",
        description: "Secondary GPS receiver type.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Auto" },
          { code: 5, label: "u-blox" },
        ],
      },
    ],
    [
      "GPS_AUTO_SWITCH",
      {
        humanName: "GPS auto switch",
        description: "How the autopilot switches between GPS receivers.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Use best" },
          { code: 2, label: "Blend" },
        ],
      },
    ],
    [
      "GPS_AUTO_CONFIG",
      {
        humanName: "GPS auto config",
        description: "Automatically configure the attached GPS receiver on boot.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 1, label: "Enabled" },
        ],
      },
    ],
    [
      "GPS_GNSS_MODE",
      {
        humanName: "GNSS constellation mask",
        description: "Select which GNSS constellations remain enabled.",
        bitmask: [
          { bit: 0, label: "GPS" },
          { bit: 1, label: "SBAS" },
          { bit: 2, label: "Galileo" },
          { bit: 3, label: "BeiDou" },
        ],
      },
    ],
    [
      "BATT_MONITOR",
      {
        humanName: "Battery monitor",
        description: "Primary battery monitor backend.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 3, label: "Analog voltage only" },
          { code: 4, label: "Analog voltage and current" },
          { code: 7, label: "SMBus" },
        ],
      },
    ],
    [
      "BATT2_MONITOR",
      {
        humanName: "Battery 2 monitor",
        description: "Secondary battery monitor backend.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 3, label: "Analog voltage only" },
          { code: 4, label: "Analog voltage and current" },
          { code: 7, label: "SMBus" },
        ],
      },
    ],
    [
      "BATT_VOLT_PIN",
      {
        humanName: "Voltage pin",
        description: "Analog voltage sense pin.",
      },
    ],
    [
      "BATT_CURR_PIN",
      {
        humanName: "Current pin",
        description: "Analog current sense pin.",
      },
    ],
    [
      "BATT_VOLT_MULT",
      {
        humanName: "Voltage multiplier",
        description: "Voltage scaling multiplier.",
      },
    ],
    [
      "BATT_AMP_PERVLT",
      {
        humanName: "Amps per volt",
        description: "Current scaling in amps per volt.",
      },
    ],
    [
      "BATT_CAPACITY",
      {
        humanName: "Battery capacity",
        description: "Configured pack capacity.",
        units: "mAh",
      },
    ],
    [
      "BATT_ARM_VOLT",
      {
        humanName: "Arm voltage",
        description: "Minimum arm voltage threshold.",
        units: "V",
      },
    ],
    [
      "BATT_LOW_VOLT",
      {
        humanName: "Low voltage",
        description: "Low-voltage failsafe threshold.",
        units: "V",
      },
    ],
    [
      "BATT_CRT_VOLT",
      {
        humanName: "Critical voltage",
        description: "Critical-voltage failsafe threshold.",
        units: "V",
      },
    ],
    [
      "RCMAP_ROLL",
      {
        humanName: "Roll",
        description: "Primary roll channel.",
        rebootRequired: true,
      },
    ],
    [
      "RCMAP_PITCH",
      {
        humanName: "Pitch",
        description: "Primary pitch channel.",
        rebootRequired: true,
      },
    ],
    [
      "RCMAP_THROTTLE",
      {
        humanName: "Throttle",
        description: "Primary throttle channel.",
        rebootRequired: true,
      },
    ],
    [
      "RCMAP_YAW",
      {
        humanName: "Yaw",
        description: "Primary yaw channel.",
        rebootRequired: true,
      },
    ],
    [
      "INS_ACCOFFS_X",
      {
        humanName: "Accel X Offset",
        description: "Accelerometer X offset.",
        units: "m/s²",
      },
    ],
    [
      "INS_ACCOFFS_Y",
      {
        humanName: "Accel Y Offset",
        description: "Accelerometer Y offset.",
        units: "m/s²",
      },
    ],
    [
      "INS_ACCOFFS_Z",
      {
        humanName: "Accel Z Offset",
        description: "Accelerometer Z offset.",
        units: "m/s²",
      },
    ],
    [
      "COMPASS_DEV_ID",
      {
        humanName: "Compass Device",
        description: "Primary compass device id.",
      },
    ],
    [
      "RC1_MIN",
      {
        humanName: "CH1 Min",
        description: "Channel 1 minimum PWM.",
        units: "µs",
      },
    ],
    [
      "RC1_MAX",
      {
        humanName: "CH1 Max",
        description: "Channel 1 maximum PWM.",
        units: "µs",
      },
    ],
  ]);

  if (!options.omitFrameType) {
    metadata.set("FRAME_TYPE", {
      humanName: "Frame type",
      description: "Vehicle frame layout.",
      values: [
        { code: 0, label: "Plus" },
        { code: 1, label: "X" },
      ],
      rebootRequired: true,
    });
  }

  if (!options.omitOrientation) {
    metadata.set("AHRS_ORIENTATION", {
      humanName: "Board orientation",
      description: "Autopilot board orientation.",
      values: [
        { code: 0, label: "None" },
        { code: 1, label: "Yaw 45" },
      ],
      rebootRequired: true,
    });
  }

  for (let index = 0; index <= 9; index += 1) {
    metadata.set(`SERIAL${index}_PROTOCOL`, {
      humanName: `SERIAL${index} protocol`,
      description: `Protocol selection for SERIAL${index}.`,
      rebootRequired: true,
      values: [
        { code: 0, label: "None" },
        { code: 2, label: "MAVLink2" },
        { code: 5, label: "GPS" },
        { code: 23, label: "RCInput" },
        { code: 28, label: "Scripting" },
      ],
    });
    metadata.set(`SERIAL${index}_BAUD`, {
      humanName: `SERIAL${index} baud`,
      description: `Baud selection for SERIAL${index}.`,
      rebootRequired: true,
      values: [
        { code: 38, label: "38400" },
        { code: 57, label: "57600" },
        { code: 115, label: "115200" },
        { code: 921, label: "921600" },
      ],
    });
  }

  const servoFunctionValues = [
    { code: 4, label: "Aileron" },
    { code: 19, label: "Elevator" },
    { code: 21, label: "Rudder" },
    { code: 33, label: "Motor 1" },
    { code: 34, label: "Motor 2" },
    { code: 35, label: "Motor 3" },
    { code: 36, label: "Motor 4" },
    { code: 75, label: "Tilt Front Left" },
  ];

  for (let index = 1; index <= 32; index += 1) {
    metadata.set(`SERVO${index}_FUNCTION`, {
      humanName: `Servo ${index} function`,
      description: `Assigned output function for SERVO${index}.`,
      values: servoFunctionValues,
    });
    metadata.set(`SERVO${index}_REVERSED`, {
      humanName: `Servo ${index} reversed`,
      description: `Reverse the direction of SERVO${index}.`,
      values: [
        { code: 0, label: "Normal" },
        { code: 1, label: "Reversed" },
      ],
    });
  }

  return metadata;
}

function createSetupTuningMetadata(options: {
  malformedPidEnum?: boolean;
} = {}): ParamMetadataMap {
  const metadata = createSetupMetadata();

  const setNumericMeta = (name: string, humanName: string, description: string, units?: string) => {
    metadata.set(name, {
      humanName,
      description,
      units,
    });
  };

  const setEnumMeta = (
    name: string,
    humanName: string,
    description: string,
    values: Array<{ code: number; label: string }>,
  ) => {
    metadata.set(name, {
      humanName,
      description,
      values,
    });
  };

  const setPidAxisMeta = (prefix: string, axisLabel: string) => {
    setNumericMeta(`${prefix}_P`, `${axisLabel} P`, `${axisLabel} proportional gain.`);
    setNumericMeta(`${prefix}_I`, `${axisLabel} I`, `${axisLabel} integral gain.`);
    setNumericMeta(`${prefix}_D`, `${axisLabel} D`, `${axisLabel} derivative gain.`);
    setNumericMeta(`${prefix}_FF`, `${axisLabel} feed-forward`, `${axisLabel} feed-forward gain.`);
    setNumericMeta(`${prefix}_FLTD`, `${axisLabel} D filter`, `${axisLabel} derivative filter bandwidth.`, "Hz");
    setNumericMeta(`${prefix}_FLTE`, `${axisLabel} error filter`, `${axisLabel} error filter bandwidth.`, "Hz");
    setNumericMeta(`${prefix}_FLTT`, `${axisLabel} target filter`, `${axisLabel} target filter bandwidth.`, "Hz");
    setNumericMeta(`${prefix}_IMAX`, `${axisLabel} I max`, `${axisLabel} integrator clamp.`);
  };

  setNumericMeta("MOT_THST_EXPO", "Thrust expo", "Multirotor thrust curve compensation.");
  setNumericMeta("MOT_THST_HOVER", "Hover thrust", "Estimated hover throttle.");
  setNumericMeta("MOT_BAT_VOLT_MAX", "Motor battery max", "Maximum battery voltage used for compensation.", "V");
  setNumericMeta("MOT_BAT_VOLT_MIN", "Motor battery min", "Minimum battery voltage used for compensation.", "V");
  setNumericMeta("INS_GYRO_FILTER", "Gyro low-pass", "Primary gyro filter bandwidth.", "Hz");
  setNumericMeta("INS_ACCEL_FILTER", "Accelerometer low-pass", "Primary accelerometer filter bandwidth.", "Hz");
  setNumericMeta("ATC_ACCEL_P_MAX", "Pitch accel max", "Pitch acceleration limit.");
  setNumericMeta("ATC_ACCEL_R_MAX", "Roll accel max", "Roll acceleration limit.");
  setNumericMeta("ATC_ACCEL_Y_MAX", "Yaw accel max", "Yaw acceleration limit.");
  setNumericMeta("ATC_THR_MIX_MAN", "Throttle mix manual", "Manual throttle mixing." );
  setNumericMeta("ACRO_YAW_P", "Acro yaw P", "Acro yaw response gain.");
  setNumericMeta("ATC_ANG_RLL_P", "Angle roll P", "Outer-loop roll angle gain.");
  setNumericMeta("ATC_ANG_PIT_P", "Angle pitch P", "Outer-loop pitch angle gain.");
  setNumericMeta("ATC_ANG_YAW_P", "Angle yaw P", "Outer-loop yaw angle gain.");
  setNumericMeta("PSC_ACCZ_P", "Accel Z P", "Vertical acceleration proportional gain.");
  setNumericMeta("PSC_ACCZ_I", "Accel Z I", "Vertical acceleration integral gain.");
  setNumericMeta("PSC_ACCZ_D", "Accel Z D", "Vertical acceleration derivative gain.");
  setNumericMeta("PSC_VELZ_P", "Velocity Z P", "Vertical velocity proportional gain.");
  setNumericMeta("PSC_POSZ_P", "Position Z P", "Vertical position proportional gain.");
  setNumericMeta("PSC_VELXY_P", "Velocity XY P", "Horizontal velocity proportional gain.");
  setNumericMeta("PSC_VELXY_I", "Velocity XY I", "Horizontal velocity integral gain.");
  setNumericMeta("PSC_VELXY_D", "Velocity XY D", "Horizontal velocity derivative gain.");
  setNumericMeta("PSC_POSXY_P", "Position XY P", "Horizontal position proportional gain.");

  setPidAxisMeta("ATC_RAT_RLL", "Roll rate");
  setPidAxisMeta("ATC_RAT_PIT", "Pitch rate");
  setPidAxisMeta("ATC_RAT_YAW", "Yaw rate");
  setPidAxisMeta("Q_A_RAT_RLL", "VTOL roll rate");
  setPidAxisMeta("Q_A_RAT_PIT", "VTOL pitch rate");
  setPidAxisMeta("Q_A_RAT_YAW", "VTOL yaw rate");

  setNumericMeta("Q_A_ACCEL_P_MAX", "VTOL pitch accel max", "VTOL pitch acceleration limit.");
  setNumericMeta("Q_A_ACCEL_R_MAX", "VTOL roll accel max", "VTOL roll acceleration limit.");
  setNumericMeta("Q_A_ACCEL_Y_MAX", "VTOL yaw accel max", "VTOL yaw acceleration limit.");
  setNumericMeta("Q_A_THR_MIX_MAN", "VTOL throttle mix manual", "VTOL manual throttle mixing.");
  setNumericMeta("Q_M_THST_EXPO", "VTOL thrust expo", "QuadPlane lift-motor thrust curve compensation.");
  setNumericMeta("Q_M_THST_HOVER", "VTOL hover thrust", "QuadPlane lift-motor hover throttle.");
  setNumericMeta("Q_M_BAT_VOLT_MAX", "VTOL battery max", "Maximum QuadPlane lift-motor compensation voltage.", "V");
  setNumericMeta("Q_M_BAT_VOLT_MIN", "VTOL battery min", "Minimum QuadPlane lift-motor compensation voltage.", "V");

  setNumericMeta("RLL2SRV_P", "Roll-to-servo P", "Fixed-wing roll proportional gain.");
  setNumericMeta("RLL2SRV_I", "Roll-to-servo I", "Fixed-wing roll integral gain.");
  setNumericMeta("RLL2SRV_D", "Roll-to-servo D", "Fixed-wing roll derivative gain.");
  setNumericMeta("RLL2SRV_FF", "Roll-to-servo FF", "Fixed-wing roll feed-forward gain.");
  setNumericMeta("RLL2SRV_IMAX", "Roll-to-servo I max", "Fixed-wing roll integrator clamp.");
  setNumericMeta("RLL2SRV_TCONST", "Roll time constant", "Fixed-wing roll time constant.");
  setNumericMeta("PTCH2SRV_P", "Pitch-to-servo P", "Fixed-wing pitch proportional gain.");
  setNumericMeta("PTCH2SRV_I", "Pitch-to-servo I", "Fixed-wing pitch integral gain.");
  setNumericMeta("PTCH2SRV_D", "Pitch-to-servo D", "Fixed-wing pitch derivative gain.");
  setNumericMeta("PTCH2SRV_FF", "Pitch-to-servo FF", "Fixed-wing pitch feed-forward gain.");
  setNumericMeta("PTCH2SRV_IMAX", "Pitch-to-servo I max", "Fixed-wing pitch integrator clamp.");
  setNumericMeta("PTCH2SRV_TCONST", "Pitch time constant", "Fixed-wing pitch time constant.");
  setNumericMeta("YAW2SRV_DAMP", "Yaw damper damping", "Fixed-wing yaw damper gain.");
  setNumericMeta("YAW2SRV_INT", "Yaw damper integrator", "Fixed-wing yaw integrator.");
  setNumericMeta("YAW2SRV_RLL", "Yaw roll compensation", "Yaw compensation from roll input.");
  setNumericMeta("ARSPD_FBW_MIN", "FBW min airspeed", "Minimum fixed-wing airspeed.", "m/s");
  setNumericMeta("ARSPD_FBW_MAX", "FBW max airspeed", "Maximum fixed-wing airspeed.", "m/s");
  setNumericMeta("TRIM_THROTTLE", "Cruise throttle", "Fixed-wing cruise throttle trim.", "%");
  setNumericMeta("TRIM_ARSPD_CM", "Cruise airspeed", "Fixed-wing cruise airspeed.", "cm/s");

  if (options.malformedPidEnum) {
    metadata.set("INS_HNTCH_ENABLE", {
      humanName: "Harmonic notch enable",
      description: "Enable the harmonic notch filter.",
      values: [
        { code: Number.NaN, label: "Broken" },
        { code: 1, label: "   " },
      ],
    });
  } else {
    setEnumMeta("INS_HNTCH_ENABLE", "Harmonic notch enable", "Enable the harmonic notch filter.", [
      { code: 0, label: "Disabled" },
      { code: 1, label: "Enabled" },
    ]);
  }
  setEnumMeta("INS_HNTCH_MODE", "Harmonic notch mode", "Select the notch-frequency source.", [
    { code: 0, label: "Fixed" },
    { code: 3, label: "ESC telemetry" },
    { code: 4, label: "Dynamic FFT" },
  ]);
  setNumericMeta("INS_HNTCH_FREQ", "Harmonic notch frequency", "Primary harmonic notch center frequency.", "Hz");
  setNumericMeta("INS_HNTCH_BW", "Harmonic notch bandwidth", "Primary harmonic notch bandwidth.", "Hz");
  setNumericMeta("INS_HNTCH_REF", "Harmonic notch reference", "Primary harmonic notch reference.");

  setEnumMeta("RNGFND1_TYPE", "Rangefinder 1 type", "Primary rangefinder backend.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Analog" },
  ]);
  setNumericMeta("RNGFND1_MIN_CM", "Rangefinder 1 minimum", "Minimum measurable range.", "cm");
  setNumericMeta("RNGFND1_MAX_CM", "Rangefinder 1 maximum", "Maximum measurable range.", "cm");
  setEnumMeta("FLOW_TYPE", "Optical-flow type", "Primary optical-flow backend.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "PX4Flow" },
  ]);
  setNumericMeta("FLOW_ORIENT_YAW", "Optical-flow yaw", "Optical-flow yaw orientation.", "deg");
  setEnumMeta("MNT1_TYPE", "Mount 1 type", "Primary gimbal backend.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Servo" },
  ]);
  setNumericMeta("MNT1_RC_RATE", "Mount 1 RC rate", "Primary gimbal RC rate.");
  setEnumMeta("COMPASS_ENABLE", "Compass enable", "Enable the primary compass family.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Enabled" },
  ]);
  setEnumMeta("COMPASS_USE", "Compass use", "Use the primary compass for navigation.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Enabled" },
  ]);
  setEnumMeta("CAN_D1_PROTOCOL", "CAN D1 protocol", "Protocol on DroneCAN port 1.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "DroneCAN" },
  ]);
  setEnumMeta("CAN_P1_DRIVER", "CAN P1 driver", "Driver selection for CAN peripheral port 1.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Enabled" },
  ]);
  setEnumMeta("EFI_TYPE", "EFI type", "Electronic fuel injection backend.", [
    { code: 0, label: "Disabled" },
    { code: 1, label: "Generic EFI" },
  ]);
  setNumericMeta("EFI_COEF1", "EFI coefficient 1", "Primary EFI coefficient.");
  setNumericMeta("EFI_COEF2", "EFI coefficient 2", "Secondary EFI coefficient.");

  return metadata;
}

function createInitialParamsSetupParamStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStoreFromEntries({
    ...paramEntries(createSetupParamStore()),
    MOT_THST_EXPO: 0.42,
    MOT_THST_HOVER: 0.25,
    MOT_BAT_VOLT_MAX: 16.2,
    MOT_BAT_VOLT_MIN: 13.2,
    INS_GYRO_FILTER: 20,
    INS_ACCEL_FILTER: 20,
    ATC_RAT_PIT_FLTD: 15,
    ATC_RAT_PIT_FLTE: 5,
    ATC_RAT_PIT_FLTT: 15,
    ATC_RAT_RLL_FLTD: 15,
    ATC_RAT_RLL_FLTE: 5,
    ATC_RAT_RLL_FLTT: 15,
    ATC_RAT_YAW_FLTD: 0,
    ATC_RAT_YAW_FLTE: 2,
    ATC_RAT_YAW_FLTT: 10,
    ATC_ACCEL_P_MAX: 8000,
    ATC_ACCEL_R_MAX: 8000,
    ATC_ACCEL_Y_MAX: 8000,
    ATC_THR_MIX_MAN: 0.2,
    ACRO_YAW_P: 0.8,
    ...entries,
  });
}

function createPidCopterSetupParamStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStoreFromEntries({
    ...paramEntries(createInitialParamsSetupParamStore()),
    ATC_RAT_RLL_P: 0.11,
    ATC_RAT_RLL_I: 0.12,
    ATC_RAT_RLL_D: 0.004,
    ATC_RAT_RLL_FF: 0.15,
    ATC_RAT_PIT_P: 0.11,
    ATC_RAT_PIT_I: 0.12,
    ATC_RAT_PIT_D: 0.004,
    ATC_RAT_PIT_FF: 0.15,
    ATC_RAT_YAW_P: 0.18,
    ATC_RAT_YAW_I: 0.12,
    ATC_RAT_YAW_D: 0.001,
    ATC_RAT_YAW_FF: 0.05,
    ATC_ANG_RLL_P: 4.5,
    ATC_ANG_PIT_P: 4.5,
    ATC_ANG_YAW_P: 4.0,
    PSC_ACCZ_P: 0.3,
    PSC_ACCZ_I: 0.4,
    PSC_ACCZ_D: 0.01,
    PSC_VELZ_P: 5.0,
    PSC_POSZ_P: 1.0,
    PSC_VELXY_P: 1.5,
    PSC_VELXY_I: 0.5,
    PSC_VELXY_D: 0.2,
    PSC_POSXY_P: 1.0,
    INS_HNTCH_ENABLE: 1,
    INS_HNTCH_MODE: 3,
    INS_HNTCH_FREQ: 90,
    INS_HNTCH_BW: 45,
    INS_HNTCH_REF: 1.0,
    ...entries,
  });
}

function createPeripheralsSetupParamStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStoreFromEntries({
    ...paramEntries(createSetupParamStore()),
    RNGFND1_TYPE: 1,
    RNGFND1_MIN_CM: 20,
    RNGFND1_MAX_CM: 400,
    FLOW_TYPE: 0,
    FLOW_ORIENT_YAW: 0,
    MNT1_TYPE: 0,
    MNT1_RC_RATE: 10,
    COMPASS_ENABLE: 1,
    COMPASS_USE: 1,
    CAN_D1_PROTOCOL: 0,
    CAN_P1_DRIVER: 0,
    EFI_TYPE: 1,
    EFI_COEF1: 1.2,
    EFI_COEF2: 0.8,
    ...entries,
  });
}

function createSessionState(overrides: Partial<SessionStoreState> = {}): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource: "live",
    sessionDomain: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "pending",
        connection: { kind: "connected" },
        vehicle_state: {
          armed: false,
          custom_mode: 0,
          mode_name: "Stabilize",
          system_status: "standby",
          vehicle_type: "quadrotor",
          autopilot: "ardu_pilot_mega",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: null,
      },
    },
    telemetryDomain: missingDomainValue("bootstrap"),
    support: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: true,
      },
    },
    sensorHealth: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        gyro: "healthy",
        accel: "healthy",
        mag: "healthy",
        baro: "healthy",
        gps: "healthy",
        airspeed: "not_present",
        rc_receiver: "healthy",
        battery: "healthy",
        terrain: "not_present",
        geofence: "not_present",
      },
    },
    configurationFacts: {
      available: true,
      complete: false,
      provenance: "bootstrap",
      value: {
        frame: null,
        gps: { configured: true },
        battery_monitor: null,
        motors_esc: null,
      },
    },
    calibration: {
      available: true,
      complete: false,
      provenance: "bootstrap",
      value: {
        accel: { lifecycle: "not_started", progress: null, report: null },
        compass: null,
        radio: null,
      },
    },
    guided: missingDomainValue("bootstrap"),
    statusText: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        entries: [
          {
            sequence: 1,
            text: "Compass not calibrated",
            severity: "warning",
          },
        ],
      },
    },
    bootstrap: {
      missionState: null,
      paramStore: createSetupParamStore(),
      paramProgress: "completed",
      playbackCursorUsec: null,
    },
    connectionForm: {
      mode: "udp",
      udpBind: "0.0.0.0:14550",
      tcpAddress: "127.0.0.1:5760",
      serialPort: "",
      baud: 57600,
      selectedBtDevice: "",
      takeoffAlt: "10",
      followVehicle: true,
    },
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    ...overrides,
  };
}

function createPlaneSessionOverrides(
  paramStore: ParamStore,
  overrides: Partial<SessionStoreState> = {},
): Partial<SessionStoreState> {
  const base = createSessionState();
  const baseSessionValue = base.sessionDomain.value;
  const baseVehicleState = baseSessionValue?.vehicle_state ?? null;

  return {
    sessionDomain: {
      ...base.sessionDomain,
      value: baseSessionValue && baseVehicleState
        ? {
            status: baseSessionValue.status,
            connection: baseSessionValue.connection,
            vehicle_state: {
              armed: baseVehicleState.armed,
              custom_mode: baseVehicleState.custom_mode,
              mode_name: baseVehicleState.mode_name,
              system_status: baseVehicleState.system_status,
              vehicle_type: "fixed_wing",
              autopilot: baseVehicleState.autopilot,
              system_id: baseVehicleState.system_id,
              component_id: baseVehicleState.component_id,
              heartbeat_received: baseVehicleState.heartbeat_received,
            } satisfies VehicleState,
            home_position: baseSessionValue.home_position,
          }
        : null,
    },
    bootstrap: {
      missionState: null,
      paramStore,
      paramProgress: "completed",
      playbackCursorUsec: null,
    },
    ...overrides,
  };
}

function createCopterSessionOverrides(
  paramStore: ParamStore,
  overrides: Partial<SessionStoreState> = {},
): Partial<SessionStoreState> {
  const base = createSessionState();
  const baseSessionValue = base.sessionDomain.value;
  const baseVehicleState = baseSessionValue?.vehicle_state ?? null;

  return {
    sessionDomain: {
      ...base.sessionDomain,
      value: baseSessionValue && baseVehicleState
        ? {
            status: baseSessionValue.status,
            connection: baseSessionValue.connection,
            vehicle_state: {
              armed: baseVehicleState.armed,
              custom_mode: baseVehicleState.custom_mode,
              mode_name: baseVehicleState.mode_name,
              system_status: baseVehicleState.system_status,
              vehicle_type: "quadrotor",
              autopilot: baseVehicleState.autopilot,
              system_id: baseVehicleState.system_id,
              component_id: baseVehicleState.component_id,
              heartbeat_received: baseVehicleState.heartbeat_received,
            } satisfies VehicleState,
            home_position: baseSessionValue.home_position,
          }
        : null,
    },
    bootstrap: {
      missionState: null,
      paramStore,
      paramProgress: "completed",
      playbackCursorUsec: null,
    },
    ...overrides,
  };
}

function createMotorSetupParamStore(options: {
  frameClass?: number;
  frameType?: number;
  outputCount?: number;
  includeReverseRowFor?: number[];
} = {}): ParamStore {
  const {
    frameClass = 1,
    frameType = 1,
    outputCount = 4,
    includeReverseRowFor = Array.from({ length: outputCount }, (_, index) => index + 1),
  } = options;
  const entries: Record<string, number> = {
    FRAME_CLASS: frameClass,
    FRAME_TYPE: frameType,
    AHRS_ORIENTATION: 0,
  };
  const reverseSet = new Set(includeReverseRowFor);

  for (let index = 1; index <= outputCount; index += 1) {
    entries[`SERVO${index}_FUNCTION`] = 32 + index;
    if (reverseSet.has(index)) {
      entries[`SERVO${index}_REVERSED`] = 0;
    }
  }

  return createParamStoreFromEntries(entries);
}

function createMotorCheckpointParamStore(): ParamStore {
  return createMotorSetupParamStore({
    outputCount: 4,
    includeReverseRowFor: [1, 2, 3, 4],
  });
}

function createDodecahexaMotorSetupParamStore(): ParamStore {
  return createMotorSetupParamStore({
    frameClass: 12,
    frameType: 0,
    outputCount: 12,
    includeReverseRowFor: Array.from({ length: 12 }, (_, index) => index + 1),
  });
}

function createServoSetupParamStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStoreFromEntries({
    FRAME_CLASS: 1,
    FRAME_TYPE: 1,
    AHRS_ORIENTATION: 0,
    SERVO1_FUNCTION: 4,
    SERVO1_MIN: 900,
    SERVO1_MAX: 2100,
    SERVO1_TRIM: 1520,
    SERVO1_REVERSED: 0,
    SERVO2_FUNCTION: 19,
    SERVO2_MIN: 1200,
    SERVO2_MAX: 1800,
    SERVO2_TRIM: 1600,
    SERVO2_REVERSED: 0,
    SERVO3_FUNCTION: 33,
    SERVO3_MIN: 1000,
    SERVO3_MAX: 2000,
    SERVO3_TRIM: 1500,
    SERVO3_REVERSED: 0,
    SERVO17_FUNCTION: 21,
    SERVO17_MIN: 1000,
    SERVO17_MAX: 2000,
    SERVO17_TRIM: 1500,
    SERVO17_REVERSED: 0,
    ...entries,
  });
}

function createTailsitterServoSetupParamStore(entries: Record<string, number> = {}): ParamStore {
  return createParamStoreFromEntries({
    Q_ENABLE: 1,
    Q_FRAME_CLASS: 10,
    Q_FRAME_TYPE: 0,
    Q_TAILSIT_ENABLE: 1,
    AHRS_ORIENTATION: 0,
    SERVO1_FUNCTION: 88,
    SERVO1_MIN: 1000,
    SERVO1_MAX: 2000,
    SERVO1_TRIM: 1500,
    SERVO1_REVERSED: 0,
    SERVO2_FUNCTION: 4,
    SERVO2_MIN: 1000,
    SERVO2_MAX: 2000,
    SERVO2_TRIM: 1500,
    SERVO2_REVERSED: 0,
    SERVO17_FUNCTION: 21,
    SERVO17_MIN: 1000,
    SERVO17_MAX: 2000,
    SERVO17_TRIM: 1500,
    SERVO17_REVERSED: 0,
    ...entries,
  });
}

function createMockParamsService(
  metadata: ParamMetadataMap | null = null,
  overrides: Partial<ParamsService> = {},
) {
  let handlers: ParamsServiceEventHandlers | null = null;

  const service = {
    subscribeAll: vi.fn(async (nextHandlers: ParamsServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    fetchMetadata: vi.fn(async () => metadata),
    downloadAll: vi.fn(async () => undefined),
    writeBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: value,
      success: true,
    }))),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async (_store: ParamStore) => ""),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies ParamsService;

  return {
    service,
    hasHandlers() {
      return handlers !== null;
    },
  };
}

async function renderSetupWorkspace(options: {
  metadata?: ParamMetadataMap | null;
  sessionOverrides?: Partial<SessionStoreState>;
  includeReviewTray?: boolean;
  paramsService?: Partial<ParamsService>;
  reviewTrayOpen?: boolean;
  chromeStore?: ShellChromeStore;
} = {}) {
  const sessionStore = writable(createSessionState(options.sessionOverrides));
  const metadata = Object.prototype.hasOwnProperty.call(options, "metadata")
    ? (options.metadata ?? null)
    : createSetupMetadata();
  const paramsHarness = createMockParamsService(metadata, options.paramsService);
  const parameterStore = createParamsStore(sessionStore, paramsHarness.service);
  await parameterStore.initialize();

  const setupWorkspaceStore = createSetupWorkspaceStore(sessionStore, parameterStore);
  const setupWorkspaceViewStore = createSetupWorkspaceViewStore(setupWorkspaceStore);
  const sessionReadable = sessionStore as unknown as SessionStore;

  render(
    withShellContexts(sessionReadable, parameterStore, SetupWorkspace, {
      setupWorkspaceStore,
      setupWorkspaceViewStore,
      chromeStore: options.chromeStore,
    }),
  );

  if (options.includeReviewTray) {
    render(
      withShellContexts(sessionReadable, parameterStore, ParameterReviewTray, {
        setupWorkspaceStore,
        setupWorkspaceViewStore,
      }),
      {
        open: options.reviewTrayOpen ?? true,
        onToggle: () => {},
      },
    );
  }

  await waitFor(() => {
    expect(screen.getByTestId(setupWorkspaceTestIds.root)).toBeTruthy();
  });

  return {
    sessionStore,
    parameterStore,
    setupWorkspaceStore,
    paramsHarness,
  };
}

describe("SetupWorkspace", () => {
  beforeEach(() => {
    calibrationMocks.calibrateCompassStart.mockClear();
    calibrationMocks.calibrateCompassAccept.mockClear();
    calibrationMocks.calibrateCompassCancel.mockClear();
    calibrationMocks.motorTest.mockClear();
    calibrationMocks.requestPrearmChecks.mockClear();
    calibrationMocks.motorTest.mockResolvedValue(undefined);
    telemetryMocks.armVehicle.mockClear();
    telemetryMocks.disarmVehicle.mockClear();
    telemetryMocks.armVehicle.mockResolvedValue(undefined);
    telemetryMocks.disarmVehicle.mockResolvedValue(undefined);

    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("opens on the dashboard-first overview and keeps partial facts explicit", async () => {
    await renderSetupWorkspace({
      metadata: new Map([
        [
          "ARMING_CHECK",
          {
            humanName: "Arming checks",
            description: "Controls pre-arm validation.",
          },
        ],
      ]),
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("overview");
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewSection)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewBanner).textContent).toContain("Review setup progress before opening a section");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewMetricPrefix}-inventory`).textContent).toContain("18 sections");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewMetricPrefix}-progress`).textContent).toContain("2/14 confirmed");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewMetricPrefix}-status`).textContent).toContain("unconfirmed");
    // The compact nav only renders a status badge for complete / in_progress / failed — not for "unknown",
    // so verify the element is absent rather than checking its text.
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.sectionStatusPrefix}-frame_orientation`)).toBeNull();
    expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionConfidencePrefix}-frame_orientation`).textContent?.trim()).toBe("Unconfirmed");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navGroupPrefix}-hardware`)).toBeTruthy();
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navGroupProgressPrefix}-hardware`).textContent).toContain("1/6 confirmed");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewGroupPrefix}-safety`)).toBeTruthy();
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewGroupCountPrefix}-hardware`).textContent).toContain("7 sections · 7 ready here");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewDocLinkPrefix}-hardware`).getAttribute("href")).toContain(
      "common-positioning-landing-page",
    );
    expect(screen.getByTestId(setupWorkspaceTestIds.detailRecovery).textContent).toContain("Open Full Parameters to inspect settings not covered above");
    expect(screen.getByTestId(setupWorkspaceTestIds.notices).textContent).toContain("Compass not calibrated");
  });

  it("routes overview quick actions and recovery affordances through the grouped workspace shell", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.overviewQuickActionPrefix}-flight_modes`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("flight_modes");
      expect(screen.getByTestId(setupWorkspaceTestIds.flightModesSection)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-overview`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("overview");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewRecoveryAction));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters)).toBeTruthy();
    });
  });

  it("opens Full Parameters directly into the raw parameter browser", async () => {
    await renderSetupWorkspace({ metadata: createSetupMetadata() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewRecoveryAction));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(parameterWorkspaceTestIds.expertRoot)).toBeTruthy();
    });
  });

  it("uses direct operator language in Setup overview and Full Parameters", async () => {
    await renderSetupWorkspace({ metadata: createSetupMetadata() });

    const overviewSection = screen.getByTestId(setupWorkspaceTestIds.overviewSection);
    expect(overviewSection.textContent).not.toContain("Conservative truth");
    expect(overviewSection.textContent).not.toContain("Trackable progress");
    expect(overviewSection.textContent).not.toContain("Grouped progress stays conservative");
    expect(overviewSection.textContent).not.toContain("grouped expert path");
    expect(overviewSection.textContent).not.toContain("shared review tray keeps ownership");
    expect(overviewSection.textContent).not.toContain("Expert inventory");
    expect(overviewSection.textContent).not.toContain("purpose-built editors");
    expect(overviewSection.textContent).not.toContain("raw recovery path");
    expect(overviewSection.textContent).not.toContain("shared shell-owned review tray");
    expect(overviewSection.textContent).toContain("Review setup progress before opening a section");
    expect(overviewSection.textContent).toContain("Sections available here");

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewRecoveryAction));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters).textContent).not.toContain("Recovery stays explicit");
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters).textContent).toContain("Use this page to inspect, search, and queue raw parameter changes");
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters).textContent).toContain("Open the raw list below to inspect settings or queue changes for review");
      expect(screen.getByTestId(parameterWorkspaceTestIds.expertRoot).textContent).not.toContain("workflow handoff");
      expect(screen.getByTestId(parameterWorkspaceTestIds.expertRoot).textContent).not.toContain("Workflow selection");
      expect(screen.getByTestId(parameterWorkspaceTestIds.expertRoot).textContent).not.toContain("is highlighting");
    });
  });

  it("keeps blocked sections inspectable while metadata recovery is active", async () => {
    await renderSetupWorkspace({ metadata: null });

    expect(screen.getByTestId(setupWorkspaceTestIds.notice).textContent).toContain("Parameter descriptions are unavailable");
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewBanner).textContent).toContain(
      "Metadata missing — recovery mode is active",
    );
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`).getAttribute("data-availability")).toBe("blocked");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`)).toBeTruthy();

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("gps");
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsRecovery).textContent).toContain("Metadata recovery is active");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.gpsRecovery).querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters)).toBeTruthy();
      expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    });
  });

  it("keeps implemented sections like peripherals enabled in nav when available", async () => {
    await renderSetupWorkspace({
      metadata: createSetupTuningMetadata(),
      sessionOverrides: createCopterSessionOverrides(createPeripheralsSetupParamStore()),
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-peripherals`).hasAttribute("disabled")).toBe(false);
  });

  it("keeps unimplemented sections like pid_tuning disabled with Coming later", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });
    const baseView = get(setupWorkspaceStore);
    const sections = baseView.sections.map((section) => section.id === "pid_tuning"
      ? { ...section, implemented: false }
      : section);
    const sectionGroups = baseView.sectionGroups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => section.id === "pid_tuning"
        ? { ...section, implemented: false }
        : section),
    }));

    cleanup();
    render(SetupWorkspaceSectionNav, {
      sectionGroups,
      selectedSectionId: "overview",
      onSelect: vi.fn(),
    });

    const pidTuningItem = screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-pid_tuning`);
    expect(pidTuningItem.hasAttribute("disabled")).toBe(true);
    expect(pidTuningItem.textContent).toContain("Coming later");
    expect(sections.find((section) => section.id === "pid_tuning")?.implemented).toBe(false);
  });

  it("does not provide an actionable overview bypass for coming-later sections", async () => {
    const { sessionStore, parameterStore, setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });
    const baseView = get(setupWorkspaceStore);
    const sectionGroups = baseView.sectionGroups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => section.id === "pid_tuning"
        ? { ...section, implemented: false }
        : section),
    }));
    const view = {
      ...baseView,
      sectionGroups,
    };

    cleanup();
    render(withShellContexts(sessionStore as unknown as SessionStore, parameterStore, SetupOverviewSection), {
      view,
      onSelect: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Open PID tuning" })).toBeNull();
    expect(screen.getByTestId(`${setupWorkspaceTestIds.overviewCardPrefix}-pid_tuning`).textContent).toContain("Coming later");
  });

  it("drives Full Parameters disabled behavior from availability state instead of gate copy", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });
    const baseView = get(setupWorkspaceStore);
    const sectionGroups = baseView.sectionGroups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => section.id === "full_parameters"
        ? { ...section, availability: "blocked", gateText: "Custom blocked reason." }
        : section),
    }));

    cleanup();
    render(SetupWorkspaceSectionNav, {
      sectionGroups,
      selectedSectionId: "overview",
      onSelect: vi.fn(),
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`).hasAttribute("disabled")).toBe(true);
  });

  it("shows an explicit parameter download state before setup unlocks", async () => {
    await renderSetupWorkspace({
      metadata: null,
      sessionOverrides: {
        bootstrap: {
          missionState: null,
          paramStore: null,
          paramProgress: null,
          playbackCursorUsec: null,
        },
      },
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.overviewSection).textContent).toContain(
      "Download parameters to continue",
    );
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`).getAttribute("data-availability")).toBe("blocked");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`).hasAttribute("disabled")).toBe(true);
  });

  it("keeps unimplemented sections visible but disabled with neutral copy", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });
    const baseView = get(setupWorkspaceStore);
    const sectionGroups = baseView.sectionGroups.map((group) => ({
      ...group,
      sections: group.sections.map((section) => section.id === "pid_tuning"
        ? { ...section, implemented: false }
        : section),
    }));

    cleanup();
    render(SetupWorkspaceSectionNav, {
      sectionGroups,
      selectedSectionId: "overview",
      onSelect: vi.fn(),
    });

    const pidTuningItem = screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-pid_tuning`);
    expect(pidTuningItem.hasAttribute("disabled")).toBe(true);
    expect(pidTuningItem.textContent).toContain("Coming later");
    expect(screen.queryByTestId(setupWorkspaceTestIds.plannedSection)).toBeNull();
  });

  it("mounts GPS with GPS_TYPE fallback, optional GPS2 truth, GNSS staging, and same-scope stale live facts", async () => {
    const gpsParamStore = createParamStoreFromEntries({
      GPS_TYPE: 1,
      GPS_AUTO_CONFIG: 1,
      GPS_GNSS_MODE: 1,
      GPS2_TYPE: 0,
      GPS_AUTO_SWITCH: 1,
      SERIAL3_PROTOCOL: 5,
      SERIAL3_BAUD: 115,
    });
    const { parameterStore, sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        telemetryDomain: createTelemetryDomainState({
          gps: {
            fix_type: "fix_3d",
            satellites: 16,
            hdop: 0.7,
          },
          navigation: {
            latitude_deg: 47.1234567,
            longitude_deg: 8.7654321,
          },
        }),
        bootstrap: {
          missionState: null,
          paramStore: gpsParamStore,
          paramProgress: "completed",
          playbackCursorUsec: null,
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsLiveState).textContent).toContain("Live");
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsPortState).textContent).toContain("SERIAL3");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.gpsInputPrefix}-GPS_TYPE`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.gpsInputPrefix}-GPS2_TYPE`)).toBeTruthy();
    });

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.gpsInputPrefix}-GPS_TYPE`), {
      target: { value: "5" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.gpsStageButtonPrefix}-GPS_TYPE`));
    await fireEvent.click(screen.getByText("SBAS"));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.GPS_TYPE?.nextValue).toBe(5);
      expect(get(parameterStore).stagedEdits.GPS_GNSS_MODE?.nextValue).toBe(3);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-GPS_TYPE`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-GPS_GNSS_MODE`)).toBeTruthy();

    sessionStore.set(createSessionState({
      telemetryDomain: createTelemetryDomainState(null, {
        available: true,
        complete: false,
      }),
      bootstrap: {
        missionState: null,
        paramStore: gpsParamStore,
        paramProgress: "completed",
        playbackCursorUsec: null,
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsLiveState).textContent).toContain("Stale");
      expect(screen.getByTestId(setupWorkspaceTestIds.gpsLiveDetail).textContent).toContain("same-scope");
    });
  });

  it("stages battery board presets and manual numeric edits through the shared review tray", async () => {
    const batteryParamStore = createParamStoreFromEntries({
      BATT_MONITOR: 4,
      BATT_VOLT_PIN: 13,
      BATT_CURR_PIN: 12,
      BATT_VOLT_MULT: 10.1,
      BATT_AMP_PERVLT: 17,
      BATT_CAPACITY: 4500,
      BATT_ARM_VOLT: 13.2,
      BATT_LOW_VOLT: 14.0,
      BATT_CRT_VOLT: 13.6,
      BATT2_MONITOR: 0,
    });
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        telemetryDomain: createTelemetryDomainState({
          power: {
            battery_voltage_v: 15.2,
            battery_current_a: 18.4,
            battery_pct: 63,
            battery_voltage_cells: [3.8, 3.8, 3.8, 3.8],
          },
        }),
        bootstrap: {
          missionState: null,
          paramStore: batteryParamStore,
          paramProgress: "completed",
          playbackCursorUsec: null,
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-battery_monitor`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.batterySection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.batteryLiveState).textContent).toContain("Live");
      expect(screen.getByTestId(setupWorkspaceTestIds.batteryPresetState).textContent).toContain("APM 2.5");
    });

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-board`), {
      target: { value: "4" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.batteryPreviewPrefix}-board`).querySelectorAll("button")[2] as HTMLButtonElement);

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.BATT_VOLT_PIN?.nextValue).toBe(2);
      expect(get(parameterStore).stagedEdits.BATT_CURR_PIN?.nextValue).toBe(3);
    });

    await fireEvent.input(screen.getByTestId(`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_LOW_VOLT`), {
      target: { value: "14.8" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.batteryStageButtonPrefix}-BATT_LOW_VOLT`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.BATT_LOW_VOLT?.nextValue).toBe(14.8);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-BATT_VOLT_PIN`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-BATT_LOW_VOLT`)).toBeTruthy();
  });

  it("surfaces serial conflicts, stages reboot-required rows, and only confirms clean current-scope truth", async () => {
    const serialParamStore = createParamStoreFromEntries({
      SERIAL1_PROTOCOL: 23,
      SERIAL1_BAUD: 57,
      SERIAL2_PROTOCOL: 2,
      SERIAL2_BAUD: 57,
      SERIAL3_PROTOCOL: 5,
      SERIAL3_BAUD: 115,
    });
    const { parameterStore, setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        bootstrap: {
          missionState: null,
          paramStore: serialParamStore,
          paramProgress: "completed",
          playbackCursorUsec: null,
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-serial_ports`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.serialPortsSection)).toBeTruthy();
      expect(get(setupWorkspaceStore).sectionConfirmations.serial_ports).toBe(true);
      expect(screen.getByTestId(setupWorkspaceTestIds.serialPortsConflictState).textContent).toContain("No conflicts");
    });

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.serialPortsInputPrefix}-SERIAL2_PROTOCOL`), {
      target: { value: "5" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.serialPortsStageButtonPrefix}-SERIAL2_PROTOCOL`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.SERIAL2_PROTOCOL?.nextValue).toBe(5);
      expect(get(setupWorkspaceStore).sectionConfirmations.serial_ports).toBe(false);
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.serialPortsRebootState).textContent).toContain("Queued");
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-SERIAL2_PROTOCOL`)).toBeTruthy();

    const partialMetadata = createSetupMetadata();
    partialMetadata.delete("SERIAL1_PROTOCOL");
    partialMetadata.delete("SERIAL1_BAUD");

    cleanup();
    const rerendered = await renderSetupWorkspace({
      metadata: partialMetadata,
      sessionOverrides: {
        bootstrap: {
          missionState: null,
          paramStore: serialParamStore,
          paramProgress: "completed",
          playbackCursorUsec: null,
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-serial_ports`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.serialPortsRecovery).textContent).toContain("SERIAL1_PROTOCOL metadata is missing or malformed");
      expect(get(rerendered.setupWorkspaceStore).sectionConfirmations.serial_ports).toBe(false);
    });
  });

  it("stages frame and orientation edits through the shared params store", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("frame_orientation");
      expect(screen.getByTestId(setupWorkspaceTestIds.frameSection)).toBeTruthy();
    });

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-FRAME_CLASS`), {
      target: { value: "2" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.frameStageButtonPrefix}-FRAME_CLASS`));

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`), {
      target: { value: "1" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.frameStageButtonPrefix}-AHRS_ORIENTATION`));

    const state = get(parameterStore);
    expect(state.stagedEdits.FRAME_CLASS?.nextValue).toBe(2);
    expect(state.stagedEdits.AHRS_ORIENTATION?.nextValue).toBe(1);
    expect(screen.getByTestId(`${setupWorkspaceTestIds.frameStagedPrefix}-FRAME_CLASS`).textContent).toContain("Queued");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`).textContent).toContain("Queued");
  });

  it("shows a Plane-to-QuadPlane enable path and stages Q_ENABLE through the shared review tray", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: createPlaneSessionOverrides(createPlaneSetupParamStore({})),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.frameVehicleState).textContent).toContain("Plain Plane");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`)).toBeTruthy();
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.frameBannerPrefix}-plain-plane`).textContent).toContain(
      "Enable Q_ENABLE",
    );
    expect(screen.getByTestId(setupWorkspaceTestIds.frameDocsLink).getAttribute("href")).toBe(
      "https://ardupilot.org/plane/docs/quadplane-frame-setup.html",
    );
    expect(screen.queryByText(/fixed-wing aircraft do not use frame class or type configuration/i)).toBeNull();

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`), {
      target: { value: "1" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.frameStageButtonPrefix}-Q_ENABLE`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.Q_ENABLE?.nextValue).toBe(1);
    });

    expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-Q_ENABLE`).textContent).toContain(
      "reboot required",
    );
  });

  it("keeps VTOL frame truth blocked until refreshed Q-frame params arrive", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createPlaneSessionOverrides(createPlaneSetupParamStore({ Q_ENABLE: 1 })),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.frameVehicleState).textContent).toContain("Awaiting VTOL refresh");
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.frameBannerPrefix}-awaiting-refresh`).textContent).toContain(
      "Q_FRAME_CLASS and Q_FRAME_TYPE",
    );
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_FRAME_CLASS`)).toBeNull();
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_FRAME_TYPE`)).toBeNull();
    expect(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`)).toBeTruthy();
  });

  it("switches Plane frame ownership to Q_FRAME_* after the QuadPlane params refresh", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: createPlaneSessionOverrides(
        createPlaneSetupParamStore({
          Q_ENABLE: 1,
          Q_FRAME_CLASS: 1,
          Q_FRAME_TYPE: 1,
        }),
      ),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.frameVehicleState).textContent).toContain("QuadPlane ready");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_FRAME_CLASS`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_FRAME_TYPE`)).toBeTruthy();
    });

    expect(screen.queryByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`)).toBeNull();
    expect(screen.getByTestId(setupWorkspaceTestIds.frameDocsLink).getAttribute("href")).toBe(
      "https://ardupilot.org/plane/docs/quadplane-frame-setup.html",
    );

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.frameInputPrefix}-Q_FRAME_TYPE`), {
      target: { value: "0" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.frameStageButtonPrefix}-Q_FRAME_TYPE`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.Q_FRAME_TYPE?.nextValue).toBe(0);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-Q_FRAME_TYPE`)).toBeTruthy();
  });

  it("mounts the real servo outputs section with grouped testers and raw inventory", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore()),
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`)).toBeTruthy();

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("servo_outputs");
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsFunctionGroupPrefix}-4`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawGroupPrefix}-general`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawRowPrefix}-17`)).toBeTruthy();
    });
  });

  it("supports grouped servo testing, raw PWM sends, and shared-tray reversal staging", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore(), {
        telemetryDomain: createTelemetryDomain({
          rc_channels: undefined,
          rc_rssi: undefined,
          servo_outputs: [1502, 1608],
        }),
      }),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-1`).textContent).toContain("1502");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.servoOutputsUnlock));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSafetyState).textContent).toContain("Unlocked");
    });

    await fireEvent.input(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawInputPrefix}-1`), {
      target: { value: "1200" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawSendPrefix}-1`));

    await waitFor(() => {
      expect(calibrationMocks.setServo).toHaveBeenNthCalledWith(1, 1, 1200);
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRowMinPrefix}-1`));
    await waitFor(() => {
      expect(calibrationMocks.setServo).toHaveBeenNthCalledWith(2, 1, 1000);
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRowReversedPrefix}-1`));
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRowReversePrefix}-1`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.SERVO1_REVERSED?.nextValue).toBe(1);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-SERVO1_REVERSED`)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsReversalState).textContent).toContain("queued");
  });

  it("shows live, stale, and unavailable servo readback truth without fabricating PWM", async () => {
    const { sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore(), {
        telemetryDomain: createTelemetryDomain({
          rc_channels: undefined,
          rc_rssi: undefined,
          servo_outputs: [1502, 1608],
        }),
      }),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-1`).textContent).toContain("live");
    });

    sessionStore.set(createSessionState({
      ...createCopterSessionOverrides(createServoSetupParamStore(), {
        telemetryDomain: createTelemetryDomain(
          {
            rc_channels: undefined,
            rc_rssi: undefined,
            servo_outputs: undefined,
          },
          {
            complete: false,
            provenance: "stream",
          },
        ),
      }),
    }));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-1`).textContent).toContain("stale");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-1`).textContent).toContain("1502");
    });

    sessionStore.set(createSessionState({
      ...createCopterSessionOverrides(createServoSetupParamStore(), {
        telemetryDomain: createTelemetryDomain({
          rc_channels: undefined,
          rc_rssi: undefined,
          servo_outputs: [1502, Number.NaN] as any,
        }),
      }),
    }));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-2`).textContent).toContain("unavailable");
    });
  });

  it("keeps unsupported outputs visible and falls back to generic configured groups when VTOL labels are partial", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createPlaneSessionOverrides(createTailsitterServoSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsBannerPrefix}-generic-fallback`).textContent).toContain("generic configured-output groups");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawGroupPrefix}-general`).textContent).toContain("Configured outputs");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawRowPrefix}-17`)).toBeTruthy();
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawAvailabilityPrefix}-17`).textContent).toContain("SERVO1–16");
  });

  it("keeps servo actuation blocked while a reboot checkpoint is unresolved", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
    });

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "resume_pending",
      resumeSectionId: "servo_outputs",
      reason: "Reconnect before continuing servo work.",
    });

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSafetyState).textContent).toContain("Blocked by checkpoint");
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsUnlock).getAttribute("disabled")).not.toBeNull();
  });

  it("keeps the section unlocked and surfaces inline servo-command rejection without implying success", async () => {
    calibrationMocks.setServo.mockRejectedValueOnce(new Error("link dropped"));

    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.servoOutputsUnlock));
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawSendPrefix}-1`));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawErrorPrefix}-1`).textContent).toContain("link dropped");
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSafetyState).textContent).toContain("Unlocked");
    expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSelectedTarget).textContent).toContain("SERVO1");
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.servoOutputsRowResultPrefix}-1`)).toBeNull();
  });

  it("surfaces retained reversal failures next to the affected servo rows", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      paramsService: {
        writeBatch: vi.fn(async (entries: [string, number][]) => entries.map(([name, value]) => ({
          name,
          requested_value: value,
          confirmed_value: name === "SERVO1_REVERSED" ? 0 : value,
          success: name !== "SERVO1_REVERSED",
        }))),
      },
      sessionOverrides: createCopterSessionOverrides(createServoSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-servo_outputs`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsSummary)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawReversePrefix}-1`));
    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.SERVO1_REVERSED?.nextValue).toBe(1);
    });

    await parameterStore.applyStagedEdits();

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.servoOutputsFailure).textContent).toContain("SERVO1_REVERSED");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.servoOutputsRawRowPrefix}-1`).textContent).toContain("Vehicle kept 0 instead of 1");
    });
  });

  it("uses one section-level unlock, preserves ArduPilot row order, and stages reversal through the shared review tray", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: createCopterSessionOverrides(createMotorSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-motors_esc`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSummary)).toBeTruthy();
    });

    const rowIds = Array.from(
      screen
        .getByTestId(setupWorkspaceTestIds.motorsEscSection)
        .querySelectorAll("article[data-testid^='setup-workspace-motors-esc-row-']"),
    ).map((element) => element.getAttribute("data-testid"));
    expect(rowIds).toEqual([
      `${setupWorkspaceTestIds.motorsEscRowPrefix}-1`,
      `${setupWorkspaceTestIds.motorsEscRowPrefix}-4`,
      `${setupWorkspaceTestIds.motorsEscRowPrefix}-2`,
      `${setupWorkspaceTestIds.motorsEscRowPrefix}-3`,
    ]);

    expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSafetyState).textContent).toContain("Locked");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-1`).getAttribute("disabled")).not.toBeNull();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.motorsEscUnlock));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSafetyState).textContent).toContain("Unlocked");
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-1`));
    await waitFor(() => {
      expect(calibrationMocks.motorTest).toHaveBeenCalledWith(1, 5, 2);
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowReversedPrefix}-1`));
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowReversePrefix}-1`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.SERVO1_REVERSED?.nextValue).toBe(1);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-SERVO1_REVERSED`)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscReversalState).textContent).toContain("queued");
  });

  it("keeps the section unlocked and surfaces inline motor-test rejection without implying success", async () => {
    calibrationMocks.motorTest.mockRejectedValueOnce(new Error("bridge offline"));

    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createMotorSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-motors_esc`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSummary)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.motorsEscUnlock));
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-1`));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowErrorPrefix}-1`).textContent).toContain("bridge offline");
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSafetyState).textContent).toContain("Unlocked");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowPrefix}-1`).getAttribute("data-selected")).toBe("true");
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.motorsEscRowResultPrefix}-1`)).toBeNull();
  });

  it("blocks the motors section while a reboot checkpoint is unresolved", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createMotorCheckpointParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-motors_esc`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSummary)).toBeTruthy();
    });

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "resume_pending",
      resumeSectionId: "motors_esc",
      reason: "Reconnect before continuing motor work.",
    });

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSafetyState).textContent).toContain("Blocked by checkpoint");
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscUnlock).getAttribute("disabled")).not.toBeNull();
  });

  it("shows rows above the current motor_test bridge window as visible but non-testable", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: createCopterSessionOverrides(createDodecahexaMotorSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-motors_esc`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.motorsEscSummary)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.motorsEscUnlock));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowPrefix}-9`)).toBeTruthy();
    });
    expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowAvailabilityPrefix}-9`).textContent).toContain("1..=8");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-9`).textContent).toContain("1..=8");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.motorsEscRowTestPrefix}-9`).getAttribute("disabled")).not.toBeNull();
  });

  it("fails closed to the recovery path when frame editor metadata is incomplete", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata({ omitFrameType: true }),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.overviewQuickActionPrefix}-frame_orientation`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("frame_orientation");
      expect(screen.getByTestId(setupWorkspaceTestIds.frameRecovery).textContent).toContain("Frame type metadata is missing");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.frameRecovery).querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    });
  });

  it("renders live RC bars and stages preset-first channel order through the shared review tray", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        telemetryDomain: createTelemetryDomain({
          rc_channels: [1100, 1500, 1900, 1300],
          rc_rssi: 72,
          servo_outputs: undefined,
        }),
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-rc_receiver`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("rc_receiver");
      expect(screen.getByTestId(setupWorkspaceTestIds.rcSection)).toBeTruthy();
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.rcSignal).textContent).toContain("4 live");
    expect(screen.getByTestId(setupWorkspaceTestIds.rcRssi).textContent).toContain("72");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.rcBarPrefix}-1`).textContent).toContain("1100");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.rcBarPrefix}-4`).textContent).toContain("1300");

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.rcPresetPrefix}-taer`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.RCMAP_ROLL?.nextValue).toBe(2);
    });

    expect(get(parameterStore).stagedEdits.RCMAP_PITCH?.nextValue).toBe(3);
    expect(get(parameterStore).stagedEdits.RCMAP_THROTTLE?.nextValue).toBe(1);
    expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-RCMAP_ROLL`).textContent).toContain("reboot required");

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_YAW`), {
      target: { value: "1" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.rcStageButtonPrefix}-RCMAP_YAW`));

    expect(get(parameterStore).stagedEdits.RCMAP_YAW?.nextValue).toBe(1);
    expect(screen.getByTestId(`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_YAW`).textContent).toContain("Queued");
  });

  it("keeps calibration cards honest, surfaces status text, and wires compass lifecycle actions", async () => {
    const { sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: {
        support: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            can_request_prearm_checks: true,
            can_calibrate_accel: true,
            can_calibrate_compass: true,
            can_calibrate_radio: false,
          },
        },
        calibration: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            accel: { lifecycle: "not_started", progress: null, report: null },
            compass: { lifecycle: "not_started", progress: null, report: null },
            radio: null,
          },
        },
        statusText: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            entries: [
              {
                sequence: 2,
                text: "Rotate vehicle to calibrate compass",
                severity: "warning",
              },
            ],
          },
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-calibration`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("calibration");
      expect(screen.getByTestId(setupWorkspaceTestIds.calibrationSection)).toBeTruthy();
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.calibrationCardPrefix}-radio`).textContent).toContain("Unavailable");
    expect(screen.getByTestId(setupWorkspaceTestIds.calibrationNotices).textContent).toContain(
      "Rotate vehicle to calibrate compass",
    );

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.calibrationActionPrefix}-compass`));
    expect(calibrationMocks.calibrateCompassStart).toHaveBeenCalledTimes(1);

    sessionStore.set(createSessionState({
      support: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          can_request_prearm_checks: true,
          can_calibrate_accel: true,
          can_calibrate_compass: true,
          can_calibrate_radio: false,
        },
      },
      calibration: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          accel: { lifecycle: "not_started", progress: null, report: null },
          compass: { lifecycle: "running", progress: null, report: null },
          radio: null,
        },
      },
      statusText: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          entries: [
            {
              sequence: 3,
              text: "Compass calibration running",
              severity: "notice",
            },
          ],
        },
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.calibrationStatusPrefix}-compass`).textContent).toContain("Running");
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.calibrationActionPrefix}-compass`));
    expect(calibrationMocks.calibrateCompassCancel).toHaveBeenCalledTimes(1);

    sessionStore.set(createSessionState({
      support: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          can_request_prearm_checks: true,
          can_calibrate_accel: true,
          can_calibrate_compass: true,
          can_calibrate_radio: false,
        },
      },
      calibration: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          accel: { lifecycle: "not_started", progress: null, report: null },
          compass: { lifecycle: "complete", progress: null, report: null },
          radio: null,
        },
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.calibrationStatusPrefix}-compass`).textContent).toContain("Complete");
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.calibrationActionPrefix}-compass`));
    expect(calibrationMocks.calibrateCompassAccept).toHaveBeenCalledTimes(1);
  });

  it("disables calibration compass actions and shows replay read-only truth during playback", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: {
        activeEnvelope: {
          session_id: "playback-1",
          source_kind: "playback",
          seek_epoch: 1,
          reset_revision: 1,
        },
        activeSource: "playback",
        support: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            can_request_prearm_checks: true,
            can_calibrate_accel: true,
            can_calibrate_compass: true,
            can_calibrate_radio: false,
          },
        },
        calibration: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            accel: { lifecycle: "not_started", progress: null, report: null },
            compass: { lifecycle: "not_started", progress: null, report: null },
            radio: null,
          },
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-calibration`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.calibrationSection)).toBeTruthy();
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.calibrationReplayReadonly).textContent).toContain("Replay is read-only");
    expect((screen.getByTestId(`${setupWorkspaceTestIds.calibrationActionPrefix}-compass`) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mounts flight modes with live availability, stages slot edits, and retains stale same-scope mode truth", async () => {
    const availableModes = [
      { custom_mode: 0, name: "Stabilize" },
      { custom_mode: 2, name: "AltHold" },
      { custom_mode: 3, name: "Auto" },
      { custom_mode: 5, name: "Loiter" },
      { custom_mode: 6, name: "RTL" },
      { custom_mode: 9, name: "Land" },
    ];
    const { parameterStore, setupWorkspaceStore, sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        availableModes,
        telemetryDomain: createTelemetryDomain({
          rc_channels: [0, 0, 0, 0, 1450],
          rc_rssi: 72,
          servo_outputs: undefined,
        }),
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-flight_modes`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.flightModesSection)).toBeTruthy();
      expect(get(setupWorkspaceStore).sectionConfirmations.flight_modes).toBe(true);
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.flightModesAvailabilityState).textContent).toContain("Live");
    expect(screen.getByTestId(setupWorkspaceTestIds.flightModesActiveSlot).textContent).toContain("3");

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.flightModesInputPrefix}-FLTMODE1`), {
      target: { value: "6" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.flightModesStageButtonPrefix}-FLTMODE1`));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.flightModesSimpleChecklist).querySelectorAll("button")[0] as HTMLButtonElement);

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.FLTMODE1?.nextValue).toBe(6);
      expect(get(parameterStore).stagedEdits.SIMPLE?.nextValue).toBe(1);
      expect(get(setupWorkspaceStore).sectionConfirmations.flight_modes).toBe(false);
    });

    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FLTMODE1`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-SIMPLE`)).toBeTruthy();

    sessionStore.set(createSessionState({
      availableModes: [],
      telemetryDomain: createTelemetryDomain({
        rc_channels: [0, 0, 0, 0, 1450],
        rc_rssi: 72,
        servo_outputs: undefined,
      }, {
        available: true,
        complete: false,
      }),
    }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.flightModesAvailabilityState).textContent).toContain("Stale");
    });
    expect(screen.getByTestId(`${setupWorkspaceTestIds.flightModesStageButtonPrefix}-FLTMODE2`).getAttribute("disabled")).not.toBeNull();
  });

  it("stages failsafe defaults, RTL changes, and geofence bitmask edits through the shared review tray", async () => {
    const safetyParamStore = createParamStoreFromEntries({
      ...paramEntries(createSetupParamStore()),
      FS_THR_ENABLE: 0,
      FS_EKF_ACTION: 0,
      FS_GCS_ENABLE: 0,
      RTL_ALT: 0,
      FENCE_TYPE: 0,
    });
    const { parameterStore, setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        bootstrap: {
          missionState: null,
          paramStore: safetyParamStore,
          paramProgress: "completed",
          playbackCursorUsec: null,
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-failsafe`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.failsafeSection)).toBeTruthy();
      expect(get(setupWorkspaceStore).sectionConfirmations.failsafe).toBe(true);
    });

    await fireEvent.click(screen.getByText("Preview defaults"));
    await fireEvent.click(screen.getByText("Stage recommended defaults"));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.FS_THR_ENABLE?.nextValue).toBe(1);
      expect(get(parameterStore).stagedEdits.FS_EKF_ACTION?.nextValue).toBe(1);
      expect(get(setupWorkspaceStore).sectionConfirmations.failsafe).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-rtl_return`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.rtlReturnSection)).toBeTruthy();
    });

    await fireEvent.change(screen.getByTestId(`${setupWorkspaceTestIds.rtlReturnInputPrefix}-RTL_ALT`), {
      target: { value: "15" },
    });
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.rtlReturnStageButtonPrefix}-RTL_ALT`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.RTL_ALT?.nextValue).toBe(1500);
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-geofence`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.geofenceSection)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.geofenceTypeChecklist).querySelectorAll("button")[0] as HTMLButtonElement);

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.FENCE_TYPE?.nextValue).toBe(1);
    });

    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FS_THR_ENABLE`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-RTL_ALT`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FENCE_TYPE`)).toBeTruthy();
  });

  it("shows truthful pre-arm blockers, requests checks, and runs arm/disarm controls against live scope truth", async () => {
    const { sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: {
        statusText: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            entries: [
              {
                sequence: 1,
                text: "PreArm: GPS not healthy",
                severity: "warning",
              },
            ],
          },
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-arming`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.armingReadiness).textContent).toContain("1 blocker");
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.armingBlockers).textContent).toContain("GPS not healthy");
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingRefresh));
    expect(calibrationMocks.requestPrearmChecks).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(setupWorkspaceTestIds.armingArm).getAttribute("disabled")).not.toBeNull();

    sessionStore.set(createSessionState({
      statusText: {
        available: true,
        complete: true,
        provenance: "stream",
        value: { entries: [] },
      },
    }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingReadiness).textContent).toContain("Ready");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingArm));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingArm));
    expect(telemetryMocks.armVehicle).toHaveBeenCalledTimes(1);

    const armedState = createSessionState();
    armedState.statusText = {
      available: true,
      complete: true,
      provenance: "stream",
      value: { entries: [] },
    };
    const vehicleState = armedState.sessionDomain.value?.vehicle_state;
    if (armedState.sessionDomain.value && vehicleState) {
      armedState.sessionDomain = {
        ...armedState.sessionDomain,
        value: {
          ...armedState.sessionDomain.value,
          vehicle_state: {
            ...vehicleState,
            armed: true,
          },
        },
      };
    }
    sessionStore.set(armedState);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingDisarm)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingDisarm));
    expect(telemetryMocks.disarmVehicle).toHaveBeenCalledTimes(1);
  });

  it("surfaces rejected pre-arm refresh and arm failures inline without implying success", async () => {
    calibrationMocks.requestPrearmChecks.mockRejectedValueOnce(new Error("pre-arm link dropped"));
    telemetryMocks.armVehicle.mockRejectedValueOnce(new Error("arm denied"));

    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      sessionOverrides: {
        statusText: {
          available: true,
          complete: true,
          provenance: "stream",
          value: { entries: [] },
        },
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-arming`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.armingReadiness).textContent).toContain("Ready");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingRefresh));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingFailure).textContent).toContain("pre-arm link dropped");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingArm));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.armingArm));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.armingFailure).textContent).toContain("arm denied");
    });
    expect(telemetryMocks.armVehicle).toHaveBeenCalledTimes(1);
  });

  it("stages initial-parameter control previews through the shared review tray", async () => {
    const { parameterStore } = await renderSetupWorkspace({
      metadata: createSetupTuningMetadata(),
      includeReviewTray: true,
      sessionOverrides: createCopterSessionOverrides(createInitialParamsSetupParamStore()),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-initial_params`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.initialParamsSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.initialParamsFamilyState).textContent).toContain("Multirotor");
    });

    const controlPreview = screen.getByTestId(`${setupWorkspaceTestIds.initialParamsPreviewPrefix}-control_baseline`);
    const batchCheckbox = controlPreview.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(batchCheckbox).toBeTruthy();

    await fireEvent.click(batchCheckbox as HTMLInputElement);
    await fireEvent.click(screen.getByRole("button", { name: "Stage 1 selected batch" }));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.MOT_THST_EXPO?.nextValue).toBeCloseTo(0.58, 2);
      expect(get(parameterStore).stagedEdits.ATC_RAT_PIT_FLTD?.nextValue).toBe(23);
    });
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-MOT_THST_EXPO`)).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-ATC_RAT_PIT_FLTD`)).toBeTruthy();
  });

  it("keeps malformed PID enum metadata visible as raw-name read-only rows instead of inventing labels", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupTuningMetadata({ malformedPidEnum: true }),
      sessionOverrides: createCopterSessionOverrides(createPidCopterSetupParamStore()),
    });

    setupWorkspaceStore.selectSection("pid_tuning");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.pidTuningSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.pidTuningFamilyState).textContent).toContain("Multirotor");
      expect(screen.getByTestId(`${setupWorkspaceTestIds.pidTuningGroupPrefix}-filters`)).toBeTruthy();
    });

    expect(screen.getByTestId(`${parameterWorkspaceTestIds.itemPrefix}-INS_HNTCH_ENABLE`).textContent).toContain("INS_HNTCH_ENABLE");
    expect(screen.getByTestId(`${parameterWorkspaceTestIds.itemPrefix}-INS_HNTCH_ENABLE`).textContent?.toLowerCase()).toContain("read only");
  });

  it("shows an explicit QuadPlane PID gap banner when VTOL tuning truth is still partial", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupTuningMetadata(),
      sessionOverrides: createPlaneSessionOverrides(createPlaneSetupParamStore({ Q_ENABLE: 1 })),
    });

    setupWorkspaceStore.selectSection("pid_tuning");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.pidTuningSection)).toBeTruthy();
      expect(screen.getByTestId(setupWorkspaceTestIds.pidTuningFamilyState).textContent).toContain("QuadPlane refresh required");
    });

    expect(screen.getByTestId(`${setupWorkspaceTestIds.pidTuningBannerPrefix}-quadplane-refresh`).textContent).toContain("Q_A_*");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.pidTuningBannerPrefix}-quadplane-refresh`).textContent).toContain("Q_M_*");
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.pidTuningGroupPrefix}-servo`)).toBeNull();
  });

  it("filters peripherals down to configured groups while preserving discovered extra inventories", async () => {
    const { setupWorkspaceStore } = await renderSetupWorkspace({
      metadata: createSetupTuningMetadata(),
      sessionOverrides: createCopterSessionOverrides(createPeripheralsSetupParamStore()),
    });

    setupWorkspaceStore.selectSection("peripherals");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.peripheralsSection)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-rangefinder`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-optical-flow`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-EFI`)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.peripheralsFilter));

    await waitFor(() => {
      expect(screen.getByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-rangefinder`)).toBeTruthy();
      expect(screen.getByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-EFI`)).toBeTruthy();
    });
    expect(screen.queryByTestId(`${setupWorkspaceTestIds.peripheralsGroupPrefix}-optical-flow`)).toBeNull();
  });

  it("routes unsupported initial-parameter families to the Full Parameters recovery handoff", async () => {
    await renderSetupWorkspace({
      metadata: createSetupTuningMetadata(),
      sessionOverrides: createPlaneSessionOverrides(createPlaneSetupParamStore({ Q_ENABLE: 0 })),
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-initial_params`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.initialParamsRecovery).textContent).toContain("Fixed-wing");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.initialParamsRecovery).querySelector("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    });
  });

  it("shows an inline reboot checkpoint, resumes after reconnect, and lets the operator clear the banner", async () => {
    const { sessionStore, parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        telemetryDomain: createTelemetryDomain({
          rc_channels: [1100, 1500, 1900, 1300],
          rc_rssi: 84,
          servo_outputs: undefined,
        }),
      },
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-rc_receiver`));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.rcSection)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.rcPresetPrefix}-taer`));

    await waitFor(() => {
      expect(get(parameterStore).stagedEdits.RCMAP_ROLL?.nextValue).toBe(2);
    });

    await parameterStore.applyStagedEdits();

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.checkpoint)).toBeTruthy();
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.checkpointDetail).textContent).toContain("Reboot");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.rcPresetPrefix}-aetr`).getAttribute("disabled")).not.toBeNull();

    sessionStore.set(createSessionState({
      activeEnvelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
      telemetryDomain: createTelemetryDomain({
        rc_channels: [1200, 1600, 1800, 1400],
        rc_rssi: 88,
        servo_outputs: undefined,
      }),
    }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.checkpointDetail).textContent).toContain("Resumed");
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("rc_receiver");
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.checkpointDismiss));

    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.checkpoint)).toBeNull();
    });
  });

  it("keeps the wizard section unmounted until the operator opens it from overview", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    expect(screen.queryByTestId(setupWorkspaceTestIds.beginnerWizardSection)).toBeNull();
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardRoot)).toBeNull();
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewSection)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch)).toBeTruthy();
  });

  it("selects the beginner_wizard section and auto-starts the wizard when the launch button is clicked", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.beginnerWizardSection)).toBeTruthy();
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardRoot)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe(
      "beginner_wizard",
    );
    // Auto-start skips the idle start screen and lands on the first step.
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    expect(screen.queryByTestId(setupWorkspaceTestIds.overviewSection)).toBeNull();
  });

  it("returns to the overview section when the wizard close button is clicked", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardClose));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.overviewSection)).toBeTruthy();
    });
    expect(screen.queryByTestId(setupWorkspaceTestIds.beginnerWizardSection)).toBeNull();
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardRoot)).toBeNull();
  });

  it("renders the frame step surface when the wizard section is entered", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));

    await waitFor(() => {
      expect(
        screen.getByTestId(
          `${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation`,
        ),
      ).toBeTruthy();
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameSummary)).toBeTruthy();
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply)).toBeTruthy();
  });

  it("flips the beginner_wizard section status to in_progress after entering the wizard", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    });

    // Returning to the overview section should keep the wizard's
    // in_progress status visible in the grouped dashboard because the
    // wizard remains mid-run (paused into detour) rather than resetting.
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardClose));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.overviewSection)).toBeTruthy();
    });
    const statusEl = screen.getByTestId(
      `${setupWorkspaceTestIds.sectionStatusPrefix}-beginner_wizard`,
    );
    expect(statusEl.textContent).toContain("In Progress");
  });

  it("pauses the wizard into the detour banner when navigating away from the wizard section", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    });

    // Navigate away via the inline nav rail, then re-enter the wizard
    // section. Re-entry does NOT auto-start again because the phase is
    // `paused_detour`, so the paused banner must be the visible state.
    await fireEvent.click(
      screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`),
    );
    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();
    });
    await fireEvent.click(
      screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-beginner_wizard`),
    );

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedDetour)).toBeTruthy();
    });
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();
  });

  it("pauses the wizard into the scope banner when the session envelope changes family", async () => {
    const { sessionStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    });

    sessionStore.set(
      createSessionState({
        activeEnvelope: {
          session_id: "session-2",
          source_kind: "live",
          seek_epoch: 0,
          reset_revision: 0,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedScope)).toBeTruthy();
    });
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();
  });

  it("keeps the inline section nav rail visible on wide tier without the drawer toggle", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("wide"),
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.nav)).toBeTruthy();
    expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawerToggle)).toBeNull();
    expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeNull();
  });

  it("hides the inline section nav rail on phone tier and exposes a drawer toggle", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("phone"),
    });

    expect(screen.queryByTestId(setupWorkspaceTestIds.nav)).toBeNull();
    expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerToggle)).toBeTruthy();
    expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeNull();
  });

  it("opens the section drawer and mounts the nav rail inside it on phone tier", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("phone"),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerToggle));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeTruthy();
    });
    const navs = screen.queryAllByTestId(setupWorkspaceTestIds.nav);
    expect(navs).toHaveLength(1);
    expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawer).contains(navs[0])).toBe(true);
  });

  it("closes the drawer and applies the selection when a section is picked from the drawer", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("phone"),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerToggle));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`));

    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeNull();
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("gps");
  });

  it("closes the drawer when the close button is clicked on phone tier", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("phone"),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerToggle));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerClose));

    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeNull();
    });
  });

  it("closes the drawer when the backdrop is clicked on phone tier", async () => {
    await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      chromeStore: createStaticShellChromeStore("phone"),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerToggle));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.sectionDrawerBackdrop));

    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.sectionDrawer)).toBeNull();
    });
  });
});

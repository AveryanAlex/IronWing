// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calibrationMocks = vi.hoisted(() => ({
  calibrateCompassStart: vi.fn(async () => undefined),
  calibrateCompassAccept: vi.fn(async () => undefined),
  calibrateCompassCancel: vi.fn(async () => undefined),
}));

vi.mock("../../calibration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../calibration")>();
  return {
    ...actual,
    ...calibrationMocks,
  };
});

import type { DomainValue } from "../../lib/domain-status";
import { missingDomainValue } from "../../lib/domain-status";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import {
  createParamsStore,
  type ParamsStore,
} from "../../lib/stores/params";
import type { SessionStore, SessionStoreState } from "../../lib/stores/session";
import {
  createSetupWorkspaceStore,
  createSetupWorkspaceViewStore,
} from "../../lib/stores/setup-workspace";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { withShellContexts } from "../../test/context-harnesses";
import type { TelemetryState } from "../../telemetry";
import { appShellTestIds } from "../../app/shell/chrome-state";
import ParameterReviewTray from "../../app/shell/ParameterReviewTray.svelte";
import { parameterWorkspaceTestIds } from "../params/parameter-workspace-test-ids";
import SetupWorkspace from "./SetupWorkspace.svelte";
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

function createSetupParamStore(): ParamStore {
  return {
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
      "ARMING_CHECK",
      {
        humanName: "Arming checks",
        description: "Controls pre-arm validation.",
      },
    ],
    [
      "FS_THR_ENABLE",
      {
        humanName: "Throttle failsafe",
        description: "Select the throttle failsafe behavior.",
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

  return metadata;
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
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewBanner).textContent).toContain("Partial live facts stay explicit");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionStatusPrefix}-frame_orientation`).textContent?.trim()).toBe("Unknown");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionConfidencePrefix}-frame_orientation`).textContent?.trim()).toBe("Unconfirmed");
    expect(screen.getByTestId(setupWorkspaceTestIds.detailRecovery).textContent).toContain("Full Parameters stays separate");
    expect(screen.getByTestId(setupWorkspaceTestIds.notices).textContent).toContain("Compass not calibrated");
  });

  it("keeps full parameters as the explicit recovery surface when metadata is unavailable", async () => {
    await renderSetupWorkspace({ metadata: null });

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.notice).textContent).toContain(
        "Full Parameters is the recovery path",
      );
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.overviewBanner).textContent).toContain(
      "Metadata missing — recovery mode is active",
    );
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`).getAttribute("disabled")).not.toBeNull();

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(setupWorkspaceTestIds.fullParameters)).toBeTruthy();
      expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
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
          servo_outputs: null,
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

  it("shows an inline reboot checkpoint, resumes after reconnect, and lets the operator clear the banner", async () => {
    const { sessionStore, parameterStore } = await renderSetupWorkspace({
      metadata: createSetupMetadata(),
      includeReviewTray: true,
      sessionOverrides: {
        telemetryDomain: createTelemetryDomain({
          rc_channels: [1100, 1500, 1900, 1300],
          rc_rssi: 84,
          servo_outputs: null,
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
        servo_outputs: null,
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
});

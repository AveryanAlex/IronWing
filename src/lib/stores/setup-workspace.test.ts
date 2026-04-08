import { get, writable } from "svelte/store";
import { describe, expect, it } from "vitest";

import type { TelemetryState } from "../../telemetry";
import { missingDomainValue, type DomainValue } from "../domain-status";
import {
  createSetupWorkspaceStore,
  type SetupWorkspaceSection,
  type SetupWorkspaceSectionGroup,
  type SetupWorkspaceStoreState,
} from "./setup-workspace";
import type { ParamsStoreState } from "./params";
import type { SessionStoreState } from "./session";

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
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: {
          armed: false,
          custom_mode: 0,
          mode_name: "Loiter",
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
        gps: null,
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
      value: { entries: [] },
    },
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
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

function createParamsState(overrides: Partial<ParamsStoreState> = {}): ParamsStoreState {
  return {
    hydrated: true,
    phase: "ready",
    streamReady: true,
    streamError: null,
    sessionHydrated: true,
    sessionPhase: "ready",
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource: "live",
    liveSessionConnected: true,
    vehicleType: "quadrotor",
    paramStore: {
      expected_count: 6,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 1, param_type: "uint8", index: 1 },
        RCMAP_ROLL: { name: "RCMAP_ROLL", value: 1, param_type: "uint8", index: 2 },
        RCMAP_PITCH: { name: "RCMAP_PITCH", value: 2, param_type: "uint8", index: 3 },
        RCMAP_THROTTLE: { name: "RCMAP_THROTTLE", value: 3, param_type: "uint8", index: 4 },
        RCMAP_YAW: { name: "RCMAP_YAW", value: 4, param_type: "uint8", index: 5 },
      },
    },
    paramProgress: "completed",
    metadata: new Map([
      [
        "ARMING_CHECK",
        {
          humanName: "Arming checks",
          description: "Controls pre-arm validation.",
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
    ]),
    metadataState: "ready",
    metadataError: null,
    stagedEdits: {},
    retainedFailures: {},
    applyPhase: "idle",
    applyError: null,
    applyProgress: null,
    scopeClearWarning: null,
    lastNotice: null,
    ...overrides,
  };
}

function createStagedRcEdit(name: "RCMAP_ROLL" | "RCMAP_PITCH" | "RCMAP_THROTTLE" | "RCMAP_YAW", nextValue: number) {
  const currentValue = createParamsState().paramStore?.params[name]?.value ?? 0;

  return {
    name,
    label: name.replace("RCMAP_", ""),
    rawName: name,
    description: `${name} staging`,
    currentValue,
    currentValueText: String(currentValue),
    nextValue,
    nextValueText: String(nextValue),
    units: null,
    rebootRequired: true,
    order: 10,
  };
}

function readSection(state: SetupWorkspaceStoreState, id: SetupWorkspaceSection["id"]) {
  return state.sections.find((section) => section.id === id) ?? null;
}

function readGroup(state: SetupWorkspaceStoreState, id: SetupWorkspaceSectionGroup["id"]) {
  return state.sectionGroups.find((group) => group.id === id) ?? null;
}

describe("setup workspace store", () => {
  it("exposes the full grouped expert catalog with conservative initial progress", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    const state = get(store);
    const frameSection = readSection(state, "frame_orientation");
    const gpsSection = readSection(state, "gps");
    const hardwareGroup = readGroup(state, "hardware");
    const safetyGroup = readGroup(state, "safety");
    const tuningGroup = readGroup(state, "tuning");

    expect(state.stateText).toBe("Setup ready");
    expect(state.selectedSectionId).toBe("overview");
    expect(state.sections.map((section) => section.id)).toEqual([
      "overview",
      "frame_orientation",
      "calibration",
      "gps",
      "battery_monitor",
      "motors_esc",
      "servo_outputs",
      "serial_ports",
      "rc_receiver",
      "flight_modes",
      "failsafe",
      "rtl_return",
      "geofence",
      "arming",
      "initial_params",
      "pid_tuning",
      "peripherals",
      "full_parameters",
    ]);
    expect(state.progressText).toBe("1/13 confirmed");
    expect(state.sectionStatuses.frame_orientation).toBe("unknown");
    expect(frameSection?.statusText).toBe("Unknown");
    expect(frameSection?.confidenceText).toBe("Unconfirmed");
    expect(gpsSection?.implemented).toBe(false);
    expect(hardwareGroup?.progressText).toBe("0/6 confirmed");
    expect(safetyGroup?.progressText).toBe("1/6 confirmed");
    expect(tuningGroup?.progressText).toBe("0/1 confirmed");
  });

  it("keeps blocked sections visible and selectable when metadata is unavailable", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState({
      metadata: null,
      metadataState: "unavailable",
      metadataError: "Parameter metadata is unavailable for this vehicle type.",
    }));
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    store.selectSection("gps");
    store.selectSection("not-a-section");

    const state = get(store);
    const overviewSection = readSection(state, "overview");
    const gpsSection = readSection(state, "gps");
    const fullParametersSection = readSection(state, "full_parameters");

    expect(state.selectedSectionId).toBe("gps");
    expect(state.noticeText).toContain("Full Parameters is the recovery path");
    expect(overviewSection?.availability).toBe("available");
    expect(fullParametersSection?.availability).toBe("available");
    expect(gpsSection?.availability).toBe("blocked");
    expect(gpsSection?.gateText).toContain("Full Parameters is the recovery path");
  });

  it("keeps frontend confirmations scoped to the active setup scope and drops malformed payloads", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    store.confirmSection("flight_modes");

    let state = get(store);
    expect(state.sectionStatuses.flight_modes).toBe("complete");
    expect(state.sectionConfirmations.flight_modes).toBe(true);
    expect(state.confirmationScopeKey).toBe("session-1:live:0:0");

    sessionStore.set(createSessionState({
      activeEnvelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
    }));

    state = get(store);
    expect(state.sectionStatuses.flight_modes).toBe("not_started");
    expect(state.sectionConfirmations.flight_modes).toBe(false);
    expect(state.confirmationScopeKey).toBe("session-1:live:0:1");

    store.replaceSectionConfirmations({
      scopeKey: "session-1:live:0:1",
      confirmedSections: {
        flight_modes: true,
        unknown_section: true,
      },
    });

    state = get(store);
    expect(state.sectionStatuses.flight_modes).toBe("complete");
    expect(state.sectionStatuses.geofence).toBe("not_started");

    store.replaceSectionConfirmations({
      scopeKey: "session-1:live:0:1",
      confirmedSections: "malformed",
    });

    state = get(store);
    expect(state.sectionStatuses.flight_modes).toBe("not_started");
    expect(state.sectionConfirmations.flight_modes).toBe(false);

    store.replaceSectionConfirmations({
      scopeKey: "session-stale:live:0:0",
      confirmedSections: {
        flight_modes: true,
      },
    });

    state = get(store);
    expect(state.sectionStatuses.flight_modes).toBe("not_started");
    expect(state.sectionConfirmations.flight_modes).toBe(false);
  });

  it("keeps last good RC samples stale on same-scope gaps and drops malformed values", () => {
    const sessionStore = writable(createSessionState({
      telemetryDomain: createTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300],
        rc_rssi: 84,
        servo_outputs: null,
      }),
    }));
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    const liveState = get(store);
    expect(liveState.rcReceiver.signalState).toBe("live");
    expect(liveState.rcReceiver.channels).toHaveLength(4);
    expect(liveState.rcReceiver.rssiText).toContain("84");

    sessionStore.set(createSessionState({
      telemetryDomain: createTelemetryDomain({
        rc_channels: [1100, Number.NaN, 65535, 1400] as unknown as number[],
        rc_rssi: 84,
        servo_outputs: null,
      }),
    }));

    const malformedState = get(store);
    expect(malformedState.rcReceiver.signalState).toBe("degraded");
    expect(malformedState.rcReceiver.channels.map((channel) => channel.channel)).toEqual([1, 4]);
    expect(malformedState.rcReceiver.detailText).toContain("Dropped invalid");

    sessionStore.set(createSessionState({
      sessionDomain: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "pending",
          connection: { kind: "disconnected" },
          vehicle_state: {
            armed: false,
            custom_mode: 0,
            mode_name: "Loiter",
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
      telemetryDomain: createTelemetryDomain(null, {
        available: true,
        complete: false,
      }),
    }));

    const staleState = get(store);
    expect(staleState.rcReceiver.signalState).toBe("stale");
    expect(staleState.rcReceiver.channels.map((channel) => channel.channel)).toEqual([1, 4]);
    expect(staleState.rcReceiver.detailText).toContain("Last good sample");
  });

  it("creates a reboot checkpoint after successful reboot-required apply and resumes the same section on reconnect", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    store.selectSection("rc_receiver");

    paramsStore.set(createParamsState({
      stagedEdits: {
        RCMAP_ROLL: createStagedRcEdit("RCMAP_ROLL", 2),
      },
      applyPhase: "applying",
      applyProgress: {
        completed: 0,
        total: 1,
        activeName: "RCMAP_ROLL",
      },
    }));

    paramsStore.set(createParamsState({
      paramStore: {
        expected_count: 6,
        params: {
          ...createParamsState().paramStore?.params,
          RCMAP_ROLL: { name: "RCMAP_ROLL", value: 2, param_type: "uint8", index: 2 },
        } as NonNullable<ParamsStoreState["paramStore"]>["params"],
      },
      stagedEdits: {},
      applyPhase: "idle",
      applyProgress: null,
    }));

    const pendingState = get(store);
    expect(pendingState.checkpoint.phase).toBe("resume_pending");
    expect(pendingState.checkpoint.blocksActions).toBe(true);
    expect(pendingState.checkpoint.resumeSectionId).toBe("rc_receiver");

    sessionStore.set(createSessionState({
      activeEnvelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
    }));

    const resumedState = get(store);
    expect(resumedState.checkpoint.phase).toBe("resume_complete");
    expect(resumedState.checkpoint.blocksActions).toBe(false);
    expect(resumedState.selectedSectionId).toBe("rc_receiver");
    expect(resumedState.checkpoint.detailText).toContain("Resumed");
  });

  it("flags scope changes while a checkpoint is pending and clears the resume target", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    store.selectSection("calibration");

    paramsStore.set(createParamsState({
      stagedEdits: {
        RCMAP_PITCH: createStagedRcEdit("RCMAP_PITCH", 3),
      },
      applyPhase: "applying",
      applyProgress: {
        completed: 0,
        total: 1,
        activeName: "RCMAP_PITCH",
      },
    }));

    paramsStore.set(createParamsState({
      stagedEdits: {},
      applyPhase: "idle",
      applyProgress: null,
    }));

    expect(get(store).checkpoint.phase).toBe("resume_pending");

    sessionStore.set(createSessionState({
      activeEnvelope: {
        session_id: "session-2",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
    }));

    const nextScopeState = get(store);
    expect(nextScopeState.checkpoint.phase).toBe("scope_changed");
    expect(nextScopeState.checkpoint.resumeSectionId).toBeNull();
    expect(nextScopeState.selectedSectionId).toBe("overview");
    expect(nextScopeState.checkpoint.detailText).toContain("review current values");
  });
});

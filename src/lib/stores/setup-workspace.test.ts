import { get, writable } from "svelte/store";
import { describe, expect, it } from "vitest";

import { missingDomainValue } from "../domain-status";
import {
  createSetupWorkspaceStore,
  type SetupWorkspaceSection,
  type SetupWorkspaceStoreState,
} from "./setup-workspace";
import type { ParamsStoreState } from "./params";
import type { SessionStoreState } from "./session";

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
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 1, param_type: "uint8", index: 1 },
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

function readSection(state: SetupWorkspaceStoreState, id: SetupWorkspaceSection["id"]) {
  return state.sections.find((section) => section.id === id) ?? null;
}

describe("setup workspace store", () => {
  it("keeps partial live facts explicit instead of fabricating completion", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    const state = get(store);
    const frameSection = readSection(state, "frame_orientation");

    expect(state.stateText).toBe("Setup ready");
    expect(state.selectedSectionId).toBe("overview");
    expect(state.sectionStatuses.frame_orientation).toBe("unknown");
    expect(frameSection?.statusText).toBe("Unknown");
    expect(frameSection?.confidenceText).toBe("Unconfirmed");
  });

  it("keeps overview and full-parameters reachable when metadata is unavailable", () => {
    const sessionStore = writable(createSessionState());
    const paramsStore = writable(createParamsState({
      metadata: null,
      metadataState: "unavailable",
      metadataError: "Parameter metadata is unavailable for this vehicle type.",
    }));
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    store.selectSection("full_parameters");
    store.selectSection("not-a-section");

    const state = get(store);
    const overviewSection = readSection(state, "overview");
    const frameSection = readSection(state, "frame_orientation");
    const fullParametersSection = readSection(state, "full_parameters");

    expect(state.selectedSectionId).toBe("full_parameters");
    expect(state.noticeText).toContain("Full Parameters is the recovery path");
    expect(overviewSection?.availability).toBe("available");
    expect(fullParametersSection?.availability).toBe("available");
    expect(frameSection?.availability).toBe("gated");
    expect(frameSection?.gateText).toContain("Full Parameters is the recovery path");
  });

  it("preserves same-scope truth across malformed updates and clears checkpoint state on scope change", () => {
    const sessionStore = writable(createSessionState({
      configurationFacts: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          frame: { configured: true },
          gps: null,
          battery_monitor: null,
          motors_esc: null,
        },
      },
    }));
    const paramsStore = writable(createParamsState());
    const store = createSetupWorkspaceStore(sessionStore, paramsStore);

    expect(get(store).sectionStatuses.frame_orientation).toBe("complete");

    store.setCheckpointPlaceholder({
      resumeSectionId: "calibration",
      scopeKey: get(store).activeScopeKey,
      reason: "Waiting for reconnect.",
    });

    sessionStore.set(createSessionState({
      configurationFacts: {
        available: false,
        complete: false,
        provenance: "stream",
        value: null,
      },
    }));

    const sameScopeState = get(store);
    expect(sameScopeState.sectionStatuses.frame_orientation).toBe("complete");
    expect(sameScopeState.checkpoint.phase).toBe("resume_pending");

    sessionStore.set(createSessionState({
      activeEnvelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 1,
      },
      configurationFacts: {
        available: false,
        complete: false,
        provenance: "stream",
        value: null,
      },
    }));

    const nextScopeState = get(store);
    expect(nextScopeState.sectionStatuses.frame_orientation).toBe("unknown");
    expect(nextScopeState.checkpoint.phase).toBe("idle");
  });
});

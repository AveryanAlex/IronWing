import { mockState, requireLiveEnvelope } from "./runtime";
import type { MockMissionProgressState, MockMissionState, MockPlatformEvent } from "./types";

export function normalizedMissionState(mockMissionState?: Partial<MockMissionState> | null): MockMissionState {
  return {
    plan: mockMissionState?.plan ?? null,
    current_index: mockMissionState?.current_index ?? null,
    sync: mockMissionState?.sync ?? "current",
    active_op: mockMissionState?.active_op ?? null,
  };
}

export function applyMockMissionState(mockMissionState?: Partial<MockMissionState> | null) {
  mockState.liveMissionState = normalizedMissionState(mockMissionState);
}

export function liveMissionStateStreamEvent(missionState: MockMissionState): MockPlatformEvent {
  return {
    event: "mission://state",
    payload: {
      envelope: requireLiveEnvelope(),
      value: missionState,
    },
  };
}

export function liveMissionProgressStreamEvent(missionProgress: MockMissionProgressState): MockPlatformEvent {
  return {
    event: "mission://progress",
    payload: {
      envelope: requireLiveEnvelope(),
      value: missionProgress,
    },
  };
}

export function missionDownloadResult() {
  return {
    plan: {
      items: [
        {
          command: { Nav: { Takeoff: { position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 25 } }, pitch_deg: 15 } } },
          current: true,
          autocontinue: true,
        },
        {
          command: { Nav: { Waypoint: { position: { RelHome: { latitude_deg: 47.4, longitude_deg: 8.55, relative_alt_m: 30 } }, hold_time_s: 0, acceptance_radius_m: 1, pass_radius_m: 0, yaw_deg: 0 } } },
          current: false,
          autocontinue: true,
        },
      ],
    },
    home: null,
  };
}

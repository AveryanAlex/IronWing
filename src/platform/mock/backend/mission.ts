import type { FencePlan } from "../../../fence";
import type {
  HomePosition,
  MissionIssue,
  MissionOperationKind,
  MissionPlan,
  TransferProgress,
} from "../../../mission";
import type { RallyPlan } from "../../../rally";
import { mockState, requireLiveEnvelope } from "./runtime";
import type { CommandArgs, MockMissionProgressState, MockMissionState, MockPlatformEvent } from "./types";

const DEFAULT_MISSION_PLAN: MissionPlan = {
  items: [
    {
      command: {
        Nav: {
          Takeoff: {
            position: {
              RelHome: {
                latitude_deg: 47.397742,
                longitude_deg: 8.545594,
                relative_alt_m: 25,
              },
            },
            pitch_deg: 15,
          },
        },
      },
      current: true,
      autocontinue: true,
    },
    {
      command: {
        Nav: {
          Waypoint: {
            position: {
              RelHome: {
                latitude_deg: 47.4,
                longitude_deg: 8.55,
                relative_alt_m: 30,
              },
            },
            hold_time_s: 0,
            acceptance_radius_m: 1,
            pass_radius_m: 0,
            yaw_deg: 0,
          },
        },
      },
      current: false,
      autocontinue: true,
    },
  ],
};

const DEFAULT_MISSION_HOME: HomePosition | null = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
  altitude_m: 488,
};

const DEFAULT_FENCE_PLAN: FencePlan = {
  return_point: { latitude_deg: 47.397, longitude_deg: 8.545 },
  regions: [
    {
      inclusion_polygon: {
        vertices: [
          { latitude_deg: 47.39, longitude_deg: 8.53 },
          { latitude_deg: 47.41, longitude_deg: 8.53 },
          { latitude_deg: 47.41, longitude_deg: 8.56 },
          { latitude_deg: 47.39, longitude_deg: 8.56 },
        ],
        inclusion_group: 0,
      },
    },
  ],
};

const DEFAULT_RALLY_PLAN: RallyPlan = {
  points: [
    {
      RelHome: {
        latitude_deg: 47.397,
        longitude_deg: 8.545,
        relative_alt_m: 30,
      },
    },
  ],
};

function cloneMissionValue<T>(value: T): T {
  return structuredClone(value);
}

function isMissionPlan(value: unknown): value is MissionPlan {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items));
}

function normalizeCurrentIndex(value: number | null | undefined, plan: MissionPlan | null): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (!plan || value < 0 || value >= plan.items.length) {
    return null;
  }

  return value;
}

function defaultCurrentIndex(plan: MissionPlan): number | null {
  const currentIndex = plan.items.findIndex((item) => item.current);
  return currentIndex >= 0 ? currentIndex : null;
}

export function normalizedMissionState(mockMissionState?: Partial<MockMissionState> | null): MockMissionState {
  const plan = isMissionPlan(mockMissionState?.plan)
    ? cloneMissionValue(mockMissionState.plan)
    : null;

  return {
    plan,
    current_index: normalizeCurrentIndex(mockMissionState?.current_index ?? null, plan),
    sync: mockMissionState?.sync ?? "current",
    active_op: mockMissionState?.active_op ?? null,
  };
}

export function applyMockMissionState(mockMissionState?: Partial<MockMissionState> | null) {
  mockState.liveMissionState = normalizedMissionState(mockMissionState);
}

export function currentMissionState(): MockMissionState {
  return normalizedMissionState(mockState.liveMissionState);
}

export function missionStateWithActiveOperation(kind: MissionOperationKind): MockMissionState {
  return normalizedMissionState({
    ...currentMissionState(),
    active_op: kind,
  });
}

export function commitMockMissionPlan(plan: MissionPlan) {
  const nextPlan = cloneMissionValue(plan);
  mockState.liveMissionState = normalizedMissionState({
    ...currentMissionState(),
    plan: nextPlan,
    current_index: defaultCurrentIndex(nextPlan),
    sync: "current",
    active_op: null,
  });
}

export function clearMockMissionPlan() {
  mockState.liveMissionState = normalizedMissionState({
    ...currentMissionState(),
    plan: { items: [] },
    current_index: null,
    sync: "current",
    active_op: null,
  });
}

export function setMockMissionCurrentIndex(seq: number) {
  mockState.liveMissionState = normalizedMissionState({
    ...currentMissionState(),
    current_index: seq,
    active_op: null,
  });
}

export function missionDownloadResult() {
  const liveMission = currentMissionState();
  const plan = liveMission.plan ? cloneMissionValue(liveMission.plan) : cloneMissionValue(DEFAULT_MISSION_PLAN);
  const current_index = liveMission.current_index ?? defaultCurrentIndex(plan);

  mockState.liveMissionState = normalizedMissionState({
    ...liveMission,
    plan,
    current_index,
    sync: "current",
    active_op: null,
  });

  return {
    plan: cloneMissionValue(plan),
    home: cloneMissionValue(mockState.liveMissionHome ?? DEFAULT_MISSION_HOME),
  };
}

export function fenceDownloadResult(): FencePlan {
  return cloneMissionValue(mockState.liveFencePlan ?? DEFAULT_FENCE_PLAN);
}

export function rallyDownloadResult(): RallyPlan {
  return cloneMissionValue(mockState.liveRallyPlan ?? DEFAULT_RALLY_PLAN);
}

export function validateMissionPlanArgs(args: CommandArgs, label: string): MissionPlan {
  const plan = args?.plan;
  if (!isMissionPlan(plan)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return cloneMissionValue(plan);
}

export function validateMissionSetCurrentArgs(args: CommandArgs): number {
  const seq = args?.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) {
    throw new Error("missing or invalid mission_set_current.seq");
  }

  return seq;
}

export function missionValidateResult(args: CommandArgs): MissionIssue[] {
  const plan = validateMissionPlanArgs(args, "mission_validate.plan");

  if (plan.items.length === 0) {
    return [
      {
        code: "MISSION_EMPTY",
        message: "Mission does not contain any items.",
        severity: "warning",
      },
    ];
  }

  return [];
}

export function missionProgressState(
  direction: TransferProgress["direction"],
  phase: TransferProgress["phase"],
  completedItems: number,
  totalItems: number,
  retriesUsed = 0,
): MockMissionProgressState {
  return {
    direction,
    mission_type: "mission",
    phase,
    completed_items: completedItems,
    total_items: totalItems,
    retries_used: retriesUsed,
  };
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

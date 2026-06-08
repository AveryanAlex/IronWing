import type { FencePlan } from "./fence";
import { EVENT_NAMES } from "./lib/generated/events";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { MissionPlan, WireMissionPlan } from "./lib/mavkit-types";
import type { RallyPlan } from "./rally";
import type { SessionEvent } from "./session";

export type {
  FencePlan,
  FenceRegion,
  FenceInclusionPolygon,
  FenceExclusionPolygon,
  FenceInclusionCircle,
  FenceExclusionCircle,
  GeoPoint2d,
  GeoPoint3d,
  GeoPoint3dMsl,
  GeoPoint3dRelHome,
  GeoPoint3dTerrain,
  HomePosition,
  MissionCommand,
  MissionItem,
  MissionPlan,
  RallyPlan,
  RawMissionCommand,
  MissionFrame,
  NavCommand,
  DoCommand,
  ConditionCommand,
} from "./lib/mavkit-types";

export type MissionType = "mission" | "fence" | "rally";

export type MissionIssue = {
  code: string;
  message: string;
  seq?: number;
  severity: "error" | "warning";
};

export type TransferDirection = "upload" | "download";
export type TransferPhase =
  | "idle"
  | "request_count"
  | "transfer_items"
  | "await_ack"
  | "completed"
  | "failed"
  | "cancelled";

export type TransferProgress = {
  direction: TransferDirection;
  mission_type: MissionType;
  phase: TransferPhase;
  completed_items: number;
  total_items: number;
  retries_used: number;
};

export type SyncState = "unknown" | "current" | "stale";

export type MissionOperationKind = "upload" | "download" | "clear";

export type MissionState = {
  plan: MissionPlan | null;
  current_index: number | null;
  sync: SyncState;
  active_op: MissionOperationKind | null;
};

export type MissionDownload = {
  plan: import("./lib/mavkit-types").MissionPlan;
  home: import("./lib/mavkit-types").HomePosition | null;
};

export type DomainPlanMap = {
  mission: import("./lib/mavkit-types").MissionPlan;
  fence: FencePlan;
  rally: RallyPlan;
};

export function toWireMissionPlan(plan: MissionPlan | WireMissionPlan): WireMissionPlan {
  return {
    items: plan.items.map((item) => {
      const { current: _current, ...wireItem } = item as MissionPlan["items"][number];
      return wireItem;
    }),
  };
}

export async function uploadMission(
  plan: import("./lib/mavkit-types").MissionPlan,
): Promise<void> {
  await typedInvoke("mission_upload", { plan: toWireMissionPlan(plan) });
}

export async function downloadMission(): Promise<MissionDownload> {
  return typedInvoke("mission_download");
}

export async function validateMission(
  plan: import("./lib/mavkit-types").MissionPlan,
): Promise<MissionIssue[]> {
  return typedInvoke("mission_validate", { plan: toWireMissionPlan(plan) });
}

export async function clearMission(): Promise<void> {
  await typedInvoke("mission_clear");
}

export async function setCurrentMissionItem(seq: number): Promise<void> {
  await typedInvoke("mission_set_current", { seq });
}

export async function cancelMissionTransfer(): Promise<void> {
  await typedInvoke("mission_cancel");
}

export async function subscribeMissionProgress(
  cb: (event: SessionEvent<TransferProgress>) => void,
): Promise<UnlistenFn> {
  return typedListen(
    EVENT_NAMES.MISSION_PROGRESS,
    (event) => cb(event.payload),
  );
}

export async function subscribeMissionState(
  cb: (event: SessionEvent<MissionState>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.MISSION_STATE, (event) =>
    cb(event.payload),
  );
}

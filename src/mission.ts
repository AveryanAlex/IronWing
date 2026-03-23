import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { FencePlan } from "./fence";
import type { MissionPlan } from "./lib/mavkit-types";
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

export async function uploadMission(
  plan: import("./lib/mavkit-types").MissionPlan,
): Promise<void> {
  await invoke("mission_upload", { plan });
}

export async function downloadMission(): Promise<MissionDownload> {
  return invoke<MissionDownload>("mission_download");
}

export async function validateMission(
  plan: import("./lib/mavkit-types").MissionPlan,
): Promise<MissionIssue[]> {
  return invoke<MissionIssue[]>("mission_validate", { plan });
}

export async function clearMission(): Promise<void> {
  await invoke("mission_clear");
}

export async function setCurrentMissionItem(seq: number): Promise<void> {
  await invoke("mission_set_current", { seq });
}

export async function cancelMissionTransfer(): Promise<void> {
  await invoke("mission_cancel");
}

export async function subscribeMissionProgress(
  cb: (event: SessionEvent<TransferProgress>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<TransferProgress>>(
    "mission://progress",
    (event) => cb(event.payload),
  );
}

export async function subscribeMissionState(
  cb: (event: SessionEvent<MissionState>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<MissionState>>("mission://state", (event) =>
    cb(event.payload),
  );
}

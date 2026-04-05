import {
  cancelMissionTransfer,
  clearMission,
  downloadMission,
  subscribeMissionProgress,
  subscribeMissionState,
  uploadMission,
  validateMission,
  type MissionIssue,
  type MissionState,
  type TransferProgress,
} from "../../mission";
import { clearFence, downloadFence, uploadFence, type FencePlan } from "../../fence";
import { clearRally, downloadRally, uploadRally, type RallyPlan } from "../../rally";
import type { HomePosition, MissionPlan } from "../mavkit-types";
import type { SessionEvent } from "../../session";
import { formatUnknownError } from "../error-format";

const MALFORMED_MISSION_DOWNLOAD_MESSAGE = "The mission download returned an unexpected payload.";
const MALFORMED_FENCE_DOWNLOAD_MESSAGE = "The fence download returned an unexpected payload.";
const MALFORMED_RALLY_DOWNLOAD_MESSAGE = "The rally download returned an unexpected payload.";
const MALFORMED_VALIDATE_RESPONSE_MESSAGE = "Mission validation returned an unexpected response.";

export type MissionPlannerWorkspaceTransfer = {
  mission: MissionPlan;
  fence: FencePlan;
  rally: RallyPlan;
  home: HomePosition | null;
};

export type MissionPlannerServiceEventHandlers = {
  onMissionState: (event: SessionEvent<MissionState>) => void;
  onMissionProgress: (event: SessionEvent<TransferProgress>) => void;
};

export type MissionPlannerService = {
  subscribeAll(handlers: MissionPlannerServiceEventHandlers): Promise<() => void>;
  downloadWorkspace(): Promise<MissionPlannerWorkspaceTransfer>;
  uploadWorkspace(workspace: MissionPlannerWorkspaceTransfer): Promise<void>;
  clearWorkspace(): Promise<void>;
  validateMission(plan: MissionPlan): Promise<MissionIssue[]>;
  cancelTransfer(): Promise<void>;
  formatError(error: unknown): string;
};

export function createMissionPlannerService(): MissionPlannerService {
  return {
    subscribeAll,
    downloadWorkspace,
    uploadWorkspace,
    clearWorkspace,
    validateMission: validateMissionPlan,
    cancelTransfer: cancelMissionTransfer,
    formatError: formatUnknownError,
  };
}

export async function subscribeAll(handlers: MissionPlannerServiceEventHandlers): Promise<() => void> {
  const disposers = await Promise.all([
    subscribeMissionState(handlers.onMissionState),
    subscribeMissionProgress(handlers.onMissionProgress),
  ]);

  return () => {
    for (const disposer of disposers) {
      disposer();
    }
  };
}

export async function downloadWorkspace(): Promise<MissionPlannerWorkspaceTransfer> {
  const [missionDownloadResult, fence, rally] = await Promise.all([
    downloadMission(),
    downloadFence(),
    downloadRally(),
  ]);

  const missionDownload = normalizeMissionDownload(missionDownloadResult);

  return {
    mission: missionDownload.plan,
    home: missionDownload.home,
    fence: normalizeFencePlan(fence),
    rally: normalizeRallyPlan(rally),
  };
}

export async function uploadWorkspace(workspace: MissionPlannerWorkspaceTransfer): Promise<void> {
  await uploadMission(normalizeMissionPlan(workspace.mission));
  await uploadFence(normalizeFencePlan(workspace.fence));
  await uploadRally(normalizeRallyPlan(workspace.rally));
}

export async function clearWorkspace(): Promise<void> {
  await clearMission();
  await clearFence();
  await clearRally();
}

export async function validateMissionPlan(plan: MissionPlan): Promise<MissionIssue[]> {
  const issues = await validateMission(normalizeMissionPlan(plan));

  if (!Array.isArray(issues)) {
    throw new Error(MALFORMED_VALIDATE_RESPONSE_MESSAGE);
  }

  const normalizedIssues: MissionIssue[] = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") {
      throw new Error(MALFORMED_VALIDATE_RESPONSE_MESSAGE);
    }

    const candidate = issue as Partial<MissionIssue>;
    if (
      typeof candidate.code !== "string"
      || typeof candidate.message !== "string"
      || (candidate.severity !== "error" && candidate.severity !== "warning")
      || (candidate.seq !== undefined && (!Number.isInteger(candidate.seq) || candidate.seq < 0))
    ) {
      throw new Error(MALFORMED_VALIDATE_RESPONSE_MESSAGE);
    }

    normalizedIssues.push({
      code: candidate.code,
      message: candidate.message,
      severity: candidate.severity,
      ...(candidate.seq !== undefined ? { seq: candidate.seq } : {}),
    });
  }

  return normalizedIssues;
}

function normalizeMissionDownload(value: unknown): { plan: MissionPlan; home: HomePosition | null } {
  if (!value || typeof value !== "object") {
    throw new Error(MALFORMED_MISSION_DOWNLOAD_MESSAGE);
  }

  const candidate = value as { plan?: unknown; home?: unknown };
  return {
    plan: normalizeMissionPlan(candidate.plan),
    home: normalizeHomePosition(candidate.home),
  };
}

function normalizeMissionPlan(value: unknown): MissionPlan {
  if (!value || typeof value !== "object") {
    throw new Error(MALFORMED_MISSION_DOWNLOAD_MESSAGE);
  }

  const candidate = value as { items?: unknown };
  if (!Array.isArray(candidate.items)) {
    throw new Error(MALFORMED_MISSION_DOWNLOAD_MESSAGE);
  }

  return value as MissionPlan;
}

function normalizeFencePlan(value: unknown): FencePlan {
  if (!value || typeof value !== "object") {
    throw new Error(MALFORMED_FENCE_DOWNLOAD_MESSAGE);
  }

  const candidate = value as { regions?: unknown };
  if (!Array.isArray(candidate.regions)) {
    throw new Error(MALFORMED_FENCE_DOWNLOAD_MESSAGE);
  }

  return value as FencePlan;
}

function normalizeRallyPlan(value: unknown): RallyPlan {
  if (!value || typeof value !== "object") {
    throw new Error(MALFORMED_RALLY_DOWNLOAD_MESSAGE);
  }

  const candidate = value as { points?: unknown };
  if (!Array.isArray(candidate.points)) {
    throw new Error(MALFORMED_RALLY_DOWNLOAD_MESSAGE);
  }

  return value as RallyPlan;
}

function normalizeHomePosition(value: unknown): HomePosition | null {
  if (value == null) {
    return null;
  }

  if (!value || typeof value !== "object") {
    throw new Error(MALFORMED_MISSION_DOWNLOAD_MESSAGE);
  }

  const candidate = value as Partial<HomePosition>;
  if (
    typeof candidate.latitude_deg !== "number"
    || !Number.isFinite(candidate.latitude_deg)
    || typeof candidate.longitude_deg !== "number"
    || !Number.isFinite(candidate.longitude_deg)
    || typeof candidate.altitude_m !== "number"
    || !Number.isFinite(candidate.altitude_m)
  ) {
    throw new Error(MALFORMED_MISSION_DOWNLOAD_MESSAGE);
  }

  return {
    latitude_deg: candidate.latitude_deg,
    longitude_deg: candidate.longitude_deg,
    altitude_m: candidate.altitude_m,
  };
}

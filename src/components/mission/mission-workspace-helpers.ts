import { localXYToLatLon } from "../../lib/mission-coordinates";
import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";
import type { GeoPoint2d } from "../../lib/mavkit-types";
import type { Warning } from "../../lib/warnings/warning-model";
import type {
  MissionPlannerInlineStatus,
  MissionPlannerView,
  MissionPlannerWarningView,
} from "../../lib/stores/mission-planner-view";
import type {
  MissionPlannerMode,
  MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type { SurveyPatternType, SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

export type MissionWorkspaceInlineCopy = {
  tone: "info" | "warning";
  title: string;
  detail: string;
};

const DEFAULT_SURVEY_ANCHOR: GeoPoint2d = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
};

export function replayOverlayDetail(replayMapOverlay: ReplayMapOverlayState | null): string {
  if (!replayMapOverlay) {
    return "";
  }

  switch (replayMapOverlay.phase) {
    case "loading":
      return "Loading the replay path into the mission map. The overlay stays read-only and separate from the mission draft.";
    case "failed":
      return replayMapOverlay.error ?? "Unable to load the replay path into the mission map overlay.";
    case "ready":
      return `Showing ${replayMapOverlay.path.length.toLocaleString()} replay point${replayMapOverlay.path.length === 1 ? "" : "s"} from ${replayMapOverlay.entryId}. This overlay is read-only and does not change mission draft, undo, or upload state.`;
  }
}

export function surveyRegionAnchor(region: SurveyRegion): GeoPoint2d | null {
  const geometry = region.patternType === "corridor" ? region.polyline : region.polygon;
  if (geometry.length === 0) {
    return null;
  }

  const totals = geometry.reduce(
    (sum, point) => ({
      latitude_deg: sum.latitude_deg + point.latitude_deg,
      longitude_deg: sum.longitude_deg + point.longitude_deg,
    }),
    { latitude_deg: 0, longitude_deg: 0 },
  );

  return {
    latitude_deg: totals.latitude_deg / geometry.length,
    longitude_deg: totals.longitude_deg / geometry.length,
  };
}

export function resolveSurveyCreationAnchor(state: MissionPlannerStoreState): GeoPoint2d {
  if (state.selection.kind === "survey-block") {
    const selectedRegion = state.survey.surveyRegions.get(state.selection.regionId) ?? null;
    const anchor = selectedRegion ? surveyRegionAnchor(selectedRegion) : null;
    if (anchor) {
      return anchor;
    }
  }

  if (state.selection.kind === "mission-item") {
    const selectedItem = state.draftState.active.mission.draftItems.find(
      (item) => item.uiId === state.draftState.active.mission.primarySelectedUiId,
    ) ?? null;
    if (
      selectedItem
      && selectedItem.preview.latitude_deg !== null
      && selectedItem.preview.longitude_deg !== null
    ) {
      return {
        latitude_deg: selectedItem.preview.latitude_deg,
        longitude_deg: selectedItem.preview.longitude_deg,
      };
    }
  }

  if (state.home) {
    return {
      latitude_deg: state.home.latitude_deg,
      longitude_deg: state.home.longitude_deg,
    };
  }

  const firstMissionPoint = state.draftState.active.mission.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstMissionPoint
    && firstMissionPoint.preview.latitude_deg !== null
    && firstMissionPoint.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstMissionPoint.preview.latitude_deg,
      longitude_deg: firstMissionPoint.preview.longitude_deg,
    };
  }

  const firstSurveyBlock = state.survey.surveyRegionOrder[0]?.regionId;
  const firstSurveyRegion = firstSurveyBlock ? state.survey.surveyRegions.get(firstSurveyBlock) ?? null : null;
  const surveyAnchor = firstSurveyRegion ? surveyRegionAnchor(firstSurveyRegion) : null;
  return surveyAnchor ?? DEFAULT_SURVEY_ANCHOR;
}

function projectSurveySeed(anchor: GeoPoint2d, x_m: number, y_m: number): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(anchor, x_m, y_m);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

export function buildSurveySeedGeometry(
  patternType: SurveyPatternType,
  state: MissionPlannerStoreState,
): GeoPoint2d[] {
  const anchor = resolveSurveyCreationAnchor(state);

  if (patternType === "corridor") {
    return [
      projectSurveySeed(anchor, -40, 0),
      projectSurveySeed(anchor, 0, 20),
      projectSurveySeed(anchor, 40, 0),
    ];
  }

  const halfSpan = patternType === "structure" ? 20 : 35;
  return [
    projectSurveySeed(anchor, -halfSpan, -halfSpan),
    projectSurveySeed(anchor, halfSpan, -halfSpan),
    projectSurveySeed(anchor, halfSpan, halfSpan),
    projectSurveySeed(anchor, -halfSpan, halfSpan),
  ];
}

export function replacePromptTitle(state: MissionPlannerStoreState): string {
  const prompt = state.replacePrompt;
  if (!prompt) {
    return "";
  }

  if (prompt.kind === "recoverable") {
    return "Restore the saved draft for this session family?";
  }

  return prompt.action === "download"
    ? "Replace the current draft with the vehicle workspace?"
    : "Clear the vehicle workspace and drop the current local draft?";
}

export function replacePromptBody(state: MissionPlannerStoreState): string {
  const prompt = state.replacePrompt;
  if (!prompt) {
    return "";
  }

  if (prompt.kind === "recoverable") {
    return "A recoverable draft was preserved for this session family. Restore it explicitly instead of silently replacing the active workspace.";
  }

  if (prompt.action === "download") {
    return "Reading from the vehicle would overwrite unsaved local planning work. Keep the current draft or explicitly replace it.";
  }

  return "Clearing the vehicle would also replace the current draft with an empty workspace. Keep the current draft or explicitly replace it.";
}

export function replacePromptConfirmLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Restore draft" : "Replace draft";
}

export function replacePromptDismissLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Stay with current draft" : "Keep current draft";
}

export function resolveInlineStatusCopy(
  currentView: MissionPlannerView,
  state: MissionPlannerStoreState,
): MissionWorkspaceInlineCopy | null {
  if (currentView.lastError) {
    return null;
  }

  if (state.streamError) {
    return {
      tone: "warning",
      title: "Mission stream degraded",
      detail: `${state.streamError} Existing local planning data stays mounted instead of falling back to an empty placeholder shell.`,
    };
  }

  if (currentView.inlineStatus.busy) {
    return busyStatusCopy(currentView.inlineStatus, currentView.activeTransfer);
  }

  return null;
}

function busyStatusCopy(
  inlineStatus: MissionPlannerInlineStatus,
  activeTransfer: MissionPlannerView["activeTransfer"],
): MissionWorkspaceInlineCopy | null {
  if (inlineStatus.timedOut) {
    return {
      tone: "warning",
      title: "Planner action still pending",
      detail: "The last planner action timed out, but the underlying transfer may still be active. Cancel it or wait for the vehicle to respond before retrying.",
    };
  }

  const transferDetail = activeTransfer
    ? `${activeTransfer.direction} ${activeTransfer.missionType} · ${activeTransfer.phase} · ${activeTransfer.completedItems}/${activeTransfer.totalItems} items · retries ${activeTransfer.retriesUsed}`
    : null;

  switch (inlineStatus.phase) {
    case "downloading":
      return {
        tone: "info",
        title: "Reading planning state from the vehicle",
        detail: transferDetail ?? "The current workspace stays mounted while the download completes.",
      };
    case "uploading":
      return {
        tone: "info",
        title: "Uploading planning state to the vehicle",
        detail: transferDetail ?? "The planner keeps the draft visible while the upload completes.",
      };
    case "validating":
      return {
        tone: "info",
        title: "Validating the mission bucket against the active vehicle",
        detail: "Validation stays mission-scoped, even while fence, rally, and Home continuity share the same planner shell.",
      };
    case "clearing":
      return {
        tone: "info",
        title: "Clearing the vehicle workspace",
        detail: transferDetail ?? "The draft remains mounted until the clear request resolves.",
      };
    case "importing":
      return {
        tone: "info",
        title: "Importing file content",
        detail: "The current draft stays intact until the parsed domains are reviewed and applied.",
      };
    case "exporting":
      return {
        tone: "info",
        title: "Exporting the active planner workspace",
        detail: "The current workspace stays mounted while IronWing prepares a truthful mixed-domain .plan export.",
      };
    default:
      return null;
  }
}

export function statusClass(tone: "info" | "warning"): string {
  return tone === "warning"
    ? "border-warning/40 bg-warning/10 text-warning"
    : "border-accent/30 bg-accent/10 text-text-primary";
}

function warningTestId(warning: MissionPlannerWarningView, index: number): string {
  if (warning.id.startsWith("file-warning:")) {
    return missionWorkspaceTestIds.warningFile;
  }

  if (warning.id.startsWith("validation-issue:")) {
    return missionWorkspaceTestIds.warningValidation;
  }

  return `${missionWorkspaceTestIds.warningItemPrefix}-${index}`;
}

export function toSharedWarning(
  warning: MissionPlannerWarningView,
  index: number,
  handlers: {
    onAction: (action: NonNullable<MissionPlannerWarningView["action"]>) => void;
    onDismiss: (id: string) => void;
  },
): Warning {
  const action = warning.action;
  return {
    id: warning.id,
    severity: warning.tone,
    title: warning.title,
    message: warning.detail,
    source: warning.domain,
    details: warning.lines,
    actionLabel: action?.label,
    onAction: action ? () => handlers.onAction(action) : undefined,
    dismissible: true,
    onDismiss: () => handlers.onDismiss(warning.id),
    testId: warningTestId(warning, index),
    actionTestId: action ? `${missionWorkspaceTestIds.warningActionPrefix}-${index}` : undefined,
    dismissTestId: `${missionWorkspaceTestIds.warningDismissPrefix}-${index}`,
  };
}

export function importReviewChoiceTestId(domain: MissionPlannerMode): string {
  return `${missionWorkspaceTestIds.importReviewChoicePrefix}-${domain}`;
}

export function exportReviewChoiceTestId(domain: MissionPlannerMode): string {
  return `${missionWorkspaceTestIds.exportReviewChoicePrefix}-${domain}`;
}

export function modeShellTitle(mode: MissionPlannerMode): string {
  return mode === "fence" ? "Fence map editor" : "Rally continuity shell";
}

export function modeShellBody(mode: MissionPlannerMode, currentView: MissionPlannerView): string {
  return mode === "fence"
    ? `Fence mode now exposes ${currentView.fenceRegionCount} region${currentView.fenceRegionCount === 1 ? "" : "s"} plus return-point truth inside the mounted planner workspace.`
    : `Rally data is already part of the mounted workspace (${currentView.rallyPointCount} point${currentView.rallyPointCount === 1 ? "" : "s"}), and sticky warnings / import review stay visible here. Dedicated rally editing lands in the next task.`;
}

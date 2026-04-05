import { derived, type Readable } from "svelte/store";

import type { SurveyRegionGenerationState, SurveyPatternType } from "../survey-region";
import type {
  MissionPlannerActionState,
  MissionPlannerDomainPhase,
  MissionPlannerReplacePrompt,
  MissionPlannerStoreState,
  MissionPlannerSurveyPrompt,
} from "./mission-planner";
import {
  activeTransferMissionPlan,
  plannerHasContent,
  plannerIsDirty,
  plannerScopeLabel,
} from "./mission-planner";

export type MissionPlannerWorkspaceStatus = "bootstrapping" | "unavailable" | "empty" | "ready";

export type MissionPlannerInlineStatus = {
  phase: MissionPlannerDomainPhase;
  busy: boolean;
  canCancel: boolean;
  timedOut: boolean;
};

export type MissionPlannerReplacePromptView = {
  kind: MissionPlannerReplacePrompt["kind"];
  action: "download" | "import" | "clear" | "recoverable";
  warningCount: number;
};

export type MissionPlannerSurveyPromptView = {
  kind: MissionPlannerSurveyPrompt["kind"];
  regionId: string;
  message: string;
};

export type MissionPlannerSelectedSurveyView = {
  regionId: string;
  patternType: SurveyPatternType;
  position: number | null;
  collapsed: boolean;
  generationState: SurveyRegionGenerationState;
  generationMessage: string | null;
  generatedItemCount: number;
  manualEditCount: number;
  errorCount: number;
};

export type MissionPlannerTransferView = {
  direction: string;
  missionType: string;
  phase: string;
  completedItems: number;
  totalItems: number;
  retriesUsed: number;
};

export type MissionPlannerView = {
  status: MissionPlannerWorkspaceStatus;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  workspaceMounted: boolean;
  activeEnvelope: MissionPlannerStoreState["activeEnvelope"];
  activeEnvelopeText: string;
  phase: MissionPlannerDomainPhase;
  dirty: boolean;
  missionItemCount: number;
  effectiveMissionItemCount: number;
  surveyRegionCount: number;
  fenceRegionCount: number;
  rallyPointCount: number;
  fileWarningCount: number;
  validationIssueCount: number;
  replacePrompt: MissionPlannerReplacePromptView | null;
  surveyPrompt: MissionPlannerSurveyPromptView | null;
  surveyOrder: Array<{ regionId: string; position: number }>;
  selectedSurvey: MissionPlannerSelectedSurveyView | null;
  inlineStatus: MissionPlannerInlineStatus;
  activeTransfer: MissionPlannerTransferView | null;
  lastError: string | null;
};

export function createMissionPlannerViewStore(store: Readable<MissionPlannerStoreState>) {
  return derived(store, ($planner): MissionPlannerView => {
    const status = resolveWorkspaceStatus($planner);
    const readiness = resolveWorkspaceReadiness($planner, status);
    const effectiveMission = activeTransferMissionPlan($planner);
    const surveyOrder = $planner.survey.surveyRegionOrder
      .map((block, index) => ({ block, index }))
      .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
      .map(({ block }) => ({ regionId: block.regionId, position: block.position }));
    const selectedSurveyRegion = $planner.selection.kind === "survey-block"
      ? $planner.survey.surveyRegions.get($planner.selection.regionId) ?? null
      : null;
    const selectedSurveyPosition = selectedSurveyRegion
      ? surveyOrder.find((block) => block.regionId === selectedSurveyRegion.id)?.position ?? null
      : null;

    return {
      status,
      readiness,
      workspaceMounted: $planner.workspaceMounted,
      activeEnvelope: $planner.activeEnvelope,
      activeEnvelopeText: plannerScopeLabel($planner),
      phase: $planner.phase,
      dirty: plannerIsDirty($planner),
      missionItemCount: $planner.draftState.active.mission.document.items.length,
      effectiveMissionItemCount: effectiveMission.items.length,
      surveyRegionCount: $planner.survey.surveyRegionOrder.length,
      fenceRegionCount: $planner.draftState.active.fence.document.regions.length,
      rallyPointCount: $planner.draftState.active.rally.document.points.length,
      fileWarningCount: $planner.fileWarnings.length,
      validationIssueCount: $planner.validationIssues.length,
      replacePrompt: formatReplacePrompt($planner.replacePrompt),
      surveyPrompt: formatSurveyPrompt($planner.surveyPrompt),
      surveyOrder,
      selectedSurvey: selectedSurveyRegion
        ? {
          regionId: selectedSurveyRegion.id,
          patternType: selectedSurveyRegion.patternType,
          position: selectedSurveyPosition,
          collapsed: selectedSurveyRegion.collapsed,
          generationState: selectedSurveyRegion.generationState,
          generationMessage: selectedSurveyRegion.generationMessage,
          generatedItemCount: selectedSurveyRegion.generatedItems.length,
          manualEditCount: selectedSurveyRegion.manualEdits.size,
          errorCount: selectedSurveyRegion.errors.length,
        }
        : null,
      inlineStatus: formatInlineStatus($planner.phase, $planner.activeAction),
      activeTransfer: $planner.transferProgress
        ? {
          direction: $planner.transferProgress.direction,
          missionType: $planner.transferProgress.mission_type,
          phase: $planner.transferProgress.phase,
          completedItems: $planner.transferProgress.completed_items,
          totalItems: $planner.transferProgress.total_items,
          retriesUsed: $planner.transferProgress.retries_used,
        }
        : null,
      lastError: $planner.lastError,
    };
  });
}

export type MissionPlannerViewStore = ReturnType<typeof createMissionPlannerViewStore>;

function resolveWorkspaceStatus(state: MissionPlannerStoreState): MissionPlannerWorkspaceStatus {
  if (!state.sessionHydrated || state.sessionPhase === "subscribing" || state.sessionPhase === "bootstrapping") {
    return "bootstrapping";
  }

  if (!state.activeEnvelope) {
    return "unavailable";
  }

  return plannerHasContent(state) ? "ready" : "empty";
}

function resolveWorkspaceReadiness(
  state: MissionPlannerStoreState,
  status: MissionPlannerWorkspaceStatus,
): MissionPlannerView["readiness"] {
  if (state.streamError) {
    return status === "ready" || status === "empty" ? "degraded" : "unavailable";
  }

  switch (status) {
    case "ready":
    case "empty":
      return "ready";
    case "bootstrapping":
      return "bootstrapping";
    case "unavailable":
    default:
      return "unavailable";
  }
}

function formatReplacePrompt(prompt: MissionPlannerReplacePrompt | null): MissionPlannerReplacePromptView | null {
  if (!prompt) {
    return null;
  }

  if (prompt.kind === "recoverable") {
    return {
      kind: "recoverable",
      action: "recoverable",
      warningCount: 0,
    };
  }

  return {
    kind: "replace-active",
    action: prompt.action,
    warningCount: prompt.fileWarnings.length,
  };
}

function formatSurveyPrompt(prompt: MissionPlannerSurveyPrompt | null): MissionPlannerSurveyPromptView | null {
  if (!prompt) {
    return null;
  }

  return {
    kind: prompt.kind,
    regionId: prompt.regionId,
    message: prompt.message,
  };
}

function formatInlineStatus(
  phase: MissionPlannerDomainPhase,
  activeAction: MissionPlannerActionState | null,
): MissionPlannerInlineStatus {
  return {
    phase,
    busy: activeAction !== null,
    canCancel: activeAction?.canCancel ?? false,
    timedOut: activeAction?.status === "timed_out",
  };
}

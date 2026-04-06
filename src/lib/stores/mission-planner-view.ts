import { derived, type Readable } from "svelte/store";

import type { SurveyRegionGenerationState, SurveyPatternType } from "../survey-region";
import type {
  MissionPlannerActionState,
  MissionPlannerAttachmentState,
  MissionPlannerDomainPhase,
  MissionPlannerExportReview,
  MissionPlannerImportReview,
  MissionPlannerMode,
  MissionPlannerReplacePrompt,
  MissionPlannerStoreState,
  MissionPlannerSurveyPrompt,
  MissionPlannerWarningActionTarget,
} from "./mission-planner";
import {
  activeTransferMissionPlan,
  plannerHasContent,
  plannerIsDirty,
  plannerScopeLabel,
  resolveMissionPlannerAttachment,
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
  action: "download" | "clear" | "recoverable";
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

export type MissionPlannerWarningView = {
  id: string;
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
  domain: MissionPlannerMode | "workspace";
  lines: string[];
  action: { label: string; mode: MissionPlannerMode; target: MissionPlannerWarningActionTarget | null } | null;
};

export type MissionPlannerView = {
  status: MissionPlannerWorkspaceStatus;
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  workspaceMounted: boolean;
  mode: MissionPlannerMode;
  attachment: MissionPlannerAttachmentState;
  canUseVehicleActions: boolean;
  canEdit: boolean;
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
  warningCount: number;
  warnings: MissionPlannerWarningView[];
  replacePrompt: MissionPlannerReplacePromptView | null;
  importReview: MissionPlannerImportReview | null;
  exportReview: MissionPlannerExportReview | null;
  surveyPrompt: MissionPlannerSurveyPromptView | null;
  surveyOrder: Array<{ regionId: string; position: number }>;
  selectedSurvey: MissionPlannerSelectedSurveyView | null;
  inlineStatus: MissionPlannerInlineStatus;
  activeTransfer: MissionPlannerTransferView | null;
  lastError: string | null;
};

export function createMissionPlannerViewStore(store: Readable<MissionPlannerStoreState>) {
  return derived(store, ($planner): MissionPlannerView => {
    const attachment = resolveMissionPlannerAttachment($planner);
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
    const warnings = buildWarningEntries($planner, attachment);

    return {
      status,
      readiness,
      workspaceMounted: $planner.workspaceMounted,
      mode: $planner.mode,
      attachment,
      canUseVehicleActions: attachment.canUseVehicleActions,
      canEdit: attachment.canEdit,
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
      warningCount: warnings.length,
      warnings,
      replacePrompt: formatReplacePrompt($planner.replacePrompt),
      importReview: $planner.pendingImportReview,
      exportReview: $planner.pendingExportReview,
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

  if (!state.workspaceMounted && !state.activeEnvelope) {
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

function buildWarningEntries(
  state: MissionPlannerStoreState,
  attachment: MissionPlannerAttachmentState,
): MissionPlannerWarningView[] {
  const warnings: MissionPlannerWarningView[] = [];

  const pushIfVisible = (warning: MissionPlannerWarningView) => {
    if (!state.dismissedWarningIds.includes(warning.id)) {
      warnings.push(warning);
    }
  };

  if (attachment.kind === "playback-readonly" || attachment.kind === "detached-local") {
    pushIfVisible({
      id: `attachment:${attachment.kind}`,
      tone: "warning",
      title: attachment.label,
      detail: attachment.detail,
      domain: "workspace",
      lines: [],
      action: { label: "Open mission mode", mode: "mission", target: null },
    });
  }

  if (state.streamError) {
    pushIfVisible({
      id: `stream-error:${state.streamError}`,
      tone: "warning",
      title: "Planner stream degraded",
      detail: state.streamError,
      domain: "workspace",
      lines: [],
      action: null,
    });
  }

  if (state.blockedReason) {
    const blockedMode = state.blockedMode ?? state.mode;
    warnings.push({
      id: `blocked:${state.blockedReason}`,
      tone: "warning",
      title: "Blocked action",
      detail: state.blockedReason,
      domain: blockedMode,
      lines: [],
      action: {
        label: `Open ${blockedMode} mode`,
        mode: blockedMode,
        target: state.blockedWarningTarget ?? warningTargetFromMode(blockedMode, state),
      },
    });
  }

  if (state.lastError) {
    warnings.push({
      id: `last-error:${state.lastError}`,
      tone: "danger",
      title: "Planner action failed",
      detail: state.lastError,
      domain: "workspace",
      lines: [],
      action: null,
    });
  }

  state.fileWarnings.forEach((warning, index) => {
    const domain = inferWarningDomain(warning);
    pushIfVisible({
      id: `file-warning:${index}:${warning}`,
      tone: "warning",
      title: "Import / export warning",
      detail: warning,
      domain,
      lines: [],
      action: { label: `Open ${domain} mode`, mode: domain, target: null },
    });
  });

  state.validationIssues.forEach((issue, index) => {
    pushIfVisible({
      id: `validation-issue:${index}:${issue.code}:${issue.message}`,
      tone: issue.severity === "error" ? "danger" : "warning",
      title: `${issue.severity === "error" ? "Validation error" : "Validation warning"} · ${issue.code}`,
      detail: typeof issue.seq === "number" ? `Sequence ${issue.seq}: ${issue.message}` : issue.message,
      domain: "mission",
      lines: [],
      action: { label: "Open mission mode", mode: "mission", target: null },
    });
  });

  return warnings;
}

function warningTargetFromFenceSelection(
  selection: MissionPlannerStoreState["fenceSelection"],
): MissionPlannerWarningActionTarget | null {
  if (selection.kind === "region") {
    return { kind: "fence-region", regionUiId: selection.regionUiId };
  }

  if (selection.kind === "return-point") {
    return { kind: "fence-return-point" };
  }

  return null;
}

function warningTargetFromRallySelection(
  selection: MissionPlannerStoreState["rallySelection"],
): MissionPlannerWarningActionTarget | null {
  if (selection.kind === "point") {
    return { kind: "rally-point", pointUiId: selection.pointUiId };
  }

  return null;
}

function warningTargetFromMode(
  mode: MissionPlannerMode,
  state: Pick<MissionPlannerStoreState, "fenceSelection" | "rallySelection">,
): MissionPlannerWarningActionTarget | null {
  if (mode === "fence") {
    return warningTargetFromFenceSelection(state.fenceSelection);
  }

  if (mode === "rally") {
    return warningTargetFromRallySelection(state.rallySelection);
  }

  return null;
}

function inferWarningDomain(warning: string): MissionPlannerMode {
  if (/rally/i.test(warning)) {
    return "rally";
  }

  if (/fence|polygon|kmz|kml/i.test(warning)) {
    return "fence";
  }

  return "mission";
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

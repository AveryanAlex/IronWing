import { derived, type Readable } from "svelte/store";

import { paramProgressCounts, paramProgressPhase, type ParamProgress } from "../../params";
import {
  buildParameterWorkspaceSections,
  formatParamValue,
  type ParameterWorkspaceItem,
  type ParameterWorkspaceSection,
} from "../params/workspace-sections";
import type { StagedParameterEdit } from "./params-staged-edits";
import type {
  ParameterWorkspaceStatus,
  ParamsApplyPhase,
  ParamsMetadataState,
  ParamsStoreState,
  RetainedParameterFailure,
} from "./params";

export type ParameterWorkspaceItemView = ParameterWorkspaceItem & {
  isStaged: boolean;
  stagedValue: number | null;
  stagedValueText: string | null;
  diffText: string | null;
};

export type ParameterWorkspaceSectionView = Omit<ParameterWorkspaceSection, "items"> & {
  items: ParameterWorkspaceItemView[];
};

export type ParameterWorkspaceStagedEditView = StagedParameterEdit & {
  failureMessage: string | null;
  confirmedValueText: string | null;
  isApplying: boolean;
  isWriting: boolean;
  canRetry: boolean;
};

export type ParameterWorkspaceView = {
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  status: ParameterWorkspaceStatus;
  activeEnvelope: ParamsStoreState["activeEnvelope"];
  activeEnvelopeText: string;
  progressText: string;
  metadataText: string;
  noticeText: string | null;
  stagedCount: number;
  stagedEdits: ParameterWorkspaceStagedEditView[];
  sections: ParameterWorkspaceSectionView[];
  applyPhase: ParamsApplyPhase;
  applySummaryText: string | null;
  applyProgressText: string | null;
  applyButtonText: string;
  hasRetainedFailures: boolean;
};

export function createParameterWorkspaceViewStore(store: Readable<ParamsStoreState>) {
  return derived(store, ($params): ParameterWorkspaceView => {
    const status = resolveWorkspaceStatus($params);
    const readiness = resolveWorkspaceReadiness($params, status);
    const baseSections = buildParameterWorkspaceSections($params.paramStore, $params.metadata);
    const sections = baseSections.map((section) => ({
      ...section,
      items: section.items.map((item) => applyStagedItemState(item, $params.stagedEdits[item.name])),
    }));
    const itemIndex = new Map<string, ParameterWorkspaceItemView>();
    for (const section of sections) {
      for (const item of section.items) {
        itemIndex.set(item.name, item);
      }
    }

    const stagedEdits = Object.values($params.stagedEdits)
      .map((edit) => mergeStagedEdit(edit, itemIndex.get(edit.name), $params))
      .filter((edit) => edit.nextValue !== edit.currentValue)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

    return {
      readiness,
      status,
      activeEnvelope: $params.activeEnvelope,
      activeEnvelopeText: $params.activeEnvelope
        ? `${$params.activeEnvelope.session_id} · ${$params.activeEnvelope.source_kind} · rev ${$params.activeEnvelope.reset_revision}`
        : "No active session",
      progressText: formatProgressText($params.paramProgress),
      metadataText: formatMetadataText($params.metadataState, $params.metadataError),
      noticeText: formatNoticeText($params.scopeClearWarning, $params.lastNotice, $params.streamError),
      stagedCount: stagedEdits.length,
      stagedEdits,
      sections,
      applyPhase: $params.applyPhase,
      applySummaryText: formatApplySummaryText($params, stagedEdits.length),
      applyProgressText: formatApplyProgressText($params),
      applyButtonText: formatApplyButtonText($params, stagedEdits.length),
      hasRetainedFailures: Object.keys($params.retainedFailures).length > 0,
    };
  });
}

export type ParameterWorkspaceViewStore = ReturnType<typeof createParameterWorkspaceViewStore>;

function resolveWorkspaceStatus(state: ParamsStoreState): ParameterWorkspaceStatus {
  if (!state.sessionHydrated || state.sessionPhase === "subscribing" || state.sessionPhase === "bootstrapping") {
    return "bootstrapping";
  }

  if (!state.activeEnvelope) {
    return "unavailable";
  }

  if (!state.paramStore) {
    return state.paramProgress ? "bootstrapping" : "unavailable";
  }

  if (Object.keys(state.paramStore.params ?? {}).length === 0) {
    return "empty";
  }

  return "ready";
}

function resolveWorkspaceReadiness(
  state: ParamsStoreState,
  status: ParameterWorkspaceStatus,
): ParameterWorkspaceView["readiness"] {
  if (state.streamError) {
    return state.paramStore ? "degraded" : "unavailable";
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

function formatProgressText(progress: ParamProgress | null): string {
  if (!progress) {
    return "Waiting for parameter updates";
  }

  const phase = paramProgressPhase(progress);
  const counts = paramProgressCounts(progress);
  if (!counts) {
    return phase;
  }

  return `${phase} · ${counts.received}/${counts.expected ?? "?"}`;
}

function formatMetadataText(state: ParamsMetadataState, error: string | null): string {
  switch (state) {
    case "ready":
      return "Info ready";
    case "loading":
      return "Loading parameter info";
    case "unavailable":
      return error ? `Parameter info unavailable · ${error}` : "Parameter info unavailable";
    case "idle":
    default:
      return "Parameter info idle";
  }
}

function formatNoticeText(
  scopeClearWarning: string | null,
  lastNotice: string | null,
  streamError: string | null,
): string | null {
  if (scopeClearWarning) {
    return scopeClearWarning;
  }

  if (lastNotice) {
    return lastNotice;
  }

  if (streamError) {
    return "Live parameter updates are unavailable right now.";
  }

  return null;
}

function applyStagedItemState(
  item: ParameterWorkspaceItem,
  stagedEdit: StagedParameterEdit | undefined,
): ParameterWorkspaceItemView {
  if (!stagedEdit || stagedEdit.nextValue === item.value) {
    return {
      ...item,
      isStaged: false,
      stagedValue: null,
      stagedValueText: null,
      diffText: null,
    };
  }

  const stagedValueText = formatParamValue(stagedEdit.nextValue);
  return {
    ...item,
    isStaged: true,
    stagedValue: stagedEdit.nextValue,
    stagedValueText,
    diffText: `${item.valueText} → ${stagedValueText}`,
  };
}

function mergeStagedEdit(
  edit: StagedParameterEdit,
  currentItem: ParameterWorkspaceItemView | undefined,
  state: ParamsStoreState,
): ParameterWorkspaceStagedEditView {
  const retainedFailure = state.retainedFailures[edit.name];
  const activeName = state.applyProgress?.activeName ?? null;
  const isApplying = state.applyPhase === "applying";
  const isWriting = isApplying && activeName === edit.name;

  if (!currentItem) {
    return {
      ...edit,
      nextValueText: formatParamValue(edit.nextValue),
      currentValueText: formatParamValue(edit.currentValue),
      failureMessage: retainedFailure?.message ?? null,
      confirmedValueText: retainedFailure ? formatConfirmedValueText(retainedFailure.confirmedValue) : null,
      isApplying,
      isWriting,
      canRetry: Boolean(retainedFailure) && !isApplying,
    };
  }

  return {
    ...edit,
    label: currentItem.label,
    rawName: currentItem.rawName,
    description: currentItem.description,
    currentValue: currentItem.value,
    currentValueText: currentItem.valueText,
    nextValue: currentItem.stagedValue ?? edit.nextValue,
    nextValueText: currentItem.stagedValueText ?? formatParamValue(edit.nextValue),
    units: currentItem.units,
    rebootRequired: currentItem.rebootRequired,
    order: currentItem.order,
    failureMessage: retainedFailure?.message ?? null,
    confirmedValueText: retainedFailure ? formatConfirmedValueText(retainedFailure.confirmedValue) : null,
    isApplying,
    isWriting,
    canRetry: Boolean(retainedFailure) && !isApplying,
  };
}

function formatApplySummaryText(state: ParamsStoreState, stagedCount: number): string | null {
  if (state.applyPhase === "applying") {
    const total = state.applyProgress?.total ?? stagedCount;
    return `Applying ${total} change${total === 1 ? "" : "s"}.`;
  }

  const retainedFailures = Object.keys(state.retainedFailures).length;
  if (retainedFailures === 0) {
    return stagedCount > 0 ? "Ready to apply the queued parameter changes." : null;
  }

  if (state.applyPhase === "partial-failure") {
    return `${retainedFailures} change${retainedFailures === 1 ? "" : "s"} still need attention.`;
  }

  return `${retainedFailures} change${retainedFailures === 1 ? "" : "s"} failed to apply.`;
}

function formatApplyProgressText(state: ParamsStoreState): string | null {
  if (!state.applyProgress) {
    return null;
  }

  const total = state.applyProgress.total;
  const completed = state.applyProgress.completed;
  const activeName = state.applyProgress.activeName;
  if (state.applyPhase === "applying" && activeName) {
    return `Writing ${activeName} · ${completed}/${total}`;
  }

  if (state.applyPhase === "applying") {
    return `Applying ${completed}/${total}`;
  }

  if (state.applyPhase === "partial-failure") {
    return `${completed}/${total} changes confirmed.`;
  }

  if (state.applyPhase === "failed") {
    return `${completed}/${total} changes confirmed.`;
  }

  return null;
}

function formatApplyButtonText(state: ParamsStoreState, stagedCount: number): string {
  if (state.applyPhase === "applying") {
    return "Applying…";
  }

  const retainedFailures = Object.keys(state.retainedFailures).length;
  if (retainedFailures > 0 && retainedFailures === stagedCount) {
    return stagedCount === 1 ? "Retry change" : "Retry changes";
  }

  return stagedCount === 1 ? "Apply change" : "Apply changes";
}

function formatConfirmedValueText(confirmedValue: RetainedParameterFailure["confirmedValue"]): string | null {
  if (typeof confirmedValue !== "number") {
    return null;
  }

  return formatParamValue(confirmedValue);
}

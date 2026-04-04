import { derived, get, writable, type Readable } from "svelte/store";

import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import { paramProgressCounts, paramProgressPhase, type ParamProgress, type ParamStore } from "../../params";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent, type SourceKind } from "../../session";
import {
  buildParameterWorkspaceSections,
  formatParamValue,
  type ParameterWorkspaceItem,
  type ParameterWorkspaceSection,
} from "../../components/params/parameter-workspace-sections";
import {
  createParamsService,
  type ParamsService,
} from "../platform/params";
import { isSameEnvelope } from "../scoped-session-events";
import type { SessionStore, SessionStorePhase, SessionStoreState } from "./session";
import { session } from "./session";

export type ParamsMetadataState = "idle" | "loading" | "ready" | "unavailable";
export type ParamsDomainPhase = "idle" | "subscribing" | "bootstrapping" | "ready" | "unavailable" | "stream-error";
export type ParameterWorkspaceStatus = "bootstrapping" | "unavailable" | "empty" | "ready";

export type StagedParameterEdit = {
  name: string;
  label: string;
  rawName: string;
  description: string | null;
  currentValue: number;
  currentValueText: string;
  nextValue: number;
  nextValueText: string;
  units: string | null;
  rebootRequired: boolean;
  order: number;
};

export type ParameterWorkspaceItemView = ParameterWorkspaceItem & {
  isStaged: boolean;
  stagedValue: number | null;
  stagedValueText: string | null;
  diffText: string | null;
};

export type ParameterWorkspaceSectionView = Omit<ParameterWorkspaceSection, "items"> & {
  items: ParameterWorkspaceItemView[];
};

export type ParamsStoreState = {
  hydrated: boolean;
  phase: ParamsDomainPhase;
  streamReady: boolean;
  streamError: string | null;
  sessionHydrated: boolean;
  sessionPhase: SessionStorePhase;
  activeEnvelope: SessionEnvelope | null;
  activeSource: SourceKind | null;
  vehicleType: string | null;
  paramStore: ParamStore | null;
  paramProgress: ParamProgress | null;
  metadata: ParamMetadataMap | null;
  metadataState: ParamsMetadataState;
  metadataError: string | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  lastNotice: string | null;
};

export type ParameterWorkspaceView = {
  readiness: "ready" | "bootstrapping" | "unavailable" | "degraded";
  status: ParameterWorkspaceStatus;
  activeEnvelope: SessionEnvelope | null;
  activeEnvelopeText: string;
  progressText: string;
  metadataText: string;
  noticeText: string | null;
  stagedCount: number;
  stagedEdits: StagedParameterEdit[];
  sections: ParameterWorkspaceSectionView[];
};

type SessionReadable = Pick<SessionStore, "subscribe">;

type ParamStoreShape = {
  params: Record<string, unknown>;
  expected_count: number;
};

function createInitialState(): ParamsStoreState {
  return {
    hydrated: false,
    phase: "idle",
    streamReady: false,
    streamError: null,
    sessionHydrated: false,
    sessionPhase: "idle",
    activeEnvelope: null,
    activeSource: null,
    vehicleType: null,
    paramStore: null,
    paramProgress: null,
    metadata: null,
    metadataState: "idle",
    metadataError: null,
    stagedEdits: {},
    lastNotice: null,
  };
}

export function createParamsStore(
  sessionStore: SessionReadable = session,
  service: ParamsService = createParamsService(),
) {
  const store = writable<ParamsStoreState>(createInitialState());
  let initializePromise: Promise<void> | null = null;
  let stopSession: (() => void) | null = null;
  let stopStreams: (() => void) | null = null;
  let lastSessionEnvelope: SessionEnvelope | null = null;
  let lastBootstrapStoreRef: ParamStore | null = null;
  let lastBootstrapProgressRef: ParamProgress | null = null;
  let metadataRequestId = 0;

  function applyBootstrapState(sessionState: SessionStoreState, envelopeChanged: boolean) {
    const nextEnvelope = sessionState.activeEnvelope;
    const vehicleType = sessionState.sessionDomain.value?.vehicle_state?.vehicle_type ?? null;
    const nextStore = normalizeParamStore(sessionState.bootstrap.paramStore);
    const nextProgress = normalizeParamProgress(sessionState.bootstrap.paramProgress);

    store.update((state) => {
      const nextPhase = resolveDomainPhase(sessionState, nextEnvelope, nextStore, state.streamReady);

      if (!nextEnvelope) {
        return {
          ...state,
          phase: nextPhase,
          sessionHydrated: sessionState.hydrated,
          sessionPhase: sessionState.lastPhase,
          activeEnvelope: null,
          activeSource: null,
          vehicleType,
          paramStore: null,
          paramProgress: null,
          metadata: null,
          metadataState: vehicleType ? state.metadataState : "idle",
          metadataError: null,
          lastNotice: envelopeChanged ? "No active parameter scope is currently available." : state.lastNotice,
        };
      }

      const shouldReplaceStore = envelopeChanged || nextStore !== null || state.paramStore === null;
      const shouldReplaceProgress = envelopeChanged || nextProgress !== null || state.paramProgress === null;
      const resolvedStore = shouldReplaceStore ? nextStore : state.paramStore;

      return {
        ...state,
        phase: nextPhase,
        sessionHydrated: sessionState.hydrated,
        sessionPhase: sessionState.lastPhase,
        activeEnvelope: nextEnvelope,
        activeSource: nextEnvelope.source_kind,
        vehicleType,
        paramStore: resolvedStore,
        paramProgress: shouldReplaceProgress ? nextProgress : state.paramProgress,
        metadata: envelopeChanged ? null : state.metadata,
        metadataState: envelopeChanged ? (vehicleType ? "loading" : "idle") : state.metadataState,
        metadataError: envelopeChanged ? null : state.metadataError,
        stagedEdits: pruneResolvedStagedEdits(state.stagedEdits, resolvedStore),
        lastNotice:
          envelopeChanged && nextStore === null
            ? "This scope has no parameter bootstrap yet. Waiting for scoped data."
            : envelopeChanged
              ? null
              : state.lastNotice,
      };
    });

    void ensureMetadata(vehicleType, envelopeChanged);
  }

  async function ensureMetadata(vehicleType: string | null, envelopeChanged: boolean) {
    const current = get(store);
    if (!vehicleType) {
      store.update((state) => ({
        ...state,
        metadata: null,
        metadataState: "idle",
        metadataError: null,
      }));
      return;
    }

    if (!envelopeChanged && (current.metadataState === "ready" || current.metadataState === "unavailable")) {
      return;
    }

    const requestId = metadataRequestId + 1;
    metadataRequestId = requestId;

    store.update((state) => ({
      ...state,
      metadataState: "loading",
      metadataError: null,
    }));

    try {
      const metadata = normalizeMetadataMap(await service.fetchMetadata(vehicleType));
      if (metadataRequestId !== requestId) {
        return;
      }

      store.update((state) => ({
        ...state,
        metadata,
        metadataState: metadata ? "ready" : "unavailable",
        metadataError: metadata ? null : "Parameter metadata is unavailable for this vehicle type.",
      }));
    } catch (error) {
      if (metadataRequestId !== requestId) {
        return;
      }

      store.update((state) => ({
        ...state,
        metadata: null,
        metadataState: "unavailable",
        metadataError: service.formatError(error),
      }));
    }
  }

  function handleSessionState(sessionState: SessionStoreState) {
    const nextEnvelope = sessionState.activeEnvelope;
    const envelopeChanged = !areEnvelopesEqual(lastSessionEnvelope, nextEnvelope);
    const bootstrapStoreChanged = lastBootstrapStoreRef !== sessionState.bootstrap.paramStore;
    const bootstrapProgressChanged = lastBootstrapProgressRef !== sessionState.bootstrap.paramProgress;

    lastSessionEnvelope = nextEnvelope;
    lastBootstrapStoreRef = sessionState.bootstrap.paramStore;
    lastBootstrapProgressRef = sessionState.bootstrap.paramProgress;

    store.update((state) => ({
      ...state,
      sessionHydrated: sessionState.hydrated,
      sessionPhase: sessionState.lastPhase,
      phase: resolveDomainPhase(sessionState, state.activeEnvelope, state.paramStore, state.streamReady),
    }));

    if (!envelopeChanged && !bootstrapStoreChanged && !bootstrapProgressChanged) {
      return;
    }

    applyBootstrapState(sessionState, envelopeChanged);
  }

  function applyStoreEvent(event: { envelope: SessionEnvelope; value: ParamStore }) {
    const nextStore = normalizeParamStore(event.value);

    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return {
          ...state,
          lastNotice: `Dropped stale parameter store event for ${event.envelope.session_id}.`,
        };
      }

      if (!nextStore) {
        return {
          ...state,
          lastNotice: "Ignored malformed parameter store update for the active scope.",
        };
      }

      return {
        ...state,
        phase: "ready",
        paramStore: nextStore,
        stagedEdits: pruneResolvedStagedEdits(state.stagedEdits, nextStore),
        lastNotice: null,
      };
    });
  }

  function applyProgressEvent(event: { envelope: SessionEnvelope; value: ParamProgress }) {
    const nextProgress = normalizeParamProgress(event.value);

    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return {
          ...state,
          lastNotice: `Dropped stale parameter progress event for ${event.envelope.session_id}.`,
        };
      }

      if (!nextProgress) {
        return {
          ...state,
          lastNotice: "Ignored malformed parameter progress update for the active scope.",
        };
      }

      return {
        ...state,
        phase: "ready",
        paramProgress: nextProgress,
        lastNotice: null,
      };
    });
  }

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      store.update((state) => ({
        ...state,
        phase: "subscribing",
      }));

      stopSession = sessionStore.subscribe(handleSessionState);

      try {
        stopStreams = await service.subscribeAll({
          onStore: applyStoreEvent,
          onProgress: applyProgressEvent,
        });

        store.update((state) => ({
          ...state,
          hydrated: true,
          streamReady: true,
          streamError: null,
          phase: resolveReadyPhase(state),
        }));
      } catch (error) {
        store.update((state) => ({
          ...state,
          hydrated: true,
          streamReady: false,
          streamError: service.formatError(error),
          phase: state.paramStore ? "ready" : "stream-error",
          lastNotice: state.paramStore
            ? "Parameter stream is unavailable. Showing the last scoped bootstrap snapshot read-only."
            : "Parameter stream is unavailable for the current scope.",
        }));
      }
    })();

    return initializePromise;
  }

  function stageParameterEdit(item: ParameterWorkspaceItem, nextValue: number) {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    store.update((state) => {
      const currentValue = state.paramStore?.params[item.name]?.value ?? item.value;
      if (!Number.isFinite(currentValue)) {
        return state;
      }

      const stagedEdits = { ...state.stagedEdits };
      if (nextValue === currentValue) {
        delete stagedEdits[item.name];
        return {
          ...state,
          stagedEdits,
        };
      }

      stagedEdits[item.name] = {
        name: item.name,
        label: item.label,
        rawName: item.rawName,
        description: item.description,
        currentValue,
        currentValueText: formatParamValue(currentValue),
        nextValue,
        nextValueText: formatParamValue(nextValue),
        units: item.units,
        rebootRequired: item.rebootRequired,
        order: item.order,
      };

      return {
        ...state,
        stagedEdits,
      };
    });
  }

  function discardStagedEdit(name: string) {
    store.update((state) => {
      if (!(name in state.stagedEdits)) {
        return state;
      }

      const stagedEdits = { ...state.stagedEdits };
      delete stagedEdits[name];
      return {
        ...state,
        stagedEdits,
      };
    });
  }

  function clearStagedEdits() {
    store.update((state) => {
      if (Object.keys(state.stagedEdits).length === 0) {
        return state;
      }

      return {
        ...state,
        stagedEdits: {},
      };
    });
  }

  function reset() {
    stopStreams?.();
    stopStreams = null;
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    metadataRequestId = 0;
    lastSessionEnvelope = null;
    lastBootstrapStoreRef = null;
    lastBootstrapProgressRef = null;
    store.set(createInitialState());
  }

  return {
    subscribe: store.subscribe,
    initialize,
    stageParameterEdit,
    discardStagedEdit,
    clearStagedEdits,
    reset,
  };
}

export type ParamsStore = ReturnType<typeof createParamsStore>;

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
      .map((edit) => mergeStagedEdit(edit, itemIndex.get(edit.name)))
      .filter((edit) => edit.nextValue !== edit.currentValue)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

    return {
      readiness,
      status,
      activeEnvelope: $params.activeEnvelope,
      activeEnvelopeText: $params.activeEnvelope
        ? `${$params.activeEnvelope.session_id} · rev ${$params.activeEnvelope.reset_revision}`
        : "no active parameter scope",
      progressText: formatProgressText($params.paramProgress),
      metadataText: formatMetadataText($params.metadataState, $params.metadataError),
      noticeText: $params.streamError ?? $params.lastNotice,
      stagedCount: stagedEdits.length,
      stagedEdits,
      sections,
    };
  });
}

export const params = createParamsStore();

export const parameterWorkspaceView = createParameterWorkspaceViewStore(params);

function resolveDomainPhase(
  sessionState: Pick<SessionStoreState, "hydrated" | "lastPhase">,
  activeEnvelope: SessionEnvelope | null,
  paramStore: ParamStore | null,
  streamReady: boolean,
): ParamsDomainPhase {
  if (!sessionState.hydrated || sessionState.lastPhase === "subscribing" || sessionState.lastPhase === "bootstrapping") {
    return "bootstrapping";
  }

  if (!activeEnvelope) {
    return "unavailable";
  }

  if (!streamReady && paramStore === null) {
    return "stream-error";
  }

  return paramStore ? "ready" : "bootstrapping";
}

function resolveReadyPhase(state: ParamsStoreState): ParamsDomainPhase {
  if (state.paramStore) {
    return "ready";
  }

  if (!state.activeEnvelope) {
    return "unavailable";
  }

  return state.streamReady ? "bootstrapping" : "stream-error";
}

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
    return "awaiting parameter progress";
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
      return "metadata ready";
    case "loading":
      return "metadata loading";
    case "unavailable":
      return error ? `metadata unavailable · ${error}` : "metadata unavailable";
    case "idle":
    default:
      return "metadata idle";
  }
}

function areEnvelopesEqual(left: SessionEnvelope | null, right: SessionEnvelope | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return isSameEnvelope(left, right);
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
): StagedParameterEdit {
  if (!currentItem) {
    return {
      ...edit,
      nextValueText: formatParamValue(edit.nextValue),
      currentValueText: formatParamValue(edit.currentValue),
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
  };
}

function pruneResolvedStagedEdits(
  stagedEdits: Record<string, StagedParameterEdit>,
  paramStore: ParamStore | null,
): Record<string, StagedParameterEdit> {
  if (Object.keys(stagedEdits).length === 0) {
    return stagedEdits;
  }

  const nextEntries = Object.entries(stagedEdits).filter(([name, edit]) => {
    const currentValue = paramStore?.params[name]?.value;
    if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
      return true;
    }

    return currentValue !== edit.nextValue;
  });

  if (nextEntries.length === Object.keys(stagedEdits).length) {
    return stagedEdits;
  }

  return Object.fromEntries(nextEntries);
}

function normalizeParamStore(value: unknown): ParamStore | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeStore = value as Partial<ParamStoreShape>;
  if (typeof maybeStore.expected_count !== "number" || !Number.isFinite(maybeStore.expected_count)) {
    return null;
  }

  if (!maybeStore.params || typeof maybeStore.params !== "object") {
    return null;
  }

  const params: Record<string, ParamStore["params"][string]> = {};
  for (const [name, entry] of Object.entries(maybeStore.params)) {
    const normalized = normalizeParamEntry(name, entry);
    if (normalized) {
      params[name] = normalized;
    }
  }

  return {
    expected_count: maybeStore.expected_count,
    params,
  };
}

function normalizeParamEntry(name: string, value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ParamStore["params"][string]>;
  if (entry.name !== name) {
    return null;
  }

  if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
    return null;
  }

  if (typeof entry.index !== "number" || !Number.isInteger(entry.index)) {
    return null;
  }

  if (
    entry.param_type !== "uint8"
    && entry.param_type !== "int8"
    && entry.param_type !== "uint16"
    && entry.param_type !== "int16"
    && entry.param_type !== "uint32"
    && entry.param_type !== "int32"
    && entry.param_type !== "real32"
  ) {
    return null;
  }

  return {
    name: entry.name,
    value: entry.value,
    index: entry.index,
    param_type: entry.param_type,
  };
}

function normalizeParamProgress(value: unknown): ParamProgress | null {
  if (value === "completed" || value === "failed" || value === "cancelled") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if ("downloading" in value) {
    const downloading = (value as { downloading?: { received?: unknown; expected?: unknown } }).downloading;
    if (!downloading || typeof downloading.received !== "number" || !Number.isFinite(downloading.received)) {
      return null;
    }

    if (downloading.expected !== null && (typeof downloading.expected !== "number" || !Number.isFinite(downloading.expected))) {
      return null;
    }

    return {
      downloading: {
        received: downloading.received,
        expected: downloading.expected ?? null,
      },
    };
  }

  if ("writing" in value) {
    const writing = (value as { writing?: { index?: unknown; total?: unknown; name?: unknown } }).writing;
    if (
      !writing
      || typeof writing.index !== "number"
      || !Number.isFinite(writing.index)
      || typeof writing.total !== "number"
      || !Number.isFinite(writing.total)
      || typeof writing.name !== "string"
      || writing.name.trim().length === 0
    ) {
      return null;
    }

    return {
      writing: {
        index: writing.index,
        total: writing.total,
        name: writing.name,
      },
    };
  }

  return null;
}

function normalizeMetadataMap(map: ParamMetadataMap | null): ParamMetadataMap | null {
  if (!map) {
    return null;
  }

  const normalized = new Map<string, ParamMeta>();
  for (const [name, meta] of map.entries()) {
    if (!name || !meta || typeof meta !== "object") {
      continue;
    }

    normalized.set(name, {
      ...meta,
      humanName: typeof meta.humanName === "string" ? meta.humanName : name,
      description: typeof meta.description === "string" ? meta.description : "",
      rebootRequired: meta.rebootRequired === true,
    });
  }

  return normalized.size > 0 ? normalized : null;
}

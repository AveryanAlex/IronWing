import { get, writable } from "svelte/store";

import { trackAnalytics } from "../analytics/client";
import { countBucket } from "../analytics/properties";
import type { ParamMetadataMap } from "../../param-metadata";
import type {
  ParamApplyOutcome,
  ParamProgress,
  ParamStagingState,
  ParamStore,
} from "../../params";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent, type SourceKind } from "../../session";
import {
  buildParameterItemIndex,
  formatParamValue,
  type ParameterItemModel,
} from "../params/parameter-item-model";
import {
  createParamsService,
  type ParamsService,
} from "../platform/params";
import { isSameEnvelope } from "../scoped-session-events";
import {
  normalizeMetadataMap,
  normalizeParamProgress,
  normalizeParamStore,
} from "./params-normalization";
import {
  clearStagedEdits as clearStagedEditsMap,
  discardStagedEdit as discardStagedEditMap,
  stageParameterEdit as stageParameterEditMap,
  type StagedParameterEdit,
} from "./params-staged-edits";
import {
  createParameterWorkspaceViewStore,
  type ParameterWorkspaceItemView,
  type ParameterWorkspaceSectionView,
  type ParameterWorkspaceView,
  type ParameterWorkspaceViewStore,
} from "./params-view";
import type { SessionStore, SessionStorePhase, SessionStoreState } from "./session";
import { session } from "./session";

export type {
  ParameterWorkspaceItemView,
  ParameterWorkspaceSectionView,
  ParameterWorkspaceView,
  ParameterWorkspaceViewStore,
};
export type { StagedParameterEdit };
export { createParameterWorkspaceViewStore };

export type ParamsMetadataState = "idle" | "loading" | "ready" | "unavailable";
export type ParamsDomainPhase = "idle" | "subscribing" | "bootstrapping" | "ready" | "unavailable" | "stream-error";
export type ParameterWorkspaceStatus = "bootstrapping" | "unavailable" | "empty" | "ready";
export type ParamsApplyPhase = "idle" | "applying" | "failed" | "partial-failure";

export type ParameterApplyProgress = {
  completed: number;
  total: number;
  activeName: string | null;
};

export type RetainedParameterFailure = {
  name: string;
  requestedValue: number;
  confirmedValue: number | null;
  message: string;
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
  liveSessionConnected: boolean;
  vehicleType: string | null;
  firmwareVersion: string | null;
  paramStore: ParamStore | null;
  paramProgress: ParamProgress | null;
  metadata: ParamMetadataMap | null;
  metadataState: ParamsMetadataState;
  metadataError: string | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  stagingState: ParamStagingState;
  stagingRevision: number;
  pendingRebootIds: string[];
  retainedFailures: Record<string, RetainedParameterFailure>;
  applyPhase: ParamsApplyPhase;
  applyError: string | null;
  applyProgress: ParameterApplyProgress | null;
  scopeClearWarning: string | null;
  lastNotice: string | null;
};

type SessionReadable = Pick<SessionStore, "subscribe">;

const APPLY_BATCH_TIMEOUT_MS = 15_000;
const APPLY_TIMEOUT_MESSAGE = "Parameter apply timed out. Review the retained rows and retry.";

function emptyStagingState(): ParamStagingState {
  return {
    revision: 0,
    edits: [],
    apply_phase: "idle",
    pending_reboot_ids: [],
  };
}

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
    liveSessionConnected: false,
    vehicleType: null,
    firmwareVersion: null,
    paramStore: null,
    paramProgress: null,
    metadata: null,
    metadataState: "idle",
    metadataError: null,
    stagedEdits: {},
    stagingState: emptyStagingState(),
    stagingRevision: 0,
    pendingRebootIds: [],
    retainedFailures: {},
    applyPhase: "idle",
    applyError: null,
    applyProgress: null,
    scopeClearWarning: null,
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
  let applyRequestId = 0;
  let mutationQueue: Promise<void> = Promise.resolve();

  function invalidateInFlightApply() {
    applyRequestId += 1;
  }

  function applyBootstrapState(
    sessionState: SessionStoreState,
    envelopeChanged: boolean,
    metadataReload: { vehicleType: string | null; firmwareVersion: string | null; shouldReload: boolean },
  ) {
    const nextEnvelope = sessionState.activeEnvelope;
    const vehicleType = metadataReload.vehicleType;
    const firmwareVersion = metadataReload.firmwareVersion;
    const nextStore = normalizeParamStore(sessionState.bootstrap.paramStore);
    const nextProgress = normalizeParamProgress(sessionState.bootstrap.paramProgress);
    const liveSessionConnected = nextEnvelope?.source_kind === "live"
      && sessionState.sessionDomain.value?.connection.kind === "connected";

    if (envelopeChanged) {
      invalidateInFlightApply();
    }

    store.update((state) => {
      const nextPhase = resolveDomainPhase(sessionState, nextEnvelope, nextStore, state.streamReady);
      const scopeChangedFromActive = envelopeChanged && state.activeEnvelope !== null;
      const clearedScopeWarning = resolveScopeClearWarning(state, nextEnvelope, scopeChangedFromActive);

      if (!nextEnvelope) {
        return {
          ...state,
          phase: nextPhase,
          sessionHydrated: sessionState.hydrated,
          sessionPhase: sessionState.lastPhase,
          activeEnvelope: null,
          activeSource: null,
          liveSessionConnected: false,
          vehicleType,
          firmwareVersion,
          paramStore: null,
          paramProgress: null,
          metadata: null,
          metadataState: vehicleType ? state.metadataState : "idle",
          metadataError: null,
          stagedEdits: scopeChangedFromActive ? {} : state.stagedEdits,
          stagingState: scopeChangedFromActive ? emptyStagingState() : state.stagingState,
          stagingRevision: scopeChangedFromActive ? 0 : state.stagingRevision,
          pendingRebootIds: scopeChangedFromActive ? [] : state.pendingRebootIds,
          retainedFailures: scopeChangedFromActive ? {} : state.retainedFailures,
          applyPhase: scopeChangedFromActive ? "idle" : state.applyPhase,
          applyError: scopeChangedFromActive ? null : state.applyError,
          applyProgress: scopeChangedFromActive ? null : state.applyProgress,
          scopeClearWarning: clearedScopeWarning,
          lastNotice: envelopeChanged ? "No active session is available for parameter loading." : state.lastNotice,
        };
      }

      const shouldReplaceStore = envelopeChanged || nextStore !== null || state.paramStore === null;
      const shouldReplaceProgress = envelopeChanged || nextProgress !== null || state.paramProgress === null;
      const resolvedStore = shouldReplaceStore ? nextStore : state.paramStore;
      const projection = projectStagingState(
        scopeChangedFromActive ? emptyStagingState() : state.stagingState,
        resolvedStore,
        metadataReload.shouldReload ? null : state.metadata,
      );
      const nextStagedEdits = projection.stagedEdits;
      const nextRetainedFailures = projection.retainedFailures;

      return {
        ...state,
        phase: nextPhase,
        sessionHydrated: sessionState.hydrated,
        sessionPhase: sessionState.lastPhase,
        activeEnvelope: nextEnvelope,
        activeSource: nextEnvelope.source_kind,
        liveSessionConnected,
        vehicleType,
        firmwareVersion,
        paramStore: resolvedStore,
        paramProgress: shouldReplaceProgress ? nextProgress : state.paramProgress,
        metadata: metadataReload.shouldReload ? null : state.metadata,
        metadataState: metadataReload.shouldReload ? (vehicleType ? "loading" : "idle") : state.metadataState,
        metadataError: metadataReload.shouldReload ? null : state.metadataError,
        stagedEdits: nextStagedEdits,
        stagingState: scopeChangedFromActive ? emptyStagingState() : state.stagingState,
        stagingRevision: scopeChangedFromActive ? 0 : state.stagingRevision,
        pendingRebootIds: scopeChangedFromActive ? [] : state.pendingRebootIds,
        retainedFailures: nextRetainedFailures,
        applyPhase: scopeChangedFromActive ? "idle" : projection.applyPhase,
        applyError: scopeChangedFromActive ? null : Object.keys(nextRetainedFailures).length === 0 ? null : state.applyError,
        applyProgress: scopeChangedFromActive ? null : state.applyProgress,
        scopeClearWarning: clearedScopeWarning,
        lastNotice:
          envelopeChanged && nextStore === null
            ? "This session has not provided parameter values yet."
            : envelopeChanged
              ? null
              : state.lastNotice,
      };
    });

    if (metadataReload.shouldReload) {
      void ensureMetadata(vehicleType, firmwareVersion, true);
    }
  }

  async function ensureMetadata(vehicleType: string | null, firmwareVersion: string | null = null, forceReload = false) {
    const current = get(store);
    if (!vehicleType) {
      metadataRequestId += 1;
      store.update((state) => ({
        ...state,
        metadata: null,
        metadataState: "idle",
        metadataError: null,
        firmwareVersion: null,
      }));
      return;
    }

    if (!forceReload && (current.metadataState === "ready" || current.metadataState === "unavailable")) {
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
      const metadata = normalizeMetadataMap(await service.fetchMetadata(vehicleType, firmwareVersion));
      if (metadataRequestId !== requestId) {
        return;
      }

      store.update((state) => {
        const projection = projectStagingState(state.stagingState, state.paramStore, metadata);
        return {
          ...state,
          metadata,
          metadataState: metadata ? "ready" : "unavailable",
          metadataError: metadata ? null : "Parameter metadata is unavailable for this vehicle type.",
          stagedEdits: projection.stagedEdits,
          retainedFailures: projection.retainedFailures,
          applyPhase: projection.applyPhase,
        };
      });
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
    const currentState = get(store);
    const nextEnvelope = sessionState.activeEnvelope;
    const envelopeChanged = !areEnvelopesEqual(lastSessionEnvelope, nextEnvelope);
    const bootstrapStoreChanged = lastBootstrapStoreRef !== sessionState.bootstrap.paramStore;
    const bootstrapProgressChanged = lastBootstrapProgressRef !== sessionState.bootstrap.paramProgress;
    const metadataReload = resolveMetadataReload(currentState, sessionState, envelopeChanged);
    const liveSessionConnected = nextEnvelope?.source_kind === "live"
      && sessionState.sessionDomain.value?.connection.kind === "connected";
    const liveSessionConnectedChanged = currentState.liveSessionConnected !== liveSessionConnected;

    lastSessionEnvelope = nextEnvelope;
    lastBootstrapStoreRef = sessionState.bootstrap.paramStore;
    lastBootstrapProgressRef = sessionState.bootstrap.paramProgress;

    store.update((state) => ({
      ...state,
      sessionHydrated: sessionState.hydrated,
      sessionPhase: sessionState.lastPhase,
      liveSessionConnected,
      phase: resolveDomainPhase(sessionState, state.activeEnvelope, state.paramStore, state.streamReady),
    }));

    if (
      !envelopeChanged
      && !bootstrapStoreChanged
      && !bootstrapProgressChanged
      && !metadataReload.shouldReload
      && !liveSessionConnectedChanged
    ) {
      return;
    }

    applyBootstrapState(sessionState, envelopeChanged, metadataReload);
  }

  function applyStoreEvent(event: { envelope: SessionEnvelope; value: ParamStore }) {
    const nextStore = normalizeParamStore(event.value);

    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      if (!nextStore) {
        return state;
      }

      return {
        ...state,
        phase: "ready",
        paramStore: nextStore,
        lastNotice: null,
      };
    });
  }

  function applyProgressEvent(event: { envelope: SessionEnvelope; value: ParamProgress }) {
    const nextProgress = normalizeParamProgress(event.value);

    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      if (!nextProgress) {
        return state;
      }

      return {
        ...state,
        phase: "ready",
        paramProgress: nextProgress,
        applyProgress: state.applyPhase === "applying"
          ? resolveApplyProgress(nextProgress, state.applyProgress)
          : state.applyProgress,
        lastNotice: null,
      };
    });
  }

  function applyStagingEvent(event: { envelope: SessionEnvelope; value: ParamStagingState }) {
    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return applyBackendStagingState(state, event.value);
    });
  }

  function applyStagingSnapshot(staging: ParamStagingState) {
    store.update((state) => applyBackendStagingState(state, staging));
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
          onStaging: applyStagingEvent,
        });

        const snapshotEnvelope = get(store).activeEnvelope;
        const staging = await service.stagingSnapshot();
        const currentEnvelope = get(store).activeEnvelope;
        if (snapshotEnvelope && currentEnvelope && isSameEnvelope(snapshotEnvelope, currentEnvelope)) {
          applyStagingSnapshot(staging);
        }

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
            ? "Live parameter updates are unavailable. Showing the last loaded values."
            : "Live parameter updates are unavailable for this session.",
        }));
      }
    })();

    return initializePromise;
  }

  function stageParameterEdit(item: ParameterItemModel, nextValue: number) {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    store.update((state) => {
      const currentValue = state.paramStore?.params[item.name]?.value ?? item.value;
      if (!Number.isFinite(currentValue)) {
        return state;
      }

      const stagedEdits = stageParameterEditMap(state.stagedEdits, item, currentValue, nextValue);
      const retainedFailures = discardRetainedFailureMap(state.retainedFailures, item.name);
      trackAnalytics("params_edit_staged", {
        source: "parameter_workspace",
        staged_count_bucket: countBucket(Object.keys(stagedEdits).length),
      });

      return {
        ...state,
        stagedEdits,
        retainedFailures,
        applyPhase: state.applyPhase === "applying" ? state.applyPhase : resolveRetainedApplyPhase(retainedFailures, state.applyPhase),
        applyError: Object.keys(retainedFailures).length === 0 && state.applyPhase !== "applying" ? null : state.applyError,
        scopeClearWarning: null,
      };
    });

    enqueueMutation((revision) => service.stage([{
        name: item.name,
        value: nextValue,
        reboot_required: item.rebootRequired,
      }], revision));
  }

  function discardStagedEdit(name: string) {
    store.update((state) => {
      const stagedEdits = discardStagedEditMap(state.stagedEdits, name);
      const retainedFailures = discardRetainedFailureMap(state.retainedFailures, name);
      const hasRemainingRows = Object.keys(stagedEdits).length > 0;

      return {
        ...state,
        stagedEdits,
        retainedFailures,
        applyPhase: state.applyPhase === "applying"
          ? state.applyPhase
          : hasRemainingRows
            ? resolveRetainedApplyPhase(retainedFailures, state.applyPhase)
            : "idle",
        applyError: hasRemainingRows ? state.applyError : null,
        applyProgress: hasRemainingRows ? state.applyProgress : null,
      };
    });
    enqueueMutation((revision) => service.discard([name], revision));
  }

  function clearStagedEdits() {
    store.update((state) => ({
      ...state,
      stagedEdits: clearStagedEditsMap(state.stagedEdits),
      retainedFailures: {},
      applyPhase: "idle",
      applyError: null,
      applyProgress: null,
    }));
    enqueueMutation((revision) => service.clear(revision));
  }

  async function applyStagedEdits(targetNames?: string[]) {
    await mutationQueue;
    const state = get(store);
    if (!state.activeEnvelope || state.applyPhase === "applying") {
      return;
    }

    const requestedEdits = selectRequestedEdits(state.stagedEdits, targetNames);
    if (requestedEdits.length === 0) {
      return;
    }

    const requestId = applyRequestId + 1;
    applyRequestId = requestId;
    const requestEnvelope = state.activeEnvelope;

    store.update((current) => {
      let retainedFailures = current.retainedFailures;
      for (const edit of requestedEdits) {
        retainedFailures = discardRetainedFailureMap(retainedFailures, edit.name);
      }

      return {
        ...current,
        retainedFailures,
        applyPhase: "applying",
        applyError: null,
        applyProgress: {
          completed: 0,
          total: requestedEdits.length,
          activeName: null,
        },
      };
    });

    try {
      const outcome = await withTimeout(
        service.apply(requestedEdits.map((edit) => edit.name), state.stagingRevision),
        APPLY_BATCH_TIMEOUT_MS,
        new Error(APPLY_TIMEOUT_MESSAGE),
      );
      if (!isCurrentApplyRequest(requestId, requestEnvelope)) {
        return;
      }

      applyStagingSnapshot(outcome.state);
      store.update((current) => ({
        ...current,
        paramStore: applyConfirmedResults(current.paramStore, outcome.results),
      }));
      const failedCount = outcome.results.filter((result) => !result.success).length;
      trackAnalytics("params_applied", {
        changed_count: requestedEdits.length,
        result: failedCount === 0 ? "success" : "partial_failure",
        failed_count: failedCount,
      });
    } catch (error) {
      if (!isCurrentApplyRequest(requestId, requestEnvelope)) {
        return;
      }

      const message = service.formatError(error);
      trackAnalytics("params_applied", {
        changed_count: requestedEdits.length,
        result: "error",
        failed_count: requestedEdits.length,
      });
      try {
        const staging = await service.stagingSnapshot();
        const currentEnvelope = get(store).activeEnvelope;
        if (currentEnvelope && isSameEnvelope(requestEnvelope, currentEnvelope)) {
          applyStagingSnapshot(staging);
        }
      } catch {
        // Preserve the local review rows when the authoritative snapshot is unavailable.
      }
      store.update((current) => {
        if (!current.activeEnvelope || !isSameEnvelope(current.activeEnvelope, requestEnvelope)) {
          return current;
        }

        let retainedFailures = current.retainedFailures;
        for (const edit of requestedEdits) {
          retainedFailures = setRetainedFailure(retainedFailures, {
            name: edit.name,
            requestedValue: edit.nextValue,
            confirmedValue: null,
            message,
          });
        }

        return {
          ...current,
          retainedFailures,
          applyPhase: "failed",
          applyError: message,
          applyProgress: {
            completed: 0,
            total: requestedEdits.length,
            activeName: null,
          },
        };
      });
    }
  }

  function enqueueMutation(operation: (revision: number) => Promise<ParamStagingState>) {
    const requestEnvelope = get(store).activeEnvelope;
    mutationQueue = mutationQueue.then(async () => {
      const state = get(store);
      if (!requestEnvelope || !state.activeEnvelope || !isSameEnvelope(requestEnvelope, state.activeEnvelope)) {
        return;
      }
      try {
        const staging = await operation(state.stagingRevision);
        const currentEnvelope = get(store).activeEnvelope;
        if (currentEnvelope && isSameEnvelope(requestEnvelope, currentEnvelope)) {
          applyStagingSnapshot(staging);
        }
      } catch (error) {
        const message = service.formatError(error);
        try {
          const staging = await service.stagingSnapshot();
          const currentEnvelope = get(store).activeEnvelope;
          if (currentEnvelope && isSameEnvelope(requestEnvelope, currentEnvelope)) {
            applyStagingSnapshot(staging);
          }
        } catch {
          // The mutation failure is still useful even if a resync cannot be loaded.
        }
        store.update((current) => {
          if (!current.activeEnvelope || !isSameEnvelope(requestEnvelope, current.activeEnvelope)) {
            return current;
          }
          return { ...current, applyError: message };
        });
      }
    });
  }

  async function resetRebootCheckpoint() {
    await mutationQueue;
    const requestEnvelope = get(store).activeEnvelope;
    if (!requestEnvelope) {
      return;
    }
    const staging = await service.resetRebootCheckpoint();
    const currentEnvelope = get(store).activeEnvelope;
    if (currentEnvelope && isSameEnvelope(requestEnvelope, currentEnvelope)) {
      applyStagingSnapshot(staging);
    }
  }

  function reset() {
    stopStreams?.();
    stopStreams = null;
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    metadataRequestId += 1;
    invalidateInFlightApply();
    lastSessionEnvelope = null;
    lastBootstrapStoreRef = null;
    lastBootstrapProgressRef = null;
    mutationQueue = Promise.resolve();
    store.set(createInitialState());
  }

  function isCurrentApplyRequest(requestId: number, requestEnvelope: SessionEnvelope) {
    const current = get(store);
    return applyRequestId === requestId
      && current.activeEnvelope !== null
      && isSameEnvelope(current.activeEnvelope, requestEnvelope);
  }

  async function downloadAll() {
    try {
      await service.downloadAll();
      trackAnalytics("params_downloaded", {
        result: "success",
        param_count_bucket: countBucket(Object.keys(get(store).paramStore?.params ?? {}).length),
      });
    } catch (error) {
      trackAnalytics("params_downloaded", {
        result: "error",
        param_count_bucket: countBucket(Object.keys(get(store).paramStore?.params ?? {}).length),
      });
      throw error;
    }
  }

  async function cancelDownload() {
    await service.cancelDownload();
  }

  return {
    subscribe: store.subscribe,
    initialize,
    stageParameterEdit,
    discardStagedEdit,
    clearStagedEdits,
    applyStagedEdits,
    downloadAll,
    cancelDownload,
    resetRebootCheckpoint,
    reset,
  };
}

export type ParamsStore = ReturnType<typeof createParamsStore>;

export const params = createParamsStore();

export const parameterWorkspaceView = createParameterWorkspaceViewStore(params);

function applyBackendStagingState(
  state: ParamsStoreState,
  stagingState: ParamStagingState,
): ParamsStoreState {
  const projection = projectStagingState(stagingState, state.paramStore, state.metadata);
  return {
    ...state,
    stagingState,
    stagingRevision: stagingState.revision,
    pendingRebootIds: [...stagingState.pending_reboot_ids],
    stagedEdits: projection.stagedEdits,
    retainedFailures: projection.retainedFailures,
    applyPhase: projection.applyPhase,
    applyError: Object.keys(projection.retainedFailures).length > 0
      ? state.applyError ?? "Some parameter changes were not confirmed by the vehicle."
      : null,
    applyProgress: projection.applyPhase === "applying"
      ? state.applyProgress ?? {
        completed: 0,
        total: stagingState.edits.length,
        activeName: null,
      }
      : null,
    scopeClearWarning: null,
  };
}

function projectStagingState(
  stagingState: ParamStagingState,
  paramStore: ParamStore | null,
  metadata: ParamMetadataMap | null,
): {
  stagedEdits: Record<string, StagedParameterEdit>;
  retainedFailures: Record<string, RetainedParameterFailure>;
  applyPhase: ParamsApplyPhase;
} {
  const items = buildParameterItemIndex(paramStore, metadata);
  const stagedEdits: Record<string, StagedParameterEdit> = {};
  const retainedFailures: Record<string, RetainedParameterFailure> = {};

  for (const edit of stagingState.edits) {
    if (
      typeof edit.base_value !== "number"
      || !Number.isFinite(edit.base_value)
      || typeof edit.staged_value !== "number"
      || !Number.isFinite(edit.staged_value)
    ) {
      continue;
    }
    const item = items.get(edit.name);
    const increment = item?.increment ?? null;
    stagedEdits[edit.name] = {
      name: edit.name,
      rawName: item?.rawName ?? edit.name,
      label: item?.label ?? edit.name,
      description: item?.description ?? null,
      currentValue: edit.base_value,
      currentValueText: formatParamValue(edit.base_value, increment),
      nextValue: edit.staged_value,
      nextValueText: formatParamValue(edit.staged_value, increment),
      units: item?.units ?? null,
      rebootRequired: edit.reboot_required === true,
      origin: edit.origin,
      order: item?.order ?? Number.MAX_SAFE_INTEGER,
    };
    if (edit.failure) {
      retainedFailures[edit.name] = {
        name: edit.name,
        requestedValue: edit.staged_value,
        confirmedValue: paramStore?.params[edit.name]?.value ?? null,
        message: formatStagingFailure(edit.failure, edit.staged_value, paramStore?.params[edit.name]?.value ?? null),
      };
    }
  }

  const applyPhase: ParamsApplyPhase = stagingState.apply_phase === "partial_failure"
    ? "partial-failure"
    : stagingState.apply_phase;
  return { stagedEdits, retainedFailures, applyPhase };
}

function applyConfirmedResults(
  paramStore: ParamStore | null,
  results: ParamApplyOutcome["results"],
): ParamStore | null {
  if (!paramStore) {
    return null;
  }
  const params = { ...paramStore.params };
  for (const result of results) {
    if (!result.success || typeof result.confirmed_value !== "number" || !params[result.name]) {
      continue;
    }
    params[result.name] = { ...params[result.name], value: result.confirmed_value };
  }
  return { ...paramStore, params };
}

function formatStagingFailure(code: string, requestedValue: number, confirmedValue: number | null): string {
  if (code === "vehicle_did_not_return_a_result") {
    return "The vehicle returned an unexpected batch result.";
  }
  if (code === "vehicle_did_not_confirm_requested_value") {
    if (typeof confirmedValue === "number" && confirmedValue !== requestedValue) {
      return `Vehicle kept ${formatParamValue(confirmedValue)} instead of ${formatParamValue(requestedValue)}.`;
    }
    return "The vehicle did not confirm this parameter change.";
  }
  return code;
}

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

function areEnvelopesEqual(left: SessionEnvelope | null, right: SessionEnvelope | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return isSameEnvelope(left, right);
}

function resolveMetadataReload(
  state: Pick<ParamsStoreState, "vehicleType" | "firmwareVersion" | "metadataState" | "metadata">,
  sessionState: Pick<SessionStoreState, "sessionDomain">,
  envelopeChanged: boolean,
): { vehicleType: string | null; firmwareVersion: string | null; shouldReload: boolean } {
  const nextVehicleState = sessionState.sessionDomain.value?.vehicle_state;
  const nextVehicleType = normalizeVehicleType(nextVehicleState?.vehicle_type ?? null);
  const nextFirmwareVersion = normalizeFirmwareVersion(nextVehicleState?.firmware_version ?? null);
  if (envelopeChanged) {
    return {
      vehicleType: nextVehicleType,
      firmwareVersion: nextFirmwareVersion,
      shouldReload: true,
    };
  }

  if (!nextVehicleType) {
    return {
      vehicleType: state.vehicleType,
      firmwareVersion: state.firmwareVersion,
      shouldReload: false,
    };
  }

  const falseIdleState = state.vehicleType === nextVehicleType
    && state.firmwareVersion === nextFirmwareVersion
    && state.metadataState === "idle"
    && state.metadata === null;

  return {
    vehicleType: nextVehicleType,
    firmwareVersion: nextFirmwareVersion,
    shouldReload: nextVehicleType !== state.vehicleType || nextFirmwareVersion !== state.firmwareVersion || falseIdleState,
  };
}

function normalizeVehicleType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFirmwareVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^\d+\.\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

function selectRequestedEdits(
  stagedEdits: Record<string, StagedParameterEdit>,
  targetNames?: string[],
): StagedParameterEdit[] {
  const names = targetNames?.length ? new Set(targetNames) : null;
  return Object.values(stagedEdits)
    .filter((edit) => names === null || names.has(edit.name))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

function discardRetainedFailureMap(
  retainedFailures: Record<string, RetainedParameterFailure>,
  name: string,
): Record<string, RetainedParameterFailure> {
  if (!(name in retainedFailures)) {
    return retainedFailures;
  }

  const nextRetainedFailures = { ...retainedFailures };
  delete nextRetainedFailures[name];
  return nextRetainedFailures;
}

function setRetainedFailure(
  retainedFailures: Record<string, RetainedParameterFailure>,
  failure: RetainedParameterFailure,
): Record<string, RetainedParameterFailure> {
  return {
    ...retainedFailures,
    [failure.name]: failure,
  };
}

function resolveRetainedApplyPhase(
  retainedFailures: Record<string, RetainedParameterFailure>,
  previousPhase: ParamsApplyPhase,
): ParamsApplyPhase {
  if (Object.keys(retainedFailures).length === 0) {
    return "idle";
  }

  return previousPhase === "partial-failure" ? "partial-failure" : "failed";
}

function resolveApplyProgress(
  progress: ParamProgress,
  current: ParameterApplyProgress | null,
): ParameterApplyProgress | null {
  if (typeof progress === "string") {
    if (!current) {
      return null;
    }

    if (progress === "completed") {
      return {
        completed: current.total,
        total: current.total,
        activeName: null,
      };
    }

    return {
      ...current,
      activeName: null,
    };
  }

  if ("writing" in progress && progress.writing) {
    return {
      completed: progress.writing.index,
      total: progress.writing.total,
      activeName: progress.writing.name,
    };
  }

  return current;
}

function buildScopeClearWarning(nextEnvelope: SessionEnvelope | null): string {
  if (!nextEnvelope) {
    return "Parameter scope changed. Staged edits were cleared; reconnect and restage against the current session.";
  }

  return "Parameter scope changed. Staged edits were cleared; review current values and restage against the active session.";
}

function hasScopedWorkToClear(state: ParamsStoreState): boolean {
  return Object.keys(state.stagedEdits).length > 0
    || Object.keys(state.retainedFailures).length > 0
    || state.applyPhase === "applying"
    || state.applyProgress !== null;
}

function resolveScopeClearWarning(
  state: ParamsStoreState,
  nextEnvelope: SessionEnvelope | null,
  scopeChangedFromActive: boolean,
): string | null {
  if (!scopeChangedFromActive) {
    return state.scopeClearWarning;
  }

  return hasScopedWorkToClear(state) ? buildScopeClearWarning(nextEnvelope) : null;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  error: Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(error), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

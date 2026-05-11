import { get, writable } from "svelte/store";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamProgress, ParamStore, ParamWriteResult } from "../../params";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent, type SourceKind } from "../../session";
import {
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
  pruneResolvedStagedEdits,
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
  paramStore: ParamStore | null;
  paramProgress: ParamProgress | null;
  metadata: ParamMetadataMap | null;
  metadataState: ParamsMetadataState;
  metadataError: string | null;
  stagedEdits: Record<string, StagedParameterEdit>;
  retainedFailures: Record<string, RetainedParameterFailure>;
  applyPhase: ParamsApplyPhase;
  applyError: string | null;
  applyProgress: ParameterApplyProgress | null;
  scopeClearWarning: string | null;
  lastNotice: string | null;
};

type SessionReadable = Pick<SessionStore, "subscribe">;

type BatchWriteFailure = RetainedParameterFailure;

type BatchWriteOutcome = {
  successes: Array<{ name: string; confirmedValue: number }>;
  failures: BatchWriteFailure[];
  batchError: string | null;
};

const APPLY_BATCH_TIMEOUT_MS = 15_000;
const MALFORMED_BATCH_RESULT_MESSAGE = "The vehicle returned an unexpected batch result.";
const APPLY_TIMEOUT_MESSAGE = "Parameter apply timed out. Review the retained rows and retry.";

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
    paramStore: null,
    paramProgress: null,
    metadata: null,
    metadataState: "idle",
    metadataError: null,
    stagedEdits: {},
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
  let lastDownloadRequestScopeKey: string | null = null;
  let metadataRequestId = 0;
  let applyRequestId = 0;

  function invalidateInFlightApply() {
    applyRequestId += 1;
  }

  function resolveDownloadRequestScopeKey(state: Pick<ParamsStoreState, "activeEnvelope">) {
    const envelope = state.activeEnvelope;
    if (!envelope || envelope.source_kind !== "live") {
      return null;
    }

    return `${envelope.session_id}:${envelope.seek_epoch}:${envelope.reset_revision}`;
  }

  async function maybeStartLiveParamDownload() {
    const state = get(store);
    const scopeKey = resolveDownloadRequestScopeKey(state);

    if (!scopeKey) {
      lastDownloadRequestScopeKey = null;
      return;
    }

    if (!state.streamReady || !state.liveSessionConnected) {
      return;
    }

    if (state.paramStore || state.paramProgress || lastDownloadRequestScopeKey === scopeKey) {
      return;
    }

    lastDownloadRequestScopeKey = scopeKey;

    try {
      await service.downloadAll();
      store.update((current) => {
        if (resolveDownloadRequestScopeKey(current) !== scopeKey || current.paramStore || current.paramProgress) {
          return current;
        }

        return {
          ...current,
          lastNotice: "Requesting live parameter data from the vehicle.",
        };
      });
    } catch (error) {
      store.update((current) => {
        if (resolveDownloadRequestScopeKey(current) !== scopeKey) {
          return current;
        }

        return {
          ...current,
          lastNotice: `Failed to start parameter download: ${service.formatError(error)}`,
        };
      });
    }
  }

  function applyBootstrapState(
    sessionState: SessionStoreState,
    envelopeChanged: boolean,
    metadataReload: { vehicleType: string | null; shouldReload: boolean },
  ) {
    const nextEnvelope = sessionState.activeEnvelope;
    const vehicleType = metadataReload.vehicleType;
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
          paramStore: null,
          paramProgress: null,
          metadata: null,
          metadataState: vehicleType ? state.metadataState : "idle",
          metadataError: null,
          stagedEdits: scopeChangedFromActive ? {} : state.stagedEdits,
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
      const nextStagedEdits = scopeChangedFromActive
        ? {}
        : pruneResolvedStagedEdits(state.stagedEdits, resolvedStore);
      const nextRetainedFailures = scopeChangedFromActive
        ? {}
        : pruneRetainedFailures(state.retainedFailures, nextStagedEdits);

      return {
        ...state,
        phase: nextPhase,
        sessionHydrated: sessionState.hydrated,
        sessionPhase: sessionState.lastPhase,
        activeEnvelope: nextEnvelope,
        activeSource: nextEnvelope.source_kind,
        liveSessionConnected,
        vehicleType,
        paramStore: resolvedStore,
        paramProgress: shouldReplaceProgress ? nextProgress : state.paramProgress,
        metadata: metadataReload.shouldReload ? null : state.metadata,
        metadataState: metadataReload.shouldReload ? (vehicleType ? "loading" : "idle") : state.metadataState,
        metadataError: metadataReload.shouldReload ? null : state.metadataError,
        stagedEdits: nextStagedEdits,
        retainedFailures: nextRetainedFailures,
        applyPhase: scopeChangedFromActive ? "idle" : resolveRetainedApplyPhase(nextRetainedFailures, state.applyPhase),
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
      void ensureMetadata(vehicleType, true);
    }
  }

  async function ensureMetadata(vehicleType: string | null, forceReload = false) {
    const current = get(store);
    if (!vehicleType) {
      metadataRequestId += 1;
      store.update((state) => ({
        ...state,
        metadata: null,
        metadataState: "idle",
        metadataError: null,
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
    void maybeStartLiveParamDownload();
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

      const nextStagedEdits = pruneResolvedStagedEdits(state.stagedEdits, nextStore);
      const nextRetainedFailures = pruneRetainedFailures(state.retainedFailures, nextStagedEdits);

      return {
        ...state,
        phase: "ready",
        paramStore: nextStore,
        stagedEdits: nextStagedEdits,
        retainedFailures: nextRetainedFailures,
        applyPhase: state.applyPhase === "applying" ? state.applyPhase : resolveRetainedApplyPhase(nextRetainedFailures, state.applyPhase),
        applyError: Object.keys(nextRetainedFailures).length === 0 && state.applyPhase !== "applying" ? null : state.applyError,
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
        void maybeStartLiveParamDownload();
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

      return {
        ...state,
        stagedEdits,
        retainedFailures,
        applyPhase: state.applyPhase === "applying" ? state.applyPhase : resolveRetainedApplyPhase(retainedFailures, state.applyPhase),
        applyError: Object.keys(retainedFailures).length === 0 && state.applyPhase !== "applying" ? null : state.applyError,
        scopeClearWarning: null,
      };
    });
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
  }

  async function applyStagedEdits(targetNames?: string[]) {
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
    const requestedParams = requestedEdits.map((edit) => [edit.name, edit.nextValue] as [string, number]);

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
      const results = await withTimeout(
        service.writeBatch(requestedParams),
        APPLY_BATCH_TIMEOUT_MS,
        new Error(APPLY_TIMEOUT_MESSAGE),
      );
      if (!isCurrentApplyRequest(requestId, requestEnvelope)) {
        return;
      }

      const outcome = reconcileBatchWriteResults(requestedEdits, results);
      store.update((current) => {
        if (!current.activeEnvelope || !isSameEnvelope(current.activeEnvelope, requestEnvelope)) {
          return current;
        }

        const stagedEdits = { ...current.stagedEdits };
        let retainedFailures = current.retainedFailures;
        let paramStore = current.paramStore;

        for (const edit of requestedEdits) {
          retainedFailures = discardRetainedFailureMap(retainedFailures, edit.name);
        }

        for (const success of outcome.successes) {
          delete stagedEdits[success.name];
          paramStore = applySuccessfulWrite(paramStore, success.name, success.confirmedValue);
        }

        for (const failure of outcome.failures) {
          retainedFailures = setRetainedFailure(retainedFailures, failure);
        }

        return {
          ...current,
          paramStore,
          stagedEdits,
          retainedFailures,
          applyPhase: resolveOutcomePhase(outcome.failures, requestedEdits.length),
          applyError: outcome.failures.length === 0 ? null : outcome.batchError,
          applyProgress: outcome.failures.length === 0 ? null : {
            completed: outcome.successes.length,
            total: requestedEdits.length,
            activeName: null,
          },
          scopeClearWarning: current.scopeClearWarning,
        };
      });
    } catch (error) {
      if (!isCurrentApplyRequest(requestId, requestEnvelope)) {
        return;
      }

      const message = service.formatError(error);
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
    lastDownloadRequestScopeKey = null;
    store.set(createInitialState());
  }

  function isCurrentApplyRequest(requestId: number, requestEnvelope: SessionEnvelope) {
    const current = get(store);
    return applyRequestId === requestId
      && current.activeEnvelope !== null
      && isSameEnvelope(current.activeEnvelope, requestEnvelope);
  }

  async function downloadAll() {
    await service.downloadAll();
  }

  return {
    subscribe: store.subscribe,
    initialize,
    stageParameterEdit,
    discardStagedEdit,
    clearStagedEdits,
    applyStagedEdits,
    downloadAll,
    reset,
  };
}

export type ParamsStore = ReturnType<typeof createParamsStore>;

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

function areEnvelopesEqual(left: SessionEnvelope | null, right: SessionEnvelope | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return isSameEnvelope(left, right);
}

function resolveMetadataReload(
  state: Pick<ParamsStoreState, "vehicleType" | "metadataState" | "metadata">,
  sessionState: Pick<SessionStoreState, "sessionDomain">,
  envelopeChanged: boolean,
): { vehicleType: string | null; shouldReload: boolean } {
  const nextVehicleType = normalizeVehicleType(sessionState.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
  if (envelopeChanged) {
    return {
      vehicleType: nextVehicleType,
      shouldReload: true,
    };
  }

  if (!nextVehicleType) {
    return {
      vehicleType: state.vehicleType,
      shouldReload: false,
    };
  }

  const falseIdleState = state.vehicleType === nextVehicleType
    && state.metadataState === "idle"
    && state.metadata === null;

  return {
    vehicleType: nextVehicleType,
    shouldReload: nextVehicleType !== state.vehicleType || falseIdleState,
  };
}

function normalizeVehicleType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function applySuccessfulWrite(
  paramStore: ParamStore | null,
  name: string,
  confirmedValue: number,
): ParamStore | null {
  if (!paramStore?.params[name]) {
    return paramStore;
  }

  return {
    ...paramStore,
    params: {
      ...paramStore.params,
      [name]: {
        ...paramStore.params[name],
        value: confirmedValue,
      },
    },
  };
}

function pruneRetainedFailures(
  retainedFailures: Record<string, RetainedParameterFailure>,
  stagedEdits: Record<string, StagedParameterEdit>,
): Record<string, RetainedParameterFailure> {
  const stagedNames = new Set(Object.keys(stagedEdits));
  let changed = false;
  const nextEntries = Object.entries(retainedFailures).filter(([name]) => {
    const keep = stagedNames.has(name);
    changed ||= !keep;
    return keep;
  });

  return changed ? Object.fromEntries(nextEntries) : retainedFailures;
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

function resolveOutcomePhase(
  failures: BatchWriteFailure[],
  requestedCount: number,
): ParamsApplyPhase {
  if (failures.length === 0) {
    return "idle";
  }

  return failures.length === requestedCount ? "failed" : "partial-failure";
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

  if ("writing" in progress) {
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

function reconcileBatchWriteResults(
  requestedEdits: StagedParameterEdit[],
  results: ParamWriteResult[] | unknown,
): BatchWriteOutcome {
  if (!Array.isArray(results)) {
    return {
      successes: [],
      failures: requestedEdits.map((edit) => ({
        name: edit.name,
        requestedValue: edit.nextValue,
        confirmedValue: null,
        message: MALFORMED_BATCH_RESULT_MESSAGE,
      })),
      batchError: MALFORMED_BATCH_RESULT_MESSAGE,
    };
  }

  const requestedIndex = new Map(requestedEdits.map((edit) => [edit.name, edit]));
  const resultIndex = new Map<string, ParamWriteResult>();
  let batchError: string | null = null;

  for (const entry of results) {
    const normalized = normalizeWriteResult(entry);
    if (!normalized) {
      batchError = MALFORMED_BATCH_RESULT_MESSAGE;
      continue;
    }

    if (!requestedIndex.has(normalized.name) || resultIndex.has(normalized.name)) {
      batchError = MALFORMED_BATCH_RESULT_MESSAGE;
      continue;
    }

    resultIndex.set(normalized.name, normalized);
  }

  const successes: BatchWriteOutcome["successes"] = [];
  const failures: BatchWriteFailure[] = [];

  for (const edit of requestedEdits) {
    const result = resultIndex.get(edit.name);
    if (!result) {
      failures.push({
        name: edit.name,
        requestedValue: edit.nextValue,
        confirmedValue: null,
        message: MALFORMED_BATCH_RESULT_MESSAGE,
      });
      batchError ??= MALFORMED_BATCH_RESULT_MESSAGE;
      continue;
    }

    if (result.success === true) {
      successes.push({ name: result.name, confirmedValue: result.confirmed_value });
      continue;
    }

    failures.push({
      name: edit.name,
      requestedValue: edit.nextValue,
      confirmedValue: result.confirmed_value,
      message: formatWriteFailureMessage(edit.nextValue, result.confirmed_value),
    });
  }

  return {
    successes,
    failures,
    batchError,
  };
}

function normalizeWriteResult(value: unknown): ParamWriteResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ParamWriteResult>;
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    return null;
  }
  if (typeof entry.requested_value !== "number" || !Number.isFinite(entry.requested_value)) {
    return null;
  }
  if (typeof entry.confirmed_value !== "number" || !Number.isFinite(entry.confirmed_value)) {
    return null;
  }
  if (typeof entry.success !== "boolean") {
    return null;
  }

  return {
    name: entry.name,
    requested_value: entry.requested_value,
    confirmed_value: entry.confirmed_value,
    success: entry.success,
  };
}

function formatWriteFailureMessage(requestedValue: number, confirmedValue: number): string {
  if (confirmedValue !== requestedValue) {
    return `Vehicle kept ${formatParamValue(confirmedValue)} instead of ${formatParamValue(requestedValue)}.`;
  }

  return "The vehicle rejected this parameter change.";
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

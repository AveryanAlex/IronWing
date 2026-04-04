import { get, writable } from "svelte/store";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamProgress, ParamStore } from "../../params";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent, type SourceKind } from "../../session";
import type { ParameterWorkspaceItem } from "../params/workspace-sections";
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

export type { ParameterWorkspaceItemView, ParameterWorkspaceSectionView, ParameterWorkspaceView, ParameterWorkspaceViewStore };
export type { StagedParameterEdit };
export { createParameterWorkspaceViewStore };

export type ParamsMetadataState = "idle" | "loading" | "ready" | "unavailable";
export type ParamsDomainPhase = "idle" | "subscribing" | "bootstrapping" | "ready" | "unavailable" | "stream-error";
export type ParameterWorkspaceStatus = "bootstrapping" | "unavailable" | "empty" | "ready";

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

type SessionReadable = Pick<SessionStore, "subscribe">;

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
          lastNotice: envelopeChanged ? "No active session is available for parameter loading." : state.lastNotice,
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
            ? "This session has not provided parameter values yet."
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
      metadataRequestId += 1;
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
        return state;
      }

      if (!nextStore) {
        return state;
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
        return state;
      }

      if (!nextProgress) {
        return state;
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
            ? "Live parameter updates are unavailable. Showing the last loaded values."
            : "Live parameter updates are unavailable for this session.",
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

      return {
        ...state,
        stagedEdits: stageParameterEditMap(state.stagedEdits, item, currentValue, nextValue),
      };
    });
  }

  function discardStagedEdit(name: string) {
    store.update((state) => ({
      ...state,
      stagedEdits: discardStagedEditMap(state.stagedEdits, name),
    }));
  }

  function clearStagedEdits() {
    store.update((state) => ({
      ...state,
      stagedEdits: clearStagedEditsMap(state.stagedEdits),
    }));
  }

  function reset() {
    stopStreams?.();
    stopStreams = null;
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    metadataRequestId += 1;
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

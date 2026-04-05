import { get, writable } from "svelte/store";

import type { MessageRateInfo } from "../../telemetry";
import type { SessionEnvelope, SourceKind } from "../../session";
import { scopedEnvelopeKey } from "../scoped-session-events";
import {
  createLiveSettingsService,
  type LiveSettingsService,
} from "../platform/live-settings";
import {
  loadSettings,
  MESSAGE_RATE_HZ_LIMITS,
  type Settings,
  isValidMessageRateHz,
  isValidTelemetryRateHz,
  persistSettings,
  TELEMETRY_RATE_HZ_LIMITS,
} from "./settings";
import type { SessionStore } from "./session";
import type { SessionStoreState } from "./session-state";
import { session } from "./session";

export type LiveSettingsCatalogPhase = "idle" | "loading" | "ready" | "failed";
export type LiveSettingsApplyPhase = "idle" | "applying" | "failed" | "partial-failure";
export type LiveSettingsApplyTarget = "draft" | "reconnect" | null;
export type LiveSettingsReconnectPhase = "idle" | "pending" | "applying" | "failed";

export type LiveSettingsDraft = Pick<Settings, "telemetryRateHz" | "messageRates">;

export type LiveSettingsMessageRateError = {
  messageId: number;
  requestedRateHz: number | null;
  message: string;
};

export type LiveSettingsStoreState = {
  hydrated: boolean;
  sessionHydrated: boolean;
  activeEnvelope: SessionEnvelope | null;
  activeSource: SourceKind | null;
  liveVehicleConnected: boolean;
  confirmedSettings: Settings;
  draft: LiveSettingsDraft;
  messageRateCatalog: MessageRateInfo[];
  catalogPhase: LiveSettingsCatalogPhase;
  catalogError: string | null;
  applyPhase: LiveSettingsApplyPhase;
  applyTarget: LiveSettingsApplyTarget;
  lastApplyError: string | null;
  telemetryRateError: string | null;
  messageRateErrors: Record<number, LiveSettingsMessageRateError>;
  reconnectPhase: LiveSettingsReconnectPhase;
  reconnectError: string | null;
};

type SessionReadable = Pick<SessionStore, "subscribe">;
type StorageLike = Pick<Storage, "getItem" | "setItem"> | null;

type MessageRateApplyRequest = {
  messageId: number;
  requestedRateHz: number | null;
  targetRateHz: number;
};

const APPLY_TIMEOUT_MS = 15_000;
const APPLY_TIMEOUT_MESSAGE = "Live settings apply timed out. Review the unsaved rows and retry.";
const MESSAGE_RATE_SCOPE_CHANGED_MESSAGE = "Live session changed while applying message rates. Review the unsaved rows and retry.";
const MESSAGE_RATE_METADATA_MISSING_MESSAGE = "Message-rate metadata is unavailable for this row.";
const MESSAGE_RATE_DISCONNECTED_MESSAGE = "Message-rate changes require an active live vehicle connection.";
const MESSAGE_RATE_PLAYBACK_MESSAGE = "Message-rate changes are unavailable during playback.";
const TELEMETRY_RATE_INVALID_MESSAGE = `Telemetry cadence must be an integer between ${TELEMETRY_RATE_HZ_LIMITS.min} and ${TELEMETRY_RATE_HZ_LIMITS.max} Hz.`;
const MESSAGE_RATE_INVALID_MESSAGE = `Message rate must be between ${MESSAGE_RATE_HZ_LIMITS.min} and ${MESSAGE_RATE_HZ_LIMITS.max} Hz.`;
const MESSAGE_RATE_CATALOG_ERROR = "Message-rate metadata is unavailable.";

function createInitialState(storage: StorageLike): LiveSettingsStoreState {
  const confirmedSettings = loadSettings(storage);

  return {
    hydrated: false,
    sessionHydrated: false,
    activeEnvelope: null,
    activeSource: null,
    liveVehicleConnected: false,
    confirmedSettings,
    draft: createDraft(confirmedSettings),
    messageRateCatalog: [],
    catalogPhase: "idle",
    catalogError: null,
    applyPhase: "idle",
    applyTarget: null,
    lastApplyError: null,
    telemetryRateError: null,
    messageRateErrors: {},
    reconnectPhase: hasConfirmedMessageRates(confirmedSettings) ? "pending" : "idle",
    reconnectError: null,
  };
}

export function createLiveSettingsStore(
  sessionStore: SessionReadable = session,
  service: LiveSettingsService = createLiveSettingsService(),
  storage: StorageLike = typeof localStorage === "undefined" ? null : localStorage,
) {
  const store = writable<LiveSettingsStoreState>(createInitialState(storage));
  let initializePromise: Promise<void> | null = null;
  let stopSession: (() => void) | null = null;
  let applyRequestId = 0;
  let lastLiveScopeKey: string | null = null;
  let lastAppliedMessageRateScopeKey: string | null = null;
  let lastReconnectAttemptScopeKey: string | null = null;

  function invalidateInFlightApply() {
    applyRequestId += 1;
  }

  function handleSessionState(sessionState: SessionStoreState) {
    const nextLiveVehicleConnected = isLiveVehicleConnected(sessionState);
    const nextLiveScopeKey = resolveLiveScopeKey(sessionState.activeEnvelope, nextLiveVehicleConnected);
    const liveScopeChanged = nextLiveScopeKey !== lastLiveScopeKey;

    if (liveScopeChanged) {
      lastAppliedMessageRateScopeKey = null;
      lastReconnectAttemptScopeKey = null;
      lastLiveScopeKey = nextLiveScopeKey;
    }

    store.update((state) => ({
      ...state,
      sessionHydrated: sessionState.hydrated,
      activeEnvelope: sessionState.activeEnvelope,
      activeSource: sessionState.activeEnvelope?.source_kind ?? null,
      liveVehicleConnected: nextLiveVehicleConnected,
      applyPhase: liveScopeChanged && state.applyTarget === "reconnect" ? "idle" : state.applyPhase,
      applyTarget: liveScopeChanged && state.applyTarget === "reconnect" ? null : state.applyTarget,
      reconnectPhase: resolveReconnectPhase(state.confirmedSettings, sessionState, nextLiveVehicleConnected),
      reconnectError: nextLiveVehicleConnected ? state.reconnectError : null,
    }));

    maybeStartReconnectApply();
  }

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      stopSession = sessionStore.subscribe(handleSessionState);

      try {
        await refreshMessageRateCatalog();
      } finally {
        store.update((state) => ({
          ...state,
          hydrated: true,
        }));
        maybeStartReconnectApply();
      }
    })();

    return initializePromise;
  }

  async function refreshMessageRateCatalog() {
    store.update((state) => ({
      ...state,
      catalogPhase: "loading",
      catalogError: null,
    }));

    try {
      const catalog = await service.loadMessageRateCatalog();
      store.update((state) => ({
        ...state,
        messageRateCatalog: catalog,
        catalogPhase: catalog.length > 0 ? "ready" : "failed",
        catalogError: catalog.length > 0 ? null : MESSAGE_RATE_CATALOG_ERROR,
      }));
    } catch (error) {
      store.update((state) => ({
        ...state,
        messageRateCatalog: [],
        catalogPhase: "failed",
        catalogError: service.formatError(error),
      }));
    }
  }

  function stageTelemetryRate(rateHz: number) {
    store.update((state) => {
      if (state.applyPhase === "applying") {
        return state;
      }

      return {
        ...state,
        draft: {
          ...state.draft,
          telemetryRateHz: rateHz,
        },
        telemetryRateError: null,
      };
    });
  }

  function stageMessageRate(messageId: number, rateHz: number | null) {
    store.update((state) => {
      if (state.applyPhase === "applying") {
        return state;
      }

      if (!Number.isInteger(messageId) || messageId < 0) {
        return state;
      }

      const messageRates = { ...state.draft.messageRates };
      if (rateHz === null) {
        delete messageRates[messageId];
      } else {
        messageRates[messageId] = rateHz;
      }

      const messageRateErrors = { ...state.messageRateErrors };
      delete messageRateErrors[messageId];

      return {
        ...state,
        draft: {
          ...state.draft,
          messageRates,
        },
        messageRateErrors,
      };
    });
  }

  function discardDrafts() {
    store.update((state) => {
      if (state.applyPhase === "applying") {
        return state;
      }

      return {
        ...state,
        draft: createDraft(state.confirmedSettings),
        applyPhase: "idle",
        applyTarget: null,
        lastApplyError: null,
        telemetryRateError: null,
        messageRateErrors: {},
      };
    });
  }

  async function applyDrafts() {
    const state = get(store);
    if (state.applyPhase === "applying") {
      return;
    }

    const telemetryChanged = state.draft.telemetryRateHz !== state.confirmedSettings.telemetryRateHz;
    const changedMessageIds = collectChangedMessageRateIds(
      state.confirmedSettings.messageRates,
      state.draft.messageRates,
    );

    if (!telemetryChanged && changedMessageIds.length === 0) {
      store.update((current) => ({
        ...current,
        applyPhase: "idle",
        applyTarget: null,
        lastApplyError: null,
        telemetryRateError: null,
      }));
      return;
    }

    const requestId = applyRequestId + 1;
    applyRequestId = requestId;
    const liveScopeKey = resolveLiveScopeKey(state.activeEnvelope, state.liveVehicleConnected);

    store.update((current) => {
      const messageRateErrors = { ...current.messageRateErrors };
      for (const messageId of changedMessageIds) {
        delete messageRateErrors[messageId];
      }

      return {
        ...current,
        applyPhase: "applying",
        applyTarget: "draft",
        lastApplyError: null,
        telemetryRateError: null,
        messageRateErrors,
      };
    });

    let nextConfirmedSettings = state.confirmedSettings;
    let telemetryRateError: string | null = null;

    if (telemetryChanged) {
      if (!isValidTelemetryRateHz(state.draft.telemetryRateHz)) {
        telemetryRateError = TELEMETRY_RATE_INVALID_MESSAGE;
      } else {
        try {
          await withTimeout(
            service.applyTelemetryRate(state.draft.telemetryRateHz),
            APPLY_TIMEOUT_MS,
            new Error(APPLY_TIMEOUT_MESSAGE),
          );
          nextConfirmedSettings = {
            ...nextConfirmedSettings,
            telemetryRateHz: state.draft.telemetryRateHz,
          };
        } catch (error) {
          telemetryRateError = service.formatError(error);
        }
      }
    }

    const availabilityReason = resolveMessageRateAvailabilityReason(state);
    const requestPlan = availabilityReason
      ? {
          requests: [] as MessageRateApplyRequest[],
          errors: changedMessageIds.map((messageId) =>
            createMessageRateError(
              messageId,
              readDraftRate(state.draft.messageRates, messageId),
              availabilityReason,
            )),
        }
      : buildMessageRateRequests(state, changedMessageIds);

    let messageRateErrors = requestPlan.errors;

    if (requestPlan.requests.length > 0) {
      const settled = await Promise.allSettled(
        requestPlan.requests.map((request) =>
          withTimeout(
            service.applyMessageRate(request.messageId, request.targetRateHz),
            APPLY_TIMEOUT_MS,
            new Error(APPLY_TIMEOUT_MESSAGE),
          ),
        ),
      );

      const scopeStillCurrent = isCurrentLiveScope(liveScopeKey);
      if (!scopeStillCurrent) {
        messageRateErrors = [
          ...messageRateErrors,
          ...requestPlan.requests.map((request) =>
            createMessageRateError(request.messageId, request.requestedRateHz, MESSAGE_RATE_SCOPE_CHANGED_MESSAGE)),
        ];
      } else {
        for (const [index, result] of settled.entries()) {
          const request = requestPlan.requests[index];
          if (!request) {
            continue;
          }

          if (result.status === "fulfilled") {
            nextConfirmedSettings = applyConfirmedMessageRate(
              nextConfirmedSettings,
              request.messageId,
              request.requestedRateHz,
            );
            continue;
          }

          messageRateErrors.push(
            createMessageRateError(
              request.messageId,
              request.requestedRateHz,
              service.formatError(result.reason),
            ),
          );
        }

        lastAppliedMessageRateScopeKey = liveScopeKey;
      }
    }

    if (applyRequestId !== requestId) {
      return;
    }

    if (!settingsEqual(nextConfirmedSettings, state.confirmedSettings)) {
      persistSettings(nextConfirmedSettings, storage);
    }

    const nextMessageRateErrors = mergeMessageRateErrors(get(store).messageRateErrors, changedMessageIds, messageRateErrors);
    const lastApplyError = summarizeApplyErrors(telemetryRateError, messageRateErrors);
    const hadConfirmedChanges = !settingsEqual(nextConfirmedSettings, state.confirmedSettings);
    const nextApplyPhase = resolveApplyPhase(telemetryRateError, messageRateErrors, hadConfirmedChanges);

    store.update((current) => ({
      ...current,
      confirmedSettings: nextConfirmedSettings,
      applyPhase: nextApplyPhase,
      applyTarget: null,
      lastApplyError,
      telemetryRateError,
      messageRateErrors: nextMessageRateErrors,
      reconnectPhase: nextApplyPhase === "idle"
        ? resolveReconnectPhaseFromState(nextConfirmedSettings, current.activeSource, current.liveVehicleConnected)
        : current.reconnectPhase,
      reconnectError: nextApplyPhase === "idle" ? null : current.reconnectError,
    }));

    lastReconnectAttemptScopeKey = null;
    maybeStartReconnectApply();
  }

  function reset() {
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    invalidateInFlightApply();
    lastLiveScopeKey = null;
    lastAppliedMessageRateScopeKey = null;
    lastReconnectAttemptScopeKey = null;
    store.set(createInitialState(storage));
  }

  function isCurrentLiveScope(scopeKey: string | null) {
    return resolveLiveScopeKey(get(store).activeEnvelope, get(store).liveVehicleConnected) === scopeKey;
  }

  function maybeStartReconnectApply() {
    const state = get(store);
    if (!hasConfirmedMessageRates(state.confirmedSettings)) {
      if (state.reconnectPhase !== "idle") {
        store.update((current) => ({
          ...current,
          reconnectPhase: "idle",
          reconnectError: null,
        }));
      }
      return;
    }

    if (!state.liveVehicleConnected || !state.activeEnvelope) {
      if (state.reconnectPhase !== "pending") {
        store.update((current) => ({
          ...current,
          reconnectPhase: "pending",
          reconnectError: null,
        }));
      }
      return;
    }

    const scopeKey = resolveLiveScopeKey(state.activeEnvelope, state.liveVehicleConnected);
    if (!scopeKey) {
      return;
    }

    if (lastAppliedMessageRateScopeKey === scopeKey || lastReconnectAttemptScopeKey === scopeKey) {
      if (state.reconnectPhase !== "idle") {
        store.update((current) => ({
          ...current,
          reconnectPhase: "idle",
          reconnectError: null,
        }));
      }
      return;
    }

    if (state.applyPhase === "applying") {
      if (state.applyTarget === "reconnect") {
        return;
      }

      if (state.reconnectPhase !== "pending") {
        store.update((current) => ({
          ...current,
          reconnectPhase: "pending",
        }));
      }
      return;
    }

    void applyConfirmedMessageRates(scopeKey);
  }

  async function applyConfirmedMessageRates(scopeKey: string) {
    const state = get(store);
    if (!state.activeEnvelope || !state.liveVehicleConnected || !hasConfirmedMessageRates(state.confirmedSettings)) {
      return;
    }

    const requests = Object.entries(state.confirmedSettings.messageRates)
      .map(([messageId, rateHz]) => ({
        messageId: Number.parseInt(messageId, 10),
        requestedRateHz: rateHz,
        targetRateHz: rateHz,
      }))
      .filter((request) => Number.isInteger(request.messageId) && request.messageId >= 0 && isValidMessageRateHz(request.targetRateHz));

    if (requests.length === 0) {
      lastAppliedMessageRateScopeKey = scopeKey;
      lastReconnectAttemptScopeKey = scopeKey;
      store.update((current) => ({
        ...current,
        reconnectPhase: "idle",
        reconnectError: null,
      }));
      return;
    }

    const requestId = applyRequestId + 1;
    applyRequestId = requestId;
    store.update((current) => ({
      ...current,
      applyPhase: "applying",
      applyTarget: "reconnect",
      lastApplyError: null,
      reconnectPhase: "applying",
      reconnectError: null,
    }));

    const settled = await Promise.allSettled(
      requests.map((request) =>
        withTimeout(
          service.applyMessageRate(request.messageId, request.targetRateHz),
          APPLY_TIMEOUT_MS,
          new Error(APPLY_TIMEOUT_MESSAGE),
        ),
      ),
    );

    if (applyRequestId !== requestId || !isCurrentLiveScope(scopeKey)) {
      return;
    }

    const failures = settled.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [];
      }

      const request = requests[index];
      if (!request) {
        return [];
      }

      return [createMessageRateError(request.messageId, request.requestedRateHz, service.formatError(result.reason))];
    });

    lastReconnectAttemptScopeKey = scopeKey;
    if (failures.length === 0) {
      lastAppliedMessageRateScopeKey = scopeKey;
      store.update((current) => ({
        ...current,
        applyPhase: "idle",
        applyTarget: null,
        lastApplyError: null,
        reconnectPhase: "idle",
        reconnectError: null,
      }));
      return;
    }

    lastAppliedMessageRateScopeKey = null;
    const reconnectError = summarizeApplyErrors(null, failures);
    store.update((current) => ({
      ...current,
      applyPhase: "idle",
      applyTarget: null,
      lastApplyError: reconnectError,
      reconnectPhase: "failed",
      reconnectError,
    }));
  }

  return {
    subscribe: store.subscribe,
    initialize,
    refreshMessageRateCatalog,
    stageTelemetryRate,
    stageMessageRate,
    discardDrafts,
    applyDrafts,
    reset,
  };
}

export type LiveSettingsStore = ReturnType<typeof createLiveSettingsStore>;

export const liveSettings = createLiveSettingsStore();

export function hasUnsavedLiveSettings(state: Pick<LiveSettingsStoreState, "confirmedSettings" | "draft">) {
  return state.confirmedSettings.telemetryRateHz !== state.draft.telemetryRateHz
    || !messageRatesEqual(state.confirmedSettings.messageRates, state.draft.messageRates);
}

export function resolveMessageRateAvailabilityReason(
  state: Pick<LiveSettingsStoreState, "activeSource" | "liveVehicleConnected">,
): string | null {
  if (state.activeSource === "playback") {
    return MESSAGE_RATE_PLAYBACK_MESSAGE;
  }

  if (!state.liveVehicleConnected) {
    return MESSAGE_RATE_DISCONNECTED_MESSAGE;
  }

  return null;
}

function createDraft(settings: Settings): LiveSettingsDraft {
  return {
    telemetryRateHz: settings.telemetryRateHz,
    messageRates: { ...settings.messageRates },
  };
}

function collectChangedMessageRateIds(
  confirmed: Record<number, number>,
  draft: Record<number, number>,
): number[] {
  const ids = new Set([...Object.keys(confirmed), ...Object.keys(draft)]);
  return [...ids]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .filter((messageId) => readDraftRate(confirmed, messageId) !== readDraftRate(draft, messageId))
    .sort((left, right) => left - right);
}

function buildMessageRateRequests(
  state: Pick<LiveSettingsStoreState, "draft" | "messageRateCatalog">,
  messageIds: number[],
): { requests: MessageRateApplyRequest[]; errors: LiveSettingsMessageRateError[] } {
  const defaultRates = new Map(state.messageRateCatalog.map((entry) => [entry.id, entry.default_rate_hz]));
  const requests: MessageRateApplyRequest[] = [];
  const errors: LiveSettingsMessageRateError[] = [];

  for (const messageId of messageIds) {
    const draftRate = readDraftRate(state.draft.messageRates, messageId);
    if (draftRate === null) {
      const defaultRate = defaultRates.get(messageId);
      if (!isValidMessageRateHz(defaultRate)) {
        errors.push(createMessageRateError(messageId, null, MESSAGE_RATE_METADATA_MISSING_MESSAGE));
        continue;
      }

      requests.push({
        messageId,
        requestedRateHz: null,
        targetRateHz: defaultRate,
      });
      continue;
    }

    if (!isValidMessageRateHz(draftRate)) {
      errors.push(createMessageRateError(messageId, draftRate, MESSAGE_RATE_INVALID_MESSAGE));
      continue;
    }

    requests.push({
      messageId,
      requestedRateHz: draftRate,
      targetRateHz: draftRate,
    });
  }

  return { requests, errors };
}

function applyConfirmedMessageRate(
  settings: Settings,
  messageId: number,
  rateHz: number | null,
): Settings {
  const messageRates = { ...settings.messageRates };
  if (rateHz === null) {
    delete messageRates[messageId];
  } else {
    messageRates[messageId] = rateHz;
  }

  return {
    ...settings,
    messageRates,
  };
}

function isLiveVehicleConnected(sessionState: Pick<SessionStoreState, "activeEnvelope" | "sessionDomain">) {
  return sessionState.activeEnvelope?.source_kind === "live"
    && sessionState.sessionDomain.value?.connection.kind === "connected";
}

function resolveLiveScopeKey(envelope: SessionEnvelope | null, connected: boolean) {
  return envelope && connected ? scopedEnvelopeKey(envelope) : null;
}

function hasConfirmedMessageRates(settings: Pick<Settings, "messageRates">) {
  return Object.keys(settings.messageRates).length > 0;
}

function resolveReconnectPhase(
  settings: Pick<Settings, "messageRates">,
  sessionState: Pick<SessionStoreState, "activeEnvelope" | "sessionDomain">,
  connected: boolean,
): LiveSettingsReconnectPhase {
  return resolveReconnectPhaseFromState(
    settings,
    sessionState.activeEnvelope?.source_kind ?? null,
    connected,
  );
}

function resolveReconnectPhaseFromState(
  settings: Pick<Settings, "messageRates">,
  activeSource: SourceKind | null,
  connected: boolean,
): LiveSettingsReconnectPhase {
  if (!hasConfirmedMessageRates(settings)) {
    return "idle";
  }

  if (!connected || activeSource !== "live") {
    return "pending";
  }

  return "idle";
}

function createMessageRateError(
  messageId: number,
  requestedRateHz: number | null,
  message: string,
): LiveSettingsMessageRateError {
  return {
    messageId,
    requestedRateHz,
    message,
  };
}

function mergeMessageRateErrors(
  current: Record<number, LiveSettingsMessageRateError>,
  retriedMessageIds: number[],
  nextErrors: LiveSettingsMessageRateError[],
): Record<number, LiveSettingsMessageRateError> {
  const merged = { ...current };
  for (const messageId of retriedMessageIds) {
    delete merged[messageId];
  }
  for (const error of nextErrors) {
    merged[error.messageId] = error;
  }
  return merged;
}

function summarizeApplyErrors(
  telemetryRateError: string | null,
  messageRateErrors: LiveSettingsMessageRateError[],
): string | null {
  if (telemetryRateError && messageRateErrors.length === 0) {
    return telemetryRateError;
  }

  if (!telemetryRateError && messageRateErrors.length === 1) {
    return messageRateErrors[0]?.message ?? null;
  }

  if (!telemetryRateError && messageRateErrors.length > 1) {
    return `${messageRateErrors.length} message-rate rows failed to apply.`;
  }

  if (telemetryRateError && messageRateErrors.length > 0) {
    return `${telemetryRateError} ${messageRateErrors.length} message-rate rows failed to apply.`;
  }

  return null;
}

function resolveApplyPhase(
  telemetryRateError: string | null,
  messageRateErrors: LiveSettingsMessageRateError[],
  hadConfirmedChanges: boolean,
): LiveSettingsApplyPhase {
  const hasFailures = Boolean(telemetryRateError) || messageRateErrors.length > 0;
  if (!hasFailures) {
    return "idle";
  }

  return hadConfirmedChanges ? "partial-failure" : "failed";
}

function readDraftRate(messageRates: Record<number, number>, messageId: number): number | null {
  return messageId in messageRates ? messageRates[messageId] ?? null : null;
}

function settingsEqual(left: Settings, right: Settings) {
  return left.telemetryRateHz === right.telemetryRateHz
    && left.svsEnabled === right.svsEnabled
    && left.terrainSafetyMarginM === right.terrainSafetyMarginM
    && left.cruiseSpeedMps === right.cruiseSpeedMps
    && left.hoverSpeedMps === right.hoverSpeedMps
    && messageRatesEqual(left.messageRates, right.messageRates);
}

function messageRatesEqual(left: Record<number, number>, right: Record<number, number>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const messageId = Number.parseInt(key, 10);
    return left[messageId] === right[messageId];
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(error), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        globalThis.clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

import { derived, get, writable } from "svelte/store";

import {
  createSessionService,
  type SessionConnectionFormState,
  type SessionService,
} from "../platform/session";
import { trackAnalytics } from "../analytics/client";
import { durationBucket } from "../analytics/properties";
import { isNewerScopedEnvelope, isSameEnvelope } from "../scoped-session-events";
import type { CalibrationDomain } from "../../calibration";
import type { GuidedDomain } from "../../guided";
import type { PlaybackStateSnapshot } from "../../playback";
import type { SensorHealthDomain } from "../../sensor-health";
import type {
  SessionConnection,
  SessionDomain,
  SessionEnvelope,
  SourceKind,
} from "../../session";
import type { StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";
import type { TelemetryState } from "../../telemetry";
import type { DomainValue } from "../domain-status";
import { applyScopedDomainEvent } from "./session-scoped-update";
import {
  createSessionBootstrapController,
  mergeBootstrapSnapshot,
} from "./session-bootstrap";
import {
  createInitialSessionState,
  type ConnectionRequestPhase,
  type SessionStoreState,
} from "./session-state";
import { createSessionViewStore } from "./session-view";
import { toConnectFormValue } from "../connection/connection-form";

export type {
  SessionBootstrapState,
  SessionStorePhase,
  SessionStoreState,
} from "./session-state";
export { createSessionViewStore } from "./session-view";

export function createSessionStore(service: SessionService = createSessionService()) {
  const store = writable<SessionStoreState>(createInitialSessionState(service));
  let subscriptions: (() => void) | null = null;
  let initializePromise: Promise<void> | null = null;
  const bootstrap = createSessionBootstrapController();
  let availableModesRequestId = 0;
  let connectedAtUnixMsec: number | null = null;

  function resolveConnectionRequestPhase(
    currentPhase: ConnectionRequestPhase | undefined,
    connection: SessionConnection | undefined,
  ): ConnectionRequestPhase {
    const phase = currentPhase ?? "idle";
    const connectionKind = connection?.kind;

    if (phase === "connecting") {
      if (connectionKind === "connected" || connectionKind === "error") {
        return "idle";
      }

      return "connecting";
    }

    if (phase === "cancelling" || phase === "disconnecting") {
      if (connectionKind === "disconnected" || connectionKind === "error") {
        return "idle";
      }

      return phase;
    }

    return connectionKind === "connecting" ? "connecting" : "idle";
  }

  function completeActionError(error: unknown, patch: Partial<SessionStoreState> = {}) {
    store.update((state) => ({
      ...state,
      ...patch,
      lastPhase: "ready",
      lastError: service.formatError(error),
    }));
  }

  function updateConnectionForm(patch: Partial<SessionConnectionFormState>) {
    store.update((state) => {
      const connectionForm = { ...state.connectionForm, ...patch };
      if (patch.mode && patch.mode !== state.connectionForm.mode) {
        const descriptor = state.transportDescriptors.find((item) => item.kind === patch.mode);
        trackAnalytics("transport_selected", {
          transport: patch.mode,
          available: descriptor?.available === true ? 1 : 0,
        });
      }
      service.persistConnectionForm(connectionForm);
      return { ...state, connectionForm };
    });
  }

  function stageBootstrapEvent<T>(
    event: { envelope: SessionEnvelope; value: T },
    assign: (buffer: {
      session?: SessionDomain;
      telemetry?: DomainValue<TelemetryState>;
      playbackCursorUsec?: number | null;
      support?: SupportDomain;
      sensorHealth?: SensorHealthDomain;
      calibration?: CalibrationDomain;
      guided?: GuidedDomain;
      statusText?: StatusTextDomain;
    }, value: T) => void,
  ) {
    const attempt = bootstrap.currentAttempt();
    if (attempt === 0) {
      return false;
    }

    return bootstrap.stageEvent(attempt, event, assign);
  }

  function applySessionEvent(event: { envelope: SessionEnvelope; value: SessionDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.session = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (current, value) => ({
        sessionDomain: value,
        optimisticConnection: null,
        connectionRequestPhase: resolveConnectionRequestPhase(
          current.connectionRequestPhase,
          value.value?.connection,
        ),
        lastPhase: value.value?.connection.kind === "connecting" ? current.lastPhase : "ready",
      })),
    );

    void syncAvailableModes();
  }

  function applyTelemetryEvent(event: { envelope: SessionEnvelope; value: DomainValue<TelemetryState> }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.telemetry = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        telemetryDomain: value,
      })),
    );
  }

  function applyPlaybackEvent(event: { envelope: SessionEnvelope; value: PlaybackStateSnapshot }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.playbackCursorUsec = value.cursor_usec;
    })) {
      return;
    }

    store.update((state) => {
      if (event.envelope.source_kind !== "playback") {
        return state;
      }

      if (state.activeEnvelope?.source_kind === "live") {
        return state;
      }

      if (!isNewerScopedEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
        bootstrap: {
          ...state.bootstrap,
          playbackCursorUsec: event.value.cursor_usec,
        },
      };
    });
  }

  function applySupportEvent(event: { envelope: SessionEnvelope; value: SupportDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.support = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        support: value,
      })),
    );
  }

  function applySensorHealthEvent(event: { envelope: SessionEnvelope; value: SensorHealthDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.sensorHealth = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        sensorHealth: value,
      })),
    );
  }

  function applyCalibrationEvent(event: { envelope: SessionEnvelope; value: CalibrationDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.calibration = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        calibration: value,
      })),
    );
  }

  function applyGuidedEvent(event: { envelope: SessionEnvelope; value: GuidedDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.guided = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        guided: value,
      })),
    );
  }

  function applyStatusTextEvent(event: { envelope: SessionEnvelope; value: StatusTextDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.statusText = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        statusText: value,
      })),
    );
  }

  async function syncAvailableModes() {
    const state = get(store);
    const vehicleState = state.sessionDomain.value?.vehicle_state ?? null;
    const connected = state.sessionDomain.value?.connection.kind === "connected";
    const scopeEnvelope = state.activeEnvelope;
    const requestId = availableModesRequestId + 1;
    availableModesRequestId = requestId;

    if (!connected || !vehicleState) {
      store.update((current) => ({ ...current, availableModes: [] }));
      return;
    }

    try {
      const availableModes = await service.getAvailableModes();

      const current = get(store);
      const sameScope =
        scopeEnvelope !== null
        && current.activeEnvelope !== null
        && isSameEnvelope(current.activeEnvelope, scopeEnvelope);
      const stillConnected = current.sessionDomain.value?.connection.kind === "connected";
      if (availableModesRequestId !== requestId || !sameScope || !stillConnected) {
        return;
      }

      store.update((current) => ({ ...current, availableModes }));
    } catch (error) {
      const current = get(store);
      const sameScope =
        scopeEnvelope !== null
        && current.activeEnvelope !== null
        && isSameEnvelope(current.activeEnvelope, scopeEnvelope);
      if (availableModesRequestId !== requestId || !sameScope) {
        return;
      }

      store.update((current) => ({
        ...current,
        availableModes: [],
        lastError: `Failed to refresh available modes: ${service.formatError(error)}`,
      }));
    }
  }

  async function refreshTransportDescriptors() {
    store.update((state) => ({ ...state, lastPhase: "transport-refresh", lastError: null }));

    try {
      const descriptors = await service.availableTransportDescriptors();
      store.update((state) => {
        const nextMode = descriptors.some((descriptor) => descriptor.kind === state.connectionForm.mode)
          ? state.connectionForm.mode
          : descriptors[0]?.kind ?? state.connectionForm.mode;
        const connectionForm =
          nextMode === state.connectionForm.mode
            ? state.connectionForm
            : { ...state.connectionForm, mode: nextMode };

        if (connectionForm !== state.connectionForm) {
          service.persistConnectionForm(connectionForm);
        }

        return {
          ...state,
          transportDescriptors: descriptors,
          connectionForm,
          lastPhase: "ready",
        };
      });
    } catch (error) {
      completeActionError(error);
    }
  }

  async function bootstrapSource(sourceKind: SourceKind = "live") {
    const attempt = bootstrap.beginAttempt();

    store.update((state) => ({
      ...state,
      lastPhase: "bootstrapping",
      lastError: null,
    }));

    const snapshot = await service.openSessionSnapshot(sourceKind);
    bootstrap.prepareBuffer(attempt, snapshot.envelope);
    const ack = await service.ackSessionSnapshot(snapshot.envelope);

    if (ack.result === "rejected") {
      bootstrap.clearAttempt(attempt);
      throw new Error(ack.failure.reason.message);
    }

    if (!bootstrap.isCurrentAttempt(attempt)) {
      bootstrap.clearAttempt(attempt);
      return null;
    }

    const acceptedEnvelope = ack.envelope ?? snapshot.envelope;
    const buffered = bootstrap.takeBuffer(attempt);
    const current = get(store);
    const snapshotIsStale =
      current.activeEnvelope !== null && !isNewerScopedEnvelope(current.activeEnvelope, acceptedEnvelope);

    store.update((state) =>
      mergeBootstrapSnapshot({
        state,
        snapshot,
        acceptedEnvelope,
        buffered,
        snapshotIsStale,
      }),
    );

    bootstrap.clearAttempt(attempt);
    void syncAvailableModes();
    return snapshot;
  }

  async function initialize(sourceKind: SourceKind = "live") {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      store.update((state) => ({
        ...state,
        lastPhase: "subscribing",
        lastError: null,
      }));

      try {
        subscriptions = await service.subscribeAll({
          onSession: applySessionEvent,
          onTelemetry: applyTelemetryEvent,
          onPlayback: applyPlaybackEvent,
          onSupport: applySupportEvent,
          onSensorHealth: applySensorHealthEvent,
          onCalibration: applyCalibrationEvent,
          onGuided: applyGuidedEvent,
          onStatusText: applyStatusTextEvent,
        });

        await refreshTransportDescriptors();
        await bootstrapSource(sourceKind);
      } catch (error) {
        completeActionError(error);
      } finally {
        store.update((state) => ({
          ...state,
          hydrated: true,
        }));
      }
    })();

    return initializePromise;
  }

  async function connect() {
    store.update((state) => ({
      ...state,
      lastPhase: "connect-requested",
      lastError: null,
      optimisticConnection: { kind: "connecting" },
      connectionRequestPhase: "connecting",
    }));

    const state = get(store);
    const descriptor = state.transportDescriptors.find((item) => item.kind === state.connectionForm.mode);
    if (!descriptor) {
      store.update((current) => ({
        ...current,
        lastPhase: "ready",
        optimisticConnection: null,
        connectionRequestPhase: "idle",
        lastError: `Unsupported transport: ${current.connectionForm.mode}`,
      }));
      return;
    }

    const formValue = toConnectFormValue(state.connectionForm);
    const transport = descriptor.kind;

    const validationErrors = service.validateTransportDescriptor(descriptor, formValue);
    if (validationErrors.length > 0) {
      store.update((current) => ({
        ...current,
        lastPhase: "ready",
        optimisticConnection: null,
        connectionRequestPhase: "idle",
        lastError: validationErrors[0],
      }));
      return;
    }

    trackAnalytics("connection_started", { transport });

    try {
      await bootstrapSource("live");
      if (state.connectionForm.mode === "bluetooth_ble" || state.connectionForm.mode === "bluetooth_spp") {
        await service.btRequestPermissions();
      }
      await service.connectSession(service.buildConnectRequest(descriptor, formValue));
      await bootstrapSource("live");
      store.update((current) => {
        if (current.sessionDomain.value?.connection.kind !== "connected") {
          return current;
        }

        return {
          ...current,
          connectionRequestPhase: "idle",
        };
      });
      connectedAtUnixMsec = Date.now();
      trackAnalytics("connection_succeeded", { transport });
    } catch (error) {
      const reason = service.formatError(error);
      trackAnalytics("connection_failed", { transport, reason });
      completeActionError(reason, { optimisticConnection: null, connectionRequestPhase: "idle" });
    }
  }

  async function cancelConnect() {
    const transport = get(store).connectionForm.mode;
    store.update((state) => ({
      ...state,
      lastPhase: "disconnect-requested",
      lastError: null,
      optimisticConnection: null,
      connectionRequestPhase: "cancelling",
    }));

    try {
      await service.disconnectSession();
      await bootstrapSource("live");
      store.update((state) => ({
        ...state,
        connectionRequestPhase: "idle",
      }));
      trackAnalytics("connection_cancelled", { transport });
    } catch (error) {
      completeActionError(error, { connectionRequestPhase: "idle" });
    }
  }

  async function disconnect() {
    const previous = get(store);
    const transport = previous.connectionForm.mode;
    const connectedSecs = connectedAtUnixMsec === null ? null : (Date.now() - connectedAtUnixMsec) / 1000;
    store.update((state) => ({
      ...state,
      lastPhase: "disconnect-requested",
      lastError: null,
      optimisticConnection: null,
      connectionRequestPhase: "disconnecting",
    }));

    try {
      const current = get(store);
      await service.disconnectSession({ session_id: current.activeEnvelope?.session_id });
      await bootstrapSource("live");
      store.update((state) => ({
        ...state,
        connectionRequestPhase: "idle",
      }));
      trackAnalytics("connection_disconnected", {
        transport,
        was_connected_secs_bucket: durationBucket(connectedSecs),
      });
      connectedAtUnixMsec = null;
    } catch (error) {
      completeActionError(error, { connectionRequestPhase: "idle" });
    }
  }

  async function scanBleDevices(timeoutMs = 5000) {
    store.update((state) => ({
      ...state,
      lastPhase: "bluetooth-scan",
      lastError: null,
      btScanning: true,
    }));

    try {
      await service.btRequestPermissions();
      const current = get(store);
      const descriptor = current.transportDescriptors.find((item) => item.kind === current.connectionForm.mode);
      const profile = descriptor?.kind === "bluetooth_ble" ? descriptor.profile : undefined;
      const btDevices = await service.btScanBle(timeoutMs, profile);
      store.update((state) => {
        const connectionForm =
          btDevices.length > 0 && !state.connectionForm.selectedBtDevice
            ? { ...state.connectionForm, selectedBtDevice: btDevices[0]?.address ?? "" }
            : state.connectionForm;

        if (connectionForm !== state.connectionForm) {
          service.persistConnectionForm(connectionForm);
        }

        return {
          ...state,
          btDevices,
          btScanning: false,
          connectionForm,
          lastPhase: "ready",
        };
      });
    } catch (error) {
      completeActionError(error, { btScanning: false });
    }
  }

  async function refreshBondedDevices() {
    store.update((state) => ({
      ...state,
      lastPhase: "bluetooth-refresh",
      lastError: null,
    }));

    try {
      await service.btRequestPermissions();
      const btDevices = await service.btGetBondedDevices();
      store.update((state) => {
        const connectionForm =
          btDevices.length > 0 && !state.connectionForm.selectedBtDevice
            ? { ...state.connectionForm, selectedBtDevice: btDevices[0]?.address ?? "" }
            : state.connectionForm;

        if (connectionForm !== state.connectionForm) {
          service.persistConnectionForm(connectionForm);
        }

        return {
          ...state,
          btDevices,
          connectionForm,
          lastPhase: "ready",
        };
      });
    } catch (error) {
      completeActionError(error);
    }
  }

  function reset() {
    subscriptions?.();
    subscriptions = null;
    initializePromise = null;
    availableModesRequestId += 1;
    connectedAtUnixMsec = null;
    bootstrap.reset();
    store.set(createInitialSessionState(service));
  }

  return {
    subscribe: store.subscribe,
    initialize,
    bootstrapSource,
    connect,
    cancelConnect,
    disconnect,
    refreshTransportDescriptors,
    scanBleDevices,
    refreshBondedDevices,
    updateConnectionForm,
    reset,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

export type SessionViewStore = ReturnType<typeof createSessionViewStore>;

export const session = createSessionStore();

export const sessionBootstrap = derived(session, ($session) => $session.bootstrap);

export const sessionView = createSessionViewStore(session);

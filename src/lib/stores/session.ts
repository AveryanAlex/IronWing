import { derived, get, writable } from "svelte/store";

import {
  createSessionService,
  type SessionConnectionFormState,
  type SessionService,
} from "../platform/session";
import { isNewerScopedEnvelope, isSameEnvelope } from "../scoped-session-events";
import type { CalibrationDomain } from "../../calibration";
import type { ConfigurationFactsDomain } from "../../configuration-facts";
import type { GuidedDomain } from "../../guided";
import type { SensorHealthDomain } from "../../sensor-health";
import type {
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
      service.persistConnectionForm(connectionForm);
      return { ...state, connectionForm };
    });
  }

  function stageBootstrapEvent<T>(
    event: { envelope: SessionEnvelope; value: T },
    assign: (buffer: {
      session?: SessionDomain;
      telemetry?: DomainValue<TelemetryState>;
      support?: SupportDomain;
      sensorHealth?: SensorHealthDomain;
      configurationFacts?: ConfigurationFactsDomain;
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

  function applyConfigurationFactsEvent(event: { envelope: SessionEnvelope; value: ConfigurationFactsDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.configurationFacts = value;
    })) {
      return;
    }

    store.update((state) =>
      applyScopedDomainEvent(state, event, (_current, value) => ({
        configurationFacts: value,
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
          onSupport: applySupportEvent,
          onSensorHealth: applySensorHealthEvent,
          onConfigurationFacts: applyConfigurationFactsEvent,
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
    }));

    const state = get(store);
    const descriptor = state.transportDescriptors.find((item) => item.kind === state.connectionForm.mode);
    if (!descriptor) {
      store.update((current) => ({
        ...current,
        lastPhase: "ready",
        optimisticConnection: null,
        lastError: `Unsupported transport: ${current.connectionForm.mode}`,
      }));
      return;
    }

    const formValue = toConnectFormValue(state.connectionForm);

    const validationErrors = service.validateTransportDescriptor(descriptor, formValue);
    if (validationErrors.length > 0) {
      store.update((current) => ({
        ...current,
        lastPhase: "ready",
        optimisticConnection: null,
        lastError: validationErrors[0],
      }));
      return;
    }

    try {
      await bootstrapSource("live");
      if (state.connectionForm.mode === "bluetooth_ble" || state.connectionForm.mode === "bluetooth_spp") {
        await service.btRequestPermissions();
      }
      await service.connectSession(service.buildConnectRequest(descriptor, formValue));
    } catch (error) {
      completeActionError(error, { optimisticConnection: null });
    }
  }

  async function cancelConnect() {
    store.update((state) => ({
      ...state,
      lastPhase: "disconnect-requested",
      lastError: null,
      optimisticConnection: null,
    }));

    try {
      await service.disconnectSession();
      await bootstrapSource("live");
    } catch (error) {
      completeActionError(error);
    }
  }

  async function disconnect() {
    store.update((state) => ({
      ...state,
      lastPhase: "disconnect-requested",
      lastError: null,
      optimisticConnection: null,
    }));

    try {
      const current = get(store);
      await service.disconnectSession({ session_id: current.activeEnvelope?.session_id });
      await bootstrapSource("live");
    } catch (error) {
      completeActionError(error);
    }
  }

  async function refreshSerialPorts() {
    store.update((state) => ({
      ...state,
      lastPhase: "serial-refresh",
      lastError: null,
    }));

    try {
      const serialPorts = await service.listSerialPorts();
      store.update((state) => {
        const connectionForm =
          serialPorts.length > 0 && state.connectionForm.serialPort === ""
            ? { ...state.connectionForm, serialPort: serialPorts[0] ?? "" }
            : state.connectionForm;

        if (connectionForm !== state.connectionForm) {
          service.persistConnectionForm(connectionForm);
        }

        return {
          ...state,
          serialPorts,
          connectionForm,
          lastPhase: "ready",
        };
      });
    } catch (error) {
      completeActionError(error);
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
      const btDevices = await service.btScanBle(timeoutMs);
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
    refreshSerialPorts,
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

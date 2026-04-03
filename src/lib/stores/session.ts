import { derived, get, writable } from "svelte/store";

import { missingDomainValue, type DomainValue } from "../domain-status";
import {
  createSessionService,
  createSessionLifecycleView,
  type SessionConnectionFormState,
  type SessionService,
} from "../platform/session";
import { selectVehiclePosition } from "../session-selectors";
import { isNewerScopedEnvelope, isSameEnvelope } from "../scoped-session-events";
import { selectTelemetryView } from "../telemetry-selectors";
import { shouldDropEvent, type SessionDomain, type SessionEnvelope, type SessionState, type SourceKind } from "../../session";
import type { MissionState } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
import type { ConfigurationFactsDomain } from "../../configuration-facts";
import type { GuidedDomain } from "../../guided";
import type { CalibrationDomain } from "../../calibration";
import type { SensorHealthDomain } from "../../sensor-health";
import type { StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";
import type { BluetoothDevice, FlightModeEntry, TelemetryState } from "../../telemetry";
import type { TransportDescriptor } from "../../transport";

export type SessionStorePhase =
  | "idle"
  | "subscribing"
  | "bootstrapping"
  | "ready"
  | "connect-requested"
  | "disconnect-requested"
  | "transport-refresh"
  | "serial-refresh"
  | "bluetooth-scan"
  | "bluetooth-refresh";

export type SessionBootstrapState = {
  missionState: MissionState | null;
  paramStore: ParamStore | null;
  paramProgress: ParamProgress | null;
  playbackCursorUsec: number | null;
};

export type SessionStoreState = {
  hydrated: boolean;
  lastPhase: SessionStorePhase;
  lastError: string | null;
  activeEnvelope: SessionEnvelope | null;
  activeSource: SourceKind | null;
  sessionDomain: SessionDomain;
  telemetryDomain: DomainValue<TelemetryState>;
  support: SupportDomain;
  sensorHealth: SensorHealthDomain;
  configurationFacts: ConfigurationFactsDomain;
  calibration: CalibrationDomain;
  guided: GuidedDomain;
  statusText: StatusTextDomain;
  bootstrap: SessionBootstrapState;
  connectionForm: SessionConnectionFormState;
  transportDescriptors: TransportDescriptor[];
  serialPorts: string[];
  availableModes: FlightModeEntry[];
  btDevices: BluetoothDevice[];
  btScanning: boolean;
  optimisticConnection: SessionState["connection"] | null;
};

type BootstrapBuffer = {
  attempt: number;
  envelope: SessionEnvelope;
  session?: SessionDomain;
  telemetry?: DomainValue<TelemetryState>;
  support?: SupportDomain;
  sensorHealth?: SensorHealthDomain;
  configurationFacts?: ConfigurationFactsDomain;
  calibration?: CalibrationDomain;
  guided?: GuidedDomain;
  statusText?: StatusTextDomain;
};

function createInitialState(service: SessionService): SessionStoreState {
  return {
    hydrated: false,
    lastPhase: "idle",
    lastError: null,
    activeEnvelope: null,
    activeSource: null,
    sessionDomain: missingDomainValue<SessionState>("bootstrap"),
    telemetryDomain: missingDomainValue<TelemetryState>("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: service.loadConnectionForm(),
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
  };
}

export function createSessionStore(service: SessionService = createSessionService()) {
  const store = writable<SessionStoreState>(createInitialState(service));
  let subscriptions: (() => void) | null = null;
  let initializePromise: Promise<void> | null = null;
  let bootstrapAttempt = 0;
  let bootstrapBuffer: BootstrapBuffer | null = null;

  function updateConnectionForm(patch: Partial<SessionConnectionFormState>) {
    store.update((state) => {
      const connectionForm = { ...state.connectionForm, ...patch };
      service.persistConnectionForm(connectionForm);
      return { ...state, connectionForm };
    });
  }

  function stageBootstrapEvent<T>(
    event: { envelope: SessionEnvelope; value: T },
    assign: (buffer: BootstrapBuffer, value: T) => void,
  ) {
    if (!bootstrapBuffer || bootstrapBuffer.attempt !== bootstrapAttempt) {
      return false;
    }

    if (!isSameEnvelope(bootstrapBuffer.envelope, event.envelope)) {
      return false;
    }

    assign(bootstrapBuffer, event.value);
    return true;
  }

  function applySessionEvent(event: { envelope: SessionEnvelope; value: SessionDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.session = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      const nextPhase = event.value.value?.connection.kind === "connecting" ? state.lastPhase : "ready";
      return {
        ...state,
        sessionDomain: event.value,
        optimisticConnection: null,
        lastPhase: nextPhase,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });

    void syncAvailableModes();
  }

  function applyTelemetryEvent(event: { envelope: SessionEnvelope; value: DomainValue<TelemetryState> }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.telemetry = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        telemetryDomain: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applySupportEvent(event: { envelope: SessionEnvelope; value: SupportDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.support = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        support: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applySensorHealthEvent(event: { envelope: SessionEnvelope; value: SensorHealthDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.sensorHealth = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        sensorHealth: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applyConfigurationFactsEvent(event: { envelope: SessionEnvelope; value: ConfigurationFactsDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.configurationFacts = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        configurationFacts: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applyCalibrationEvent(event: { envelope: SessionEnvelope; value: CalibrationDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.calibration = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        calibration: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applyGuidedEvent(event: { envelope: SessionEnvelope; value: GuidedDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.guided = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        guided: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  function applyStatusTextEvent(event: { envelope: SessionEnvelope; value: StatusTextDomain }) {
    if (stageBootstrapEvent(event, (buffer, value) => {
      buffer.statusText = value;
    })) {
      return;
    }

    store.update((state) => {
      if (shouldDropEvent(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return {
        ...state,
        statusText: event.value,
        activeEnvelope: event.envelope,
        activeSource: event.envelope.source_kind,
      };
    });
  }

  async function syncAvailableModes() {
    const state = get(store);
    const vehicleState = state.sessionDomain.value?.vehicle_state ?? null;
    const connected = state.sessionDomain.value?.connection.kind === "connected";

    if (!connected || !vehicleState) {
      store.update((current) => ({ ...current, availableModes: [] }));
      return;
    }

    try {
      const availableModes = await service.getAvailableModes();
      store.update((current) => ({ ...current, availableModes }));
    } catch {
      store.update((current) => ({ ...current, availableModes: [] }));
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
      store.update((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
    }
  }

  async function bootstrapSource(sourceKind: SourceKind = "live") {
    const attempt = bootstrapAttempt + 1;
    bootstrapAttempt = attempt;
    bootstrapBuffer = null;

    store.update((state) => ({
      ...state,
      lastPhase: "bootstrapping",
      lastError: null,
    }));

    const snapshot = await service.openSessionSnapshot(sourceKind);
    bootstrapBuffer = { attempt, envelope: snapshot.envelope };
    const ack = await service.ackSessionSnapshot(snapshot.envelope);

    if (ack.result === "rejected") {
      if (bootstrapBuffer?.attempt === attempt) {
        bootstrapBuffer = null;
      }
      throw new Error(ack.failure.reason.message);
    }

    if (bootstrapAttempt !== attempt) {
      if (bootstrapBuffer?.attempt === attempt) {
        bootstrapBuffer = null;
      }
      return null;
    }

    const acceptedEnvelope = ack.envelope ?? snapshot.envelope;
    const buffered = bootstrapBuffer?.attempt === attempt ? bootstrapBuffer : null;
    const current = get(store);
    const snapshotIsStale =
      current.activeEnvelope !== null && !isNewerScopedEnvelope(current.activeEnvelope, acceptedEnvelope);

    store.update((state) => {
      let nextState: SessionStoreState = {
        ...state,
        activeEnvelope: acceptedEnvelope,
        activeSource: acceptedEnvelope.source_kind,
        lastPhase: "ready",
        lastError: null,
      };

      if (!snapshotIsStale) {
        nextState = {
          ...nextState,
          sessionDomain: snapshot.session,
          telemetryDomain: snapshot.telemetry,
          support: snapshot.support,
          sensorHealth: snapshot.sensor_health,
          configurationFacts: snapshot.configuration_facts,
          calibration: snapshot.calibration,
          guided: snapshot.guided,
          statusText: snapshot.status_text,
          bootstrap: {
            missionState: snapshot.mission_state ?? null,
            paramStore: snapshot.param_store ?? null,
            paramProgress: snapshot.param_progress ?? null,
            playbackCursorUsec: snapshot.playback.cursor_usec,
          },
        };
      }

      if (buffered && isSameEnvelope(buffered.envelope, acceptedEnvelope)) {
        if (buffered.session) {
          nextState = {
            ...nextState,
            sessionDomain: buffered.session,
            optimisticConnection: null,
          };
        }
        if (buffered.telemetry) {
          nextState = {
            ...nextState,
            telemetryDomain: buffered.telemetry,
          };
        }
        if (buffered.support) {
          nextState = {
            ...nextState,
            support: buffered.support,
          };
        }
        if (buffered.sensorHealth) {
          nextState = {
            ...nextState,
            sensorHealth: buffered.sensorHealth,
          };
        }
        if (buffered.configurationFacts) {
          nextState = {
            ...nextState,
            configurationFacts: buffered.configurationFacts,
          };
        }
        if (buffered.calibration) {
          nextState = {
            ...nextState,
            calibration: buffered.calibration,
          };
        }
        if (buffered.guided) {
          nextState = {
            ...nextState,
            guided: buffered.guided,
          };
        }
        if (buffered.statusText) {
          nextState = {
            ...nextState,
            statusText: buffered.statusText,
          };
        }
      }

      return nextState;
    });

    if (bootstrapBuffer?.attempt === attempt) {
      bootstrapBuffer = null;
    }

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
        store.update((state) => ({
          ...state,
          lastError: service.formatError(error),
        }));
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
        optimisticConnection: null,
        lastError: `Unsupported transport: ${current.connectionForm.mode}`,
      }));
      return;
    }

    const formValue = {
      bind_addr: state.connectionForm.udpBind,
      address:
        state.connectionForm.mode === "tcp"
          ? state.connectionForm.tcpAddress
          : state.connectionForm.selectedBtDevice,
      port: state.connectionForm.serialPort,
      baud: state.connectionForm.baud,
    };

    const validationErrors = service.validateTransportDescriptor(descriptor, formValue);
    if (validationErrors.length > 0) {
      store.update((current) => ({
        ...current,
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
      store.update((current) => ({
        ...current,
        optimisticConnection: null,
        lastError: service.formatError(error),
      }));
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
    } catch {
      // Best-effort cleanup during connect cancellation.
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
      store.update((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
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
      store.update((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
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
      store.update((state) => ({
        ...state,
        btScanning: false,
        lastError: service.formatError(error),
      }));
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
      store.update((state) => ({
        ...state,
        lastError: service.formatError(error),
      }));
    }
  }

  function reset() {
    subscriptions?.();
    subscriptions = null;
    initializePromise = null;
    bootstrapAttempt = 0;
    bootstrapBuffer = null;
    store.set(createInitialState(service));
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

export function createSessionViewStore(store: Pick<SessionStore, "subscribe">) {
  return derived(store, ($session) => {
    const lifecycle = createSessionLifecycleView(
      $session.activeEnvelope,
      $session.sessionDomain,
      $session.optimisticConnection,
    );

    return {
      ...lifecycle,
      telemetry: selectTelemetryView($session.telemetryDomain),
      vehicleState: lifecycle.session?.vehicle_state ?? null,
      homePosition: lifecycle.session?.home_position ?? null,
      vehiclePosition: selectVehiclePosition($session.telemetryDomain),
      connected: lifecycle.linkState === "connected",
      isConnecting: lifecycle.linkState === "connecting",
      selectedTransportDescriptor:
        $session.transportDescriptors.find((descriptor) => descriptor.kind === $session.connectionForm.mode) ?? null,
    };
  });
}

export const session = createSessionStore();

export const sessionBootstrap = derived(session, ($session) => $session.bootstrap);

export const sessionView = createSessionViewStore(session);

import {
  ackSessionSnapshot,
  connectSession,
  disconnectSession,
  openSessionSnapshot,
  subscribeSessionState,
  subscribeStatusTextState,
  subscribeSupportState,
  subscribeTelemetryState,
  type AckSessionSnapshotResult,
  type OpenSessionSnapshot,
  type SessionConnection,
  type SessionEnvelope,
  type SessionEvent,
  type SessionState,
  type SourceKind,
} from "../../session";
import {
  btGetBondedDevices,
  btRequestPermissions,
  btScanBle,
  getAvailableModes,
  listSerialPorts,
  type BluetoothDevice,
  type FlightModeEntry,
  type LinkState,
  type TelemetryState,
} from "../../telemetry";
import {
  availableTransportDescriptors,
  buildConnectRequest,
  describeTransportAvailability,
  validateTransportDescriptor,
  type ConnectRequest,
  type DisconnectRequest,
  type TransportDescriptor,
  type TransportType,
} from "../../transport";
import { subscribeGuidedState, type GuidedDomain } from "../../guided";
import { subscribeCalibrationStateEvent, type CalibrationDomain } from "../../calibration";
import {
  subscribeConfigurationFactsEvent,
  type ConfigurationFactsDomain,
} from "../../configuration-facts";
import { subscribeSensorHealthStateEvent, type SensorHealthDomain } from "../../sensor-health";
import type { StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";
import type { SessionDomain } from "../../session";

export const SESSION_CONNECTION_STORAGE_KEY = "mpng_connection";

export type SessionConnectionFormState = {
  mode: TransportType;
  udpBind: string;
  tcpAddress: string;
  serialPort: string;
  baud: number;
  selectedBtDevice: string;
  takeoffAlt: string;
  followVehicle: boolean;
};

export const sessionConnectionDefaults: SessionConnectionFormState = {
  mode: "udp",
  udpBind: "0.0.0.0:14550",
  tcpAddress: defaultTcpAddress(),
  serialPort: "",
  baud: 57600,
  selectedBtDevice: "",
  takeoffAlt: "10",
  followVehicle: true,
};

export type SessionServiceEventHandlers = {
  onSession: (event: SessionEvent<SessionDomain>) => void;
  onTelemetry: (event: SessionEvent<import("../../lib/domain-status").DomainValue<TelemetryState>>) => void;
  onSupport: (event: SessionEvent<SupportDomain>) => void;
  onSensorHealth: (event: SessionEvent<SensorHealthDomain>) => void;
  onConfigurationFacts: (event: SessionEvent<ConfigurationFactsDomain>) => void;
  onCalibration: (event: SessionEvent<CalibrationDomain>) => void;
  onGuided: (event: SessionEvent<GuidedDomain>) => void;
  onStatusText: (event: SessionEvent<StatusTextDomain>) => void;
};

export type SessionService = {
  loadConnectionForm(): SessionConnectionFormState;
  persistConnectionForm(state: SessionConnectionFormState): void;
  openSessionSnapshot(sourceKind: SourceKind): Promise<OpenSessionSnapshot>;
  ackSessionSnapshot(envelope: SessionEnvelope): Promise<AckSessionSnapshotResult>;
  subscribeAll(handlers: SessionServiceEventHandlers): Promise<() => void>;
  availableTransportDescriptors(): Promise<TransportDescriptor[]>;
  describeTransportAvailability(descriptor: TransportDescriptor): string;
  validateTransportDescriptor(
    descriptor: TransportDescriptor,
    value: ConnectionFormValue,
  ): string[];
  buildConnectRequest(descriptor: TransportDescriptor, value: ConnectionFormValue): ConnectRequest;
  connectSession(request: ConnectRequest): Promise<void>;
  disconnectSession(request?: DisconnectRequest): Promise<void>;
  listSerialPorts(): Promise<string[]>;
  btRequestPermissions(): Promise<void>;
  btScanBle(timeoutMs?: number): Promise<BluetoothDevice[]>;
  btGetBondedDevices(): Promise<BluetoothDevice[]>;
  getAvailableModes(): Promise<FlightModeEntry[]>;
  formatError(error: unknown): string;
};

type ConnectionFormValue = {
  bind_addr?: string;
  address?: string;
  port?: string;
  baud?: number | null;
};

export function createSessionService(): SessionService {
  return {
    loadConnectionForm,
    persistConnectionForm,
    openSessionSnapshot,
    ackSessionSnapshot,
    subscribeAll,
    availableTransportDescriptors,
    describeTransportAvailability,
    validateTransportDescriptor,
    buildConnectRequest,
    connectSession,
    disconnectSession,
    listSerialPorts,
    btRequestPermissions,
    btScanBle,
    btGetBondedDevices,
    getAvailableModes,
    formatError: asErrorMessage,
  };
}

export async function subscribeAll(handlers: SessionServiceEventHandlers): Promise<() => void> {
  const disposers = await Promise.all([
    subscribeSessionState(handlers.onSession),
    subscribeTelemetryState(handlers.onTelemetry),
    subscribeSupportState(handlers.onSupport),
    subscribeSensorHealthStateEvent(handlers.onSensorHealth),
    subscribeConfigurationFactsEvent(handlers.onConfigurationFacts),
    subscribeCalibrationStateEvent(handlers.onCalibration),
    subscribeGuidedState(handlers.onGuided),
    subscribeStatusTextState(handlers.onStatusText),
  ]);

  return () => {
    for (const disposer of disposers) {
      disposer();
    }
  };
}

export function loadConnectionForm(
  storage: Pick<Storage, "getItem"> | null = getBrowserStorage(),
): SessionConnectionFormState {
  try {
    const raw = storage?.getItem(SESSION_CONNECTION_STORAGE_KEY);
    return raw ? { ...sessionConnectionDefaults, ...JSON.parse(raw) } : { ...sessionConnectionDefaults };
  } catch {
    return { ...sessionConnectionDefaults };
  }
}

export function persistConnectionForm(
  state: SessionConnectionFormState,
  storage: Pick<Storage, "setItem"> | null = getBrowserStorage(),
) {
  try {
    storage?.setItem(SESSION_CONNECTION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore partial localStorage shims in tests and restricted browser contexts.
  }
}

export function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export function toLinkState(connection: SessionConnection | undefined): LinkState | null {
  if (!connection) return null;

  switch (connection.kind) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "error":
      return { error: connection.error };
  }
}

function defaultTcpAddress() {
  const port = Number.parseInt(import.meta.env.VITE_IRONWING_SITL_TCP_PORT ?? "", 10);
  if (Number.isFinite(port) && port > 0) {
    return `127.0.0.1:${port}`;
  }

  return "127.0.0.1:5760";
}

function getBrowserStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage;
}

export type SessionSnapshotState = Pick<
  OpenSessionSnapshot,
  | "session"
  | "telemetry"
  | "mission_state"
  | "param_store"
  | "param_progress"
  | "support"
  | "sensor_health"
  | "configuration_facts"
  | "calibration"
  | "guided"
  | "status_text"
  | "playback"
>;

export type SessionLifecycleView = {
  activeSource: SourceKind | null;
  activeEnvelope: SessionEnvelope | null;
  linkState: LinkState | null;
  session: SessionState | null;
};

export function createSessionLifecycleView(
  envelope: SessionEnvelope | null,
  sessionDomain: SessionDomain,
  optimisticConnection: SessionConnection | null,
): SessionLifecycleView {
  const session = sessionDomain.value;

  return {
    activeSource: envelope?.source_kind ?? null,
    activeEnvelope: envelope,
    linkState: toLinkState(optimisticConnection ?? session?.connection),
    session,
  };
}

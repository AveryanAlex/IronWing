import { missingDomainValue, type DomainValue } from "../domain-status";
import type { SessionConnectionFormState, SessionService } from "../platform/session";
import type { CalibrationDomain } from "../../calibration";
import type { ConfigurationFactsDomain } from "../../configuration-facts";
import type { GuidedDomain } from "../../guided";
import type { MissionState } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
import type { SensorHealthDomain } from "../../sensor-health";
import type { SessionDomain, SessionEnvelope, SessionState, SourceKind } from "../../session";
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

export function createInitialSessionState(service: SessionService): SessionStoreState {
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

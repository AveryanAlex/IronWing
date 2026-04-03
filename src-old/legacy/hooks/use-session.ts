import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  btGetBondedDevices,
  btRequestPermissions,
  btScanBle,
  getAvailableModes,
  listSerialPorts,
  type BluetoothDevice,
  type FlightModeEntry,
  type Telemetry,
  type VehicleState,
} from "../telemetry";
import {
  ackSessionSnapshot,
  connectSession,
  disconnectSession,
  openSessionSnapshot,
  shouldDropEvent,
  subscribeSessionState,
  subscribeStatusTextState,
  subscribeSupportState,
  subscribeTelemetryState,
  type SessionEnvelope,
  type SessionDomain,
  type SessionState,
} from "../session";
import type { MissionState } from "../mission";
import type { ParamProgress, ParamStore } from "../params";
import {
  availableTransportDescriptors,
  buildConnectRequest,
  describeTransportAvailability,
  validateTransportDescriptor,
  type ConnectFormValue,
  type TransportDescriptor,
  type TransportType,
} from "../transport";
import { missingDomainValue } from "../lib/domain-status";
import { isNewerScopedEnvelope, isSameEnvelope } from "../lib/scoped-session-events";
import { selectVehiclePosition } from "../lib/session-selectors";
import { selectTelemetryView } from "../lib/telemetry-selectors";
import {
  subscribeGuidedState,
  type GuidedDomain,
} from "../guided";
import {
  asErrorMessage,
  loadConnectionForm,
  persistConnectionForm,
  toLinkState,
} from "./use-session-helpers";
import { useSessionActions } from "./use-session-actions";
import type { CalibrationDomain } from "../calibration";
import { subscribeCalibrationStateEvent } from "../calibration";
import type { HomePosition } from "../mission";
import type { ConfigurationFactsDomain } from "../configuration-facts";
import { subscribeConfigurationFactsEvent } from "../configuration-facts";
import type { SensorHealthDomain } from "../sensor-health";
import { subscribeSensorHealthStateEvent } from "../sensor-health";
import type { SupportDomain } from "../support";
import type { StatusTextDomain } from "../statustext";

export function useSession() {
  const [hydrated, setHydrated] = useState(false);
  const [activeEnvelope, setActiveEnvelope] = useState<SessionEnvelope | null>(null);
  const [sessionDomain, setSessionDomain] = useState<SessionDomain>(missingDomainValue<SessionState>("bootstrap"));
  const [telemetryDomain, setTelemetryDomain] = useState(missingDomainValue<import("../telemetry").TelemetryState>("bootstrap"));
  const [bootstrapMissionState, setBootstrapMissionState] = useState<MissionState | null>(null);
  const [bootstrapParamStore, setBootstrapParamStore] = useState<ParamStore | null>(null);
  const [bootstrapParamProgress, setBootstrapParamProgress] = useState<ParamProgress | null>(null);
  const [support, setSupport] = useState<SupportDomain>(missingDomainValue("bootstrap"));
  const [sensorHealth, setSensorHealth] = useState<SensorHealthDomain>(missingDomainValue("bootstrap"));
  const [configurationFacts, setConfigurationFacts] = useState<ConfigurationFactsDomain>(missingDomainValue("bootstrap"));
  const [calibration, setCalibration] = useState<CalibrationDomain>(missingDomainValue("bootstrap"));
  const [guided, setGuided] = useState<GuidedDomain>(missingDomainValue("bootstrap"));
  const [statusText, setStatusText] = useState<StatusTextDomain>(missingDomainValue("bootstrap"));
  const [availableModes, setAvailableModes] = useState<FlightModeEntry[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [saved] = useState(loadConnectionForm);
  const [mode, setMode] = useState<TransportType>(saved.mode);
  const [transportDescriptors, setTransportDescriptors] = useState<TransportDescriptor[]>([]);
  const [udpBind, setUdpBind] = useState(saved.udpBind);
  const [tcpAddress, setTcpAddress] = useState(saved.tcpAddress);
  const [serialPort, setSerialPort] = useState(saved.serialPort);
  const [baud, setBaud] = useState(saved.baud);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [takeoffAlt, setTakeoffAlt] = useState(saved.takeoffAlt);
  const [followVehicle, setFollowVehicle] = useState(saved.followVehicle);
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [btScanning, setBtScanning] = useState(false);
  const [selectedBtDevice, setSelectedBtDevice] = useState(saved.selectedBtDevice);
  const connectAttemptRef = useRef(0);
  const bootstrapAttemptRef = useRef(0);
  const [optimisticConnection, setOptimisticConnection] = useState<SessionState["connection"] | null>(null);
  const activeEnvelopeRef = useRef<SessionEnvelope | null>(null);
  const bootstrapRef = useRef<{
    attempt: number;
    envelope: SessionEnvelope;
    session?: SessionDomain;
    telemetry?: typeof telemetryDomain;
    support?: SupportDomain;
    sensorHealth?: SensorHealthDomain;
    configurationFacts?: ConfigurationFactsDomain;
     calibration?: CalibrationDomain;
      guided?: GuidedDomain;
      statusText?: StatusTextDomain;
    } | null>(null);

  const session = sessionDomain.value;
  const vehicleState: VehicleState | null = session?.vehicle_state ?? null;
  const homePosition: HomePosition | null = session?.home_position ?? null;
  const telemetry: Telemetry = useMemo(() => selectTelemetryView(telemetryDomain), [telemetryDomain]);
  const vehiclePosition = useMemo(() => selectVehiclePosition(telemetryDomain), [telemetryDomain]);
  const linkState = toLinkState(optimisticConnection ?? session?.connection);
  const connected = linkState === "connected";
  const isConnecting = linkState === "connecting";

  useEffect(() => {
    persistConnectionForm({
      mode, udpBind, tcpAddress, serialPort, baud, selectedBtDevice, takeoffAlt, followVehicle,
    });
  }, [mode, udpBind, tcpAddress, serialPort, baud, selectedBtDevice, takeoffAlt, followVehicle]);

  useEffect(() => {
    availableTransportDescriptors()
      .then((descriptors) => {
        setTransportDescriptors(descriptors);
        if (descriptors.length > 0 && !descriptors.some((descriptor) => descriptor.kind === mode)) {
          setMode(descriptors[0].kind);
        }
      })
      .catch((error) => {
        console.warn("Failed to load transport descriptors", error);
      });
  }, []);

  const setCurrentEnvelope = useCallback((envelope: SessionEnvelope | null) => {
    activeEnvelopeRef.current = envelope;
    setActiveEnvelope(envelope);
  }, []);

  const stageBootstrapEvent = useCallback(
    <T,>(event: { envelope: SessionEnvelope; value: T }, assign: (value: T) => void) => {
      const bootstrap = bootstrapRef.current;
      if (!bootstrap || bootstrap.attempt !== bootstrapAttemptRef.current) {
        return false;
      }
      if (!isSameEnvelope(bootstrap.envelope, event.envelope)) {
        return false;
      }
      assign(event.value);
      return true;
    },
    [],
  );

  const applySessionEvent = useCallback((event: { envelope: SessionEnvelope; value: SessionDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.session = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setOptimisticConnection(null);
    setSessionDomain(event.value);
  }, [stageBootstrapEvent]);

  const applyTelemetryEvent = useCallback((event: { envelope: SessionEnvelope; value: typeof telemetryDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.telemetry = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setTelemetryDomain(event.value);
  }, [stageBootstrapEvent]);

  const applySupportEvent = useCallback((event: { envelope: SessionEnvelope; value: SupportDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.support = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setSupport(event.value);
  }, [stageBootstrapEvent]);

  const applyStatusTextEvent = useCallback((event: { envelope: SessionEnvelope; value: StatusTextDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.statusText = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setStatusText(event.value);
  }, [stageBootstrapEvent]);

  const applySensorHealthEvent = useCallback((event: { envelope: SessionEnvelope; value: SensorHealthDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.sensorHealth = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setSensorHealth(event.value);
  }, [stageBootstrapEvent]);

  const applyConfigurationFactsEvent = useCallback((event: { envelope: SessionEnvelope; value: ConfigurationFactsDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.configurationFacts = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setConfigurationFacts(event.value);
  }, [stageBootstrapEvent]);

  const applyCalibrationEvent = useCallback((event: { envelope: SessionEnvelope; value: CalibrationDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.calibration = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setCalibration(event.value);
  }, [stageBootstrapEvent]);

  const applyGuidedEvent = useCallback((event: { envelope: SessionEnvelope; value: GuidedDomain }) => {
    if (stageBootstrapEvent(event, (value) => {
      if (bootstrapRef.current) bootstrapRef.current.guided = value;
    })) return;
    if (shouldDropEvent(activeEnvelopeRef.current, event.envelope)) return;
    setGuided(event.value);
  }, [stageBootstrapEvent]);

  useEffect(() => {
    let cancelled = false;
    const disposers: Array<() => void> = [];

    const registerDisposer = (disposer: () => void) => {
      if (cancelled) {
        disposer();
        return;
      }
      disposers.push(disposer);
    };

    (async () => {
      try {
        const subscriptionPromises = [
          subscribeSessionState((event) => {
            applySessionEvent(event);
          }),
          subscribeTelemetryState((event) => {
            applyTelemetryEvent(event);
          }),
          subscribeSupportState((event) => {
            applySupportEvent(event);
          }),
          subscribeSensorHealthStateEvent((event) => {
            applySensorHealthEvent(event);
          }),
          subscribeConfigurationFactsEvent((event) => {
            applyConfigurationFactsEvent(event);
          }),
          subscribeCalibrationStateEvent((event) => {
            applyCalibrationEvent(event);
          }),
          subscribeGuidedState((event) => {
            applyGuidedEvent(event);
          }),
          subscribeStatusTextState((event) => {
            applyStatusTextEvent(event);
          }),
        ];
        for (const subscription of await Promise.all(subscriptionPromises)) {
          registerDisposer(subscription);
        }

        const snapshot = await bootstrapLiveSession();
        if (cancelled || !snapshot) return;
      } catch (error) {
        if (!cancelled) {
          setConnectionError(asErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const disposer of disposers) {
        disposer();
      }
    };
  }, []);

  async function bootstrapLiveSession() {
    const bootstrapAttempt = bootstrapAttemptRef.current + 1;
    bootstrapAttemptRef.current = bootstrapAttempt;

    const snapshot = await openSessionSnapshot("live");
    bootstrapRef.current = { attempt: bootstrapAttempt, envelope: snapshot.envelope };
    const ack = await ackSessionSnapshot(snapshot.envelope);
    if (ack.result === "rejected") {
      if (bootstrapRef.current?.attempt === bootstrapAttempt) {
        bootstrapRef.current = null;
      }
      throw new Error(ack.failure.reason.message);
    }

    if (bootstrapAttemptRef.current !== bootstrapAttempt) {
      if (bootstrapRef.current?.attempt === bootstrapAttempt) {
        bootstrapRef.current = null;
      }
      return null;
    }

    const acceptedEnvelope = ack.envelope ?? snapshot.envelope;
    const bootstrap = bootstrapRef.current?.attempt === bootstrapAttempt ? bootstrapRef.current : null;
    const latestEnvelope = activeEnvelopeRef.current;
    const snapshotIsStale = latestEnvelope !== null && !isNewerScopedEnvelope(latestEnvelope, acceptedEnvelope);

    setCurrentEnvelope(acceptedEnvelope);

    if (!snapshotIsStale) {
      setSessionDomain(snapshot.session);
      setTelemetryDomain(snapshot.telemetry);
      setBootstrapMissionState(snapshot.mission_state ?? null);
      setBootstrapParamStore(snapshot.param_store ?? null);
      setBootstrapParamProgress(snapshot.param_progress ?? null);
      setSupport(snapshot.support);
      setSensorHealth(snapshot.sensor_health);
      setConfigurationFacts(snapshot.configuration_facts);
      setCalibration(snapshot.calibration);
      setGuided(snapshot.guided);
      setStatusText(snapshot.status_text);
    }

    if (bootstrap && isSameEnvelope(bootstrap.envelope, acceptedEnvelope)) {
      if (bootstrap.session) {
        setOptimisticConnection(null);
        setSessionDomain(bootstrap.session);
      }
      if (bootstrap.telemetry) setTelemetryDomain(bootstrap.telemetry);
      if (bootstrap.support) setSupport(bootstrap.support);
      if (bootstrap.sensorHealth) setSensorHealth(bootstrap.sensorHealth);
      if (bootstrap.configurationFacts) setConfigurationFacts(bootstrap.configurationFacts);
      if (bootstrap.calibration) setCalibration(bootstrap.calibration);
      if (bootstrap.guided) setGuided(bootstrap.guided);
      if (bootstrap.statusText) setStatusText(bootstrap.statusText);
    }

    if (bootstrapRef.current?.attempt === bootstrapAttempt) {
      bootstrapRef.current = null;
    }

    return snapshot;
  }

  useEffect(() => {
    if (connected && vehicleState) {
      getAvailableModes()
        .then(setAvailableModes)
        .catch((error) => {
          console.warn("Failed to load available modes", error);
        });
    } else {
      setAvailableModes([]);
    }
  }, [connected, vehicleState?.autopilot, vehicleState?.vehicle_type]);

  const connect = useCallback(async () => {
    const attemptId = connectAttemptRef.current + 1;
    connectAttemptRef.current = attemptId;
    setConnectionError(null);
    setOptimisticConnection({ kind: "connecting" });

    const descriptor = transportDescriptors.find((item) => item.kind === mode);
    if (!descriptor) {
      setOptimisticConnection(null);
      setConnectionError(`Unsupported transport: ${mode}`);
      return;
    }

    const formValue: ConnectFormValue = {
      bind_addr: udpBind,
      address: mode === "tcp" ? tcpAddress : selectedBtDevice,
      port: serialPort,
      baud,
    };
    const errors = validateTransportDescriptor(descriptor, formValue);
    if (errors.length > 0) {
      setOptimisticConnection(null);
      setConnectionError(errors[0]);
      return;
    }

    try {
      const snapshot = await bootstrapLiveSession();
      if (!snapshot) return;
      if (mode === "bluetooth_ble" || mode === "bluetooth_spp") {
        await btRequestPermissions();
      }
      await connectSession(buildConnectRequest(descriptor, formValue));
    } catch (err) {
      if (connectAttemptRef.current === attemptId) {
        setOptimisticConnection(null);
        const msg = asErrorMessage(err);
        setConnectionError(msg);
        toast.error("Connection failed", { description: msg });
      }
    }
  }, [mode, transportDescriptors, udpBind, tcpAddress, selectedBtDevice, serialPort, baud]);

  const cancelConnect = useCallback(async () => {
    connectAttemptRef.current += 1;
    setOptimisticConnection(null);
    setConnectionError(null);
    try {
      await disconnectSession();
      await bootstrapLiveSession();
    } catch {
      // Best-effort cleanup during connect cancellation.
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      setOptimisticConnection(null);
      await disconnectSession({ session_id: activeEnvelope?.session_id });
      await bootstrapLiveSession();
    } catch (err) {
      toast.error("Disconnect failed", { description: asErrorMessage(err) });
    }
  }, [activeEnvelope?.session_id]);

  const refreshSerialPorts = useCallback(async () => {
    try {
      const ports = await listSerialPorts();
      setSerialPorts(ports);
      if (ports.length > 0 && serialPort === "") setSerialPort(ports[0]);
    } catch (err) {
      toast.error("Failed to list serial ports", { description: asErrorMessage(err) });
    }
  }, [serialPort]);

  const scanBleDevices = useCallback(async () => {
    setBtScanning(true);
    try {
      await btRequestPermissions();
      const devices = await btScanBle(5000);
      setBtDevices(devices);
      if (devices.length > 0 && !selectedBtDevice) setSelectedBtDevice(devices[0].address);
    } catch (err) {
      toast.error("BLE scan failed", { description: asErrorMessage(err) });
    } finally {
      setBtScanning(false);
    }
  }, [selectedBtDevice]);

  const refreshBondedDevices = useCallback(async () => {
    try {
      await btRequestPermissions();
      const devices = await btGetBondedDevices();
      setBtDevices(devices);
      if (devices.length > 0 && !selectedBtDevice) setSelectedBtDevice(devices[0].address);
    } catch (err) {
      toast.error("Failed to list bonded devices", { description: asErrorMessage(err) });
    }
  }, [selectedBtDevice]);

  const {
    arm,
    disarm,
    setModeCmd,
    findModeNumber,
  } = useSessionActions({
    connected,
    availableModes,
  });

  return {
    hydrated,
    sessionDomain,
    telemetryDomain,
    support,
    sensorHealth,
    configurationFacts,
    calibration,
    guided,
    statusText,
    activeEnvelope,
    telemetry,
    bootstrapMissionState,
    bootstrapParamStore,
    bootstrapParamProgress,
    linkState,
    vehicleState,
    homePosition,
    vehiclePosition,
    availableModes,
    connected,
    connectionError,
    isConnecting,
    cancelConnect,
    connectionMode: mode,
    setConnectionMode: setMode,
    transportDescriptors,
    selectedTransportDescriptor: transportDescriptors.find((descriptor) => descriptor.kind === mode) ?? null,
    describeTransportAvailability,
    udpBind,
    setUdpBind,
    tcpAddress,
    setTcpAddress,
    serialPort,
    setSerialPort,
    baud,
    setBaud,
    serialPorts,
    takeoffAlt,
    setTakeoffAlt,
    followVehicle,
    setFollowVehicle,
    btDevices,
    btScanning,
    selectedBtDevice,
    setSelectedBtDevice,
    scanBleDevices,
    refreshBondedDevices,
    connect,
    disconnect,
    refreshSerialPorts,
    arm,
    disarm,
    setFlightMode: setModeCmd,
    findModeNumber,
  };
}

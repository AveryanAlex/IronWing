import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  armVehicle,
  availableTransports,
  btGetBondedDevices,
  btRequestPermissions,
  btScanBle,
  connectLink,
  disarmVehicle,
  disconnectLink,
  getAvailableModes,
  listSerialPorts,
  setFlightMode,
  subscribeLinkState,
  subscribeHomePosition,
  subscribeTelemetry,
  subscribeVehicleState,
  vehicleGuidedGoto,
  vehicleTakeoff,
  type BluetoothDevice,
  type ConnectRequest,
  type FlightModeEntry,
  type LinkState,
  type Telemetry,
  type TransportType,
  type VehicleState,
} from "../telemetry";
import type { HomePosition } from "../mission";
import { toast } from "sonner";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export function useVehicle() {
  const [telemetry, setTelemetry] = useState<Telemetry>({});
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [homePosition, setHomePosition] = useState<HomePosition | null>(null);
  const [availableModes, setAvailableModes] = useState<FlightModeEntry[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Connection form state
  const [mode, setMode] = useState<TransportType>("udp");
  const [transports, setTransports] = useState<TransportType[]>(["udp"]);
  const [udpBind, setUdpBind] = useState("0.0.0.0:14550");
  const [serialPort, setSerialPort] = useState("");
  const [baud, setBaud] = useState(57600);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [takeoffAlt, setTakeoffAlt] = useState("10");
  const [followVehicle, setFollowVehicle] = useState(true);

  // Bluetooth state
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [btScanning, setBtScanning] = useState(false);
  const [selectedBtDevice, setSelectedBtDevice] = useState("");

  const connected = linkState === "connected";

  const vehiclePosition = useMemo(() => {
    if (
      telemetry.latitude_deg != null &&
      telemetry.longitude_deg != null &&
      isFinite(telemetry.latitude_deg) &&
      isFinite(telemetry.longitude_deg)
    ) {
      return {
        latitude_deg: telemetry.latitude_deg,
        longitude_deg: telemetry.longitude_deg,
        heading_deg: telemetry.heading_deg ?? 0,
      };
    }
    return null;
  }, [telemetry.latitude_deg, telemetry.longitude_deg, telemetry.heading_deg]);

  // Fetch available transports on mount
  useEffect(() => {
    availableTransports()
      .then((t) => {
        setTransports(t);
        if (t.length > 0 && !t.includes(mode)) {
          setMode(t[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-load devices when a Bluetooth transport is selected
  const autoLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode === "bluetooth_spp" && autoLoadedRef.current !== "bluetooth_spp") {
      autoLoadedRef.current = "bluetooth_spp";
      btRequestPermissions()
        .then(() => btGetBondedDevices())
        .then((devices) => {
          setBtDevices(devices);
          if (devices.length > 0 && !selectedBtDevice) {
            setSelectedBtDevice(devices[0].address);
          }
        })
        .catch(() => {});
    } else if (mode !== "bluetooth_spp" && mode !== "bluetooth_ble") {
      autoLoadedRef.current = null;
    }
  }, [mode]);

  // Throttle telemetry setState to animation frame rate
  const pendingTelemetry = useRef<Telemetry | null>(null);
  const rafId = useRef<number>(0);

  const onTelemetryEvent = useCallback((t: Telemetry) => {
    pendingTelemetry.current = t;
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        if (pendingTelemetry.current) {
          setTelemetry(pendingTelemetry.current);
          pendingTelemetry.current = null;
        }
      });
    }
  }, []);

  // Subscribe to telemetry events
  useEffect(() => {
    let stopTelemetry: (() => void) | null = null;
    let stopLinkState: (() => void) | null = null;
    let stopHome: (() => void) | null = null;
    let stopVehicleState: (() => void) | null = null;

    (async () => {
      stopTelemetry = await subscribeTelemetry(onTelemetryEvent);
      stopLinkState = await subscribeLinkState(setLinkState);
      stopHome = await subscribeHomePosition(setHomePosition);
      stopVehicleState = await subscribeVehicleState(setVehicleState);
    })();

    return () => {
      stopTelemetry?.();
      stopLinkState?.();
      stopHome?.();
      stopVehicleState?.();
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [onTelemetryEvent]);

  // Fetch available modes when connected
  useEffect(() => {
    if (connected && vehicleState) {
      getAvailableModes().then(setAvailableModes).catch(() => {});
    } else {
      setAvailableModes([]);
    }
  }, [connected, vehicleState?.autopilot, vehicleState?.vehicle_type]);

  const cancelledRef = useRef(false);

  const connect = useCallback(async () => {
    cancelledRef.current = false;
    setConnectionError(null);
    setIsConnecting(true);
    let request: ConnectRequest;
    switch (mode) {
      case "udp":
        request = { endpoint: { kind: "udp", bind_addr: udpBind } };
        break;
      case "serial":
        request = { endpoint: { kind: "serial", port: serialPort, baud } };
        break;
      case "bluetooth_ble":
        request = { endpoint: { kind: "bluetooth_ble", address: selectedBtDevice } };
        break;
      case "bluetooth_spp":
        request = { endpoint: { kind: "bluetooth_spp", address: selectedBtDevice } };
        break;
    }
    try {
      if (mode === "bluetooth_ble" || mode === "bluetooth_spp") {
        if (!selectedBtDevice) {
          throw new Error("No Bluetooth device selected");
        }
        await btRequestPermissions();
      }
      await connectLink(request);
    } catch (err) {
      if (!cancelledRef.current) {
        const msg = asErrorMessage(err);
        setConnectionError(msg);
        toast.error("Connection failed", { description: msg });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [mode, udpBind, serialPort, baud, selectedBtDevice]);

  const cancelConnect = useCallback(async () => {
    cancelledRef.current = true;
    setIsConnecting(false);
    setConnectionError(null);
    try {
      await disconnectLink();
    } catch {
      // best-effort cleanup
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectLink();
    } catch (err) {
      toast.error("Disconnect failed", { description: asErrorMessage(err) });
    }
  }, []);

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
      setBtDevices((prev) => {
        // Merge with existing, dedup by address
        const map = new Map(prev.map((d) => [d.address, d]));
        for (const d of devices) map.set(d.address, d);
        return [...map.values()];
      });
      if (devices.length > 0 && !selectedBtDevice) {
        setSelectedBtDevice(devices[0].address);
      }
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
      if (devices.length > 0 && !selectedBtDevice) {
        setSelectedBtDevice(devices[0].address);
      }
    } catch (err) {
      toast.error("Failed to list bonded devices", { description: asErrorMessage(err) });
    }
  }, [selectedBtDevice]);

  const arm = useCallback(
    async (force = false) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await armVehicle(force);
        toast.success("Vehicle armed");
      } catch (err) {
        toast.error("Failed to arm", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const disarm = useCallback(
    async (force = false) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await disarmVehicle(force);
        toast.success("Vehicle disarmed");
      } catch (err) {
        toast.error("Failed to disarm", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const setModeCmd = useCallback(
    async (customMode: number) => {
      if (!connected) { toast.error("Connect first"); return; }
      try {
        await setFlightMode(customMode);
      } catch (err) {
        toast.error("Failed to set mode", { description: asErrorMessage(err) });
      }
    },
    [connected]
  );

  const takeoff = useCallback(async () => {
    if (!connected) { toast.error("Connect first"); return; }
    const alt = Number(takeoffAlt);
    if (!Number.isFinite(alt) || alt <= 0) { toast.error("Invalid takeoff altitude"); return; }
    try {
      await vehicleTakeoff(alt);
      toast.success(`Takeoff to ${alt}m`);
    } catch (err) {
      toast.error("Takeoff failed", { description: asErrorMessage(err) });
    }
  }, [connected, takeoffAlt]);

  const guidedGoto = useCallback(
    async (latDeg: number, lonDeg: number) => {
      if (!connected) { toast.error("Connect first"); return; }
      const alt = telemetry.altitude_m ?? 25;
      try {
        await vehicleGuidedGoto(latDeg, lonDeg, alt);
        toast.success("Flying to location");
      } catch (err) {
        toast.error("Guided goto failed", { description: asErrorMessage(err) });
      }
    },
    [connected, telemetry.altitude_m]
  );

  const findModeNumber = useCallback(
    (name: string): number | null => {
      const entry = availableModes.find((m) => m.name.toUpperCase() === name.toUpperCase());
      return entry?.custom_mode ?? null;
    },
    [availableModes]
  );

  return {
    telemetry,
    linkState,
    vehicleState,
    homePosition,
    vehiclePosition,
    availableModes,
    connected,
    connectionError,
    isConnecting,
    cancelConnect,
    // Connection form
    connectionMode: mode, setConnectionMode: setMode,
    transports,
    udpBind, setUdpBind,
    serialPort, setSerialPort,
    baud, setBaud,
    serialPorts,
    takeoffAlt, setTakeoffAlt,
    followVehicle, setFollowVehicle,
    // Bluetooth
    btDevices, btScanning,
    selectedBtDevice, setSelectedBtDevice,
    scanBleDevices,
    refreshBondedDevices,
    // Actions
    connect,
    disconnect,
    refreshSerialPorts,
    arm,
    disarm,
    setFlightMode: setModeCmd,
    takeoff,
    guidedGoto,
    findModeNumber,
  };
}

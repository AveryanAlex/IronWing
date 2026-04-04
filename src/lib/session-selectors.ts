import type { SourceKind } from "../session";
import type { SessionConnectionFormState } from "./platform/session";
import type { TelemetryState } from "../telemetry";
import type { VehicleState } from "../telemetry";
import type { DomainValue } from "./domain-status";

export type ViewTone = "neutral" | "positive" | "caution" | "critical";

export type VehicleStatusCardView = {
  sessionLabel: string;
  sessionTone: ViewTone;
  armStateText: string;
  armStateTone: ViewTone;
  modeText: string;
  systemText: string;
  dataFeedText: string;
};

export type ConnectionPanelPresentation = {
  formLocked: boolean;
  connectDisabled: boolean;
  statusLabel: string;
  statusTone: ViewTone;
};

export function selectVehicleStatusCardView(input: {
  connected: boolean;
  vehicleState: VehicleState | null;
  activeSource: SourceKind | null;
}): VehicleStatusCardView {
  const { connected, vehicleState, activeSource } = input;

  return {
    sessionLabel: connected ? "live session" : "idle session",
    sessionTone: connected ? "positive" : "neutral",
    armStateText: connected ? (vehicleState?.armed ? "ARMED" : "DISARMED") : "--",
    armStateTone: connected && vehicleState?.armed ? "positive" : "neutral",
    modeText: connected ? (vehicleState?.mode_name ?? "--") : "--",
    systemText: connected ? (vehicleState?.system_status ?? "--") : "--",
    dataFeedText: !connected ? "--" : activeSource === "playback" ? "Replay" : "Vehicle",
  };
}

export function selectConnectionPanelPresentation(input: {
  hydrated: boolean;
  isConnecting: boolean;
  connected: boolean;
  selectedTransportAvailable: boolean;
  connectionMode: SessionConnectionFormState["mode"];
  selectedBtDevice: string;
  visibleError: string | null;
}): ConnectionPanelPresentation {
  const formLocked = input.isConnecting || input.connected;
  const requiresBtDevice = input.connectionMode === "bluetooth_ble" || input.connectionMode === "bluetooth_spp";
  const missingBtDevice = requiresBtDevice && !input.selectedBtDevice.trim();
  const connectDisabled = !input.hydrated || formLocked || !input.selectedTransportAvailable || missingBtDevice;
  const statusLabel = input.isConnecting
    ? "Connecting"
    : input.connected
      ? "Connected"
      : input.visibleError
        ? "Error"
        : "Idle";

  const statusTone: ViewTone = input.isConnecting
    ? "caution"
    : input.connected
      ? "positive"
      : input.visibleError
        ? "critical"
        : "neutral";

  return {
    formLocked,
    connectDisabled,
    statusLabel,
    statusTone,
  };
}

export function selectVehiclePosition(domain: DomainValue<TelemetryState> | null | undefined) {
  const navigation = domain?.value?.navigation;

  if (
    navigation?.latitude_deg == null ||
    navigation.longitude_deg == null ||
    !Number.isFinite(navigation.latitude_deg) ||
    !Number.isFinite(navigation.longitude_deg)
  ) {
    return null;
  }

  return {
    latitude_deg: navigation.latitude_deg,
    longitude_deg: navigation.longitude_deg,
    heading_deg: navigation.heading_deg ?? 0,
  };
}

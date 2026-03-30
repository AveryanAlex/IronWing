import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";

export type LinkState = "connecting" | "connected" | "disconnected" | { error: string };

export type Telemetry = {
  altitude_m?: number;
  speed_mps?: number;
  heading_deg?: number;
  latitude_deg?: number;
  longitude_deg?: number;
  battery_pct?: number;
  gps_fix_type?: string;

  // VFR_HUD
  climb_rate_mps?: number;
  throttle_pct?: number;
  airspeed_mps?: number;

  // SYS_STATUS
  battery_voltage_v?: number;
  battery_current_a?: number;

  // GPS_RAW_INT
  gps_satellites?: number;
  gps_hdop?: number;

  // ATTITUDE
  roll_deg?: number;
  pitch_deg?: number;
  yaw_deg?: number;

  // NAV_CONTROLLER_OUTPUT
  wp_dist_m?: number;
  nav_bearing_deg?: number;
  target_bearing_deg?: number;
  xtrack_error_m?: number;

  // TERRAIN_REPORT
  terrain_height_m?: number;
  height_above_terrain_m?: number;

  // BATTERY_STATUS
  battery_voltage_cells?: number[];
  energy_consumed_wh?: number;
  battery_time_remaining_s?: number;

  // RC_CHANNELS
  rc_channels?: number[];
  rc_rssi?: number;

  // SERVO_OUTPUT_RAW
  servo_outputs?: number[];
};

export type TelemetryState = {
  flight?: {
    altitude_m?: number;
    speed_mps?: number;
    climb_rate_mps?: number;
    throttle_pct?: number;
    airspeed_mps?: number;
  };
  navigation?: {
    latitude_deg?: number;
    longitude_deg?: number;
    heading_deg?: number;
    wp_dist_m?: number;
    nav_bearing_deg?: number;
    target_bearing_deg?: number;
    xtrack_error_m?: number;
  };
  attitude?: {
    roll_deg?: number;
    pitch_deg?: number;
    yaw_deg?: number;
  };
  power?: {
    battery_pct?: number;
    battery_voltage_v?: number;
    battery_current_a?: number;
    battery_voltage_cells?: number[];
    energy_consumed_wh?: number;
    battery_time_remaining_s?: number;
  };
  gps?: {
    fix_type?: string;
    satellites?: number;
    hdop?: number;
  };
  terrain?: {
    terrain_height_m?: number;
    height_above_terrain_m?: number;
  };
  radio?: {
    rc_channels?: number[];
    rc_rssi?: number;
    servo_outputs?: number[];
  };
};

export type TelemetryDomain = DomainValue<TelemetryState>;

export type VehicleState = {
  armed: boolean;
  custom_mode: number;
  mode_name: string;
  system_status: string;
  vehicle_type: string;
  autopilot: string;
  system_id: number;
  component_id: number;
  heartbeat_received: boolean;
};

export type HomePosition = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

export type FlightModeEntry = {
  custom_mode: number;
  name: string;
};

export type BluetoothDevice = {
  name: string;
  address: string;
  device_type: "ble" | "classic";
};

export async function listSerialPorts(): Promise<string[]> {
  return invoke<string[]>("list_serial_ports_cmd");
}

export async function btRequestPermissions(): Promise<void> {
  await invoke("bt_request_permissions");
}

export async function btScanBle(timeoutMs?: number): Promise<BluetoothDevice[]> {
  return invoke<BluetoothDevice[]>("bt_scan_ble", { timeoutMs });
}

export async function btStopScanBle(): Promise<void> {
  await invoke("bt_stop_scan_ble");
}

export async function btGetBondedDevices(): Promise<BluetoothDevice[]> {
  return invoke<BluetoothDevice[]>("bt_get_bonded_devices");
}

export async function subscribeTelemetryState(
  cb: (domain: TelemetryDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);

  return listen<SessionEvent<TelemetryDomain>>(
    "telemetry://state",
    (event) => handleEvent(event.payload),
  );
}

export async function armVehicle(force: boolean): Promise<void> {
  await invoke("arm_vehicle", { force });
}

export async function disarmVehicle(force: boolean): Promise<void> {
  await invoke("disarm_vehicle", { force });
}

export async function setFlightMode(customMode: number): Promise<void> {
  await invoke("set_flight_mode", { customMode });
}

export async function getAvailableModes(): Promise<FlightModeEntry[]> {
  return invoke<FlightModeEntry[]>("get_available_modes");
}

export async function setTelemetryRate(rateHz: number): Promise<void> {
  await invoke("set_telemetry_rate", { rateHz });
}

export async function setMessageRate(messageId: number, rateHz: number): Promise<void> {
  await invoke("set_message_rate", { messageId, rateHz });
}

export type MessageRateInfo = {
  id: number;
  name: string;
  default_rate_hz: number;
};

export async function getAvailableMessageRates(): Promise<MessageRateInfo[]> {
  return invoke<MessageRateInfo[]>("get_available_message_rates");
}

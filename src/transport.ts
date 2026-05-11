import { invoke } from "@platform/core";

export type DemoVehiclePreset = "quadcopter" | "airplane" | "quadplane";

export type TransportType = "udp" | "tcp" | "serial" | "bluetooth_ble" | "bluetooth_spp" | "demo";

type TransportDescriptorBase = {
  kind: TransportType;
  label: string;
  available: boolean;
  discovery_error?: string;
};

export type UdpTransportDescriptor = TransportDescriptorBase & {
  kind: "udp";
  validation: { bind_addr_required: true };
};

export type TcpTransportDescriptor = TransportDescriptorBase & {
  kind: "tcp";
  validation: { address_required: true };
};

export type SerialTransportDescriptor = TransportDescriptorBase & {
  kind: "serial";
  validation: { port_required: true; baud_required: true };
  default_baud: number;
};

export type BluetoothTransportDescriptor = TransportDescriptorBase & {
  kind: "bluetooth_ble" | "bluetooth_spp";
  validation: { address_required: true };
};

export type DemoTransportDescriptor = TransportDescriptorBase & {
  kind: "demo";
  validation: {};
};

export type TransportDescriptor =
  | UdpTransportDescriptor
  | TcpTransportDescriptor
  | SerialTransportDescriptor
  | BluetoothTransportDescriptor
  | DemoTransportDescriptor;

export type ConnectFormValue = {
  bind_addr?: string;
  address?: string;
  port?: string;
  baud?: number | null;
  demo_vehicle_preset?: DemoVehiclePreset;
};

export type ConnectTransport =
  | { kind: "udp"; bind_addr: string }
  | { kind: "tcp"; address: string }
  | { kind: "serial"; port: string; baud: number }
  | { kind: "bluetooth_ble"; address: string }
  | { kind: "bluetooth_spp"; address: string }
  | { kind: "demo"; vehicle_preset: DemoVehiclePreset };

export type ConnectRequest = {
  transport: ConnectTransport;
};

export type DisconnectRequest = {
  session_id?: string;
};

export async function availableTransportDescriptors(): Promise<TransportDescriptor[]> {
  return invoke<TransportDescriptor[]>("available_transports");
}

export function describeTransportAvailability(descriptor: TransportDescriptor): string {
  if (descriptor.available) return `${descriptor.label} available`;
  return descriptor.discovery_error
    ? `${descriptor.label} unavailable: ${descriptor.discovery_error}`
    : `${descriptor.label} unavailable`;
}

export function validateTransportDescriptor(
  descriptor: TransportDescriptor,
  value: ConnectFormValue,
): string[] {
  const errors: string[] = [];

  switch (descriptor.kind) {
    case "udp":
      if (!value.bind_addr) errors.push("bind_addr is required");
      break;
    case "tcp":
      if (!value.address) errors.push("address is required");
      break;
    case "serial":
      if (!value.port) errors.push("port is required");
      if (value.baud == null) errors.push("baud is required");
      break;
    case "bluetooth_ble":
    case "bluetooth_spp":
      if (!value.address) errors.push("address is required");
      break;
    case "demo":
      break;
  }

  return errors;
}

export function buildConnectRequest(
  descriptor: TransportDescriptor,
  value: ConnectFormValue,
): ConnectRequest {
  switch (descriptor.kind) {
    case "udp":
      return { transport: { kind: "udp", bind_addr: value.bind_addr ?? "" } };
    case "tcp":
      return { transport: { kind: "tcp", address: value.address ?? "" } };
    case "serial":
      return {
        transport: {
          kind: "serial",
          port: value.port ?? "",
          baud: value.baud ?? descriptor.default_baud,
        },
      };
    case "bluetooth_ble":
      return { transport: { kind: "bluetooth_ble", address: value.address ?? "" } };
    case "bluetooth_spp":
      return { transport: { kind: "bluetooth_spp", address: value.address ?? "" } };
    case "demo":
      return {
        transport: {
          kind: "demo",
          vehicle_preset: value.demo_vehicle_preset ?? "quadcopter",
        },
      };
  }
}

import { typedInvoke } from "./lib/ipc/client";
import type { BluetoothProfile, TransportDescriptor as GeneratedTransportDescriptor } from "./lib/generated/ironwing";
import type {
  ConnectRequest as GeneratedConnectRequest,
  ConnectTransport as GeneratedConnectTransport,
  DemoVehiclePreset as GeneratedDemoVehiclePreset,
  DisconnectRequest as GeneratedDisconnectRequest,
} from "./lib/generated/ironwing-json";

export type DemoVehiclePreset = GeneratedDemoVehiclePreset;
export type { BluetoothProfile };

export type TransportDescriptor = GeneratedTransportDescriptor;
export type TransportType = TransportDescriptor["kind"];
export type UdpTransportDescriptor = Extract<TransportDescriptor, { kind: "udp" }>;
export type TcpTransportDescriptor = Extract<TransportDescriptor, { kind: "tcp" }>;
export type SerialTransportDescriptor = Extract<TransportDescriptor, { kind: "serial" }>;
export type BluetoothBleTransportDescriptor = Extract<TransportDescriptor, { kind: "bluetooth_ble" }>;
export type BluetoothSppTransportDescriptor = Extract<TransportDescriptor, { kind: "bluetooth_spp" }>;
export type WebSocketTransportDescriptor = Extract<TransportDescriptor, { kind: "websocket" }>;
export type WebSerialTransportDescriptor = Extract<TransportDescriptor, { kind: "web_serial" }>;
export type WebBluetoothTransportDescriptor = Extract<TransportDescriptor, { kind: "web_bluetooth" }>;
export type DemoTransportDescriptor = Extract<TransportDescriptor, { kind: "demo" }>;

export type ConnectFormValue = {
  bind_addr?: string;
  address?: string;
  port?: string;
  port_id?: string;
  websocket_url?: string;
  baud?: number | null;
  demo_vehicle_preset?: DemoVehiclePreset;
};

export type ConnectTransport = GeneratedConnectTransport;

export type ConnectRequest = GeneratedConnectRequest;

export type DisconnectRequest = GeneratedDisconnectRequest;

export async function availableTransportDescriptors(): Promise<TransportDescriptor[]> {
  return typedInvoke("available_transports");
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
    case "websocket":
      if (!value.websocket_url) errors.push("websocket_url is required");
      break;
    case "web_serial":
      if (!value.port_id) errors.push("port_id is required");
      if (value.baud == null) errors.push("baud is required");
      break;
    case "web_bluetooth":
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
      return { transport: { kind: "udp", bind_addr: value.bind_addr ?? "" }, auto_record_on_connect: false };
    case "tcp":
      return { transport: { kind: "tcp", address: value.address ?? "" }, auto_record_on_connect: false };
    case "serial":
      return {
        transport: {
          kind: "serial",
          port: value.port ?? "",
          baud: value.baud ?? descriptor.default_baud,
        },
        auto_record_on_connect: false,
      };
    case "bluetooth_ble":
      return {
        transport: {
          kind: "bluetooth_ble",
          address: value.address ?? "",
          profile: descriptor.profile,
        },
        auto_record_on_connect: false,
      };
    case "bluetooth_spp":
      return { transport: { kind: "bluetooth_spp", address: value.address ?? "" }, auto_record_on_connect: false };
    case "websocket":
      return { transport: { kind: "websocket", url: value.websocket_url ?? "" }, auto_record_on_connect: false };
    case "web_serial":
      const portId = value.port_id?.trim();
      return {
        transport: {
          kind: "web_serial",
          baud: value.baud ?? descriptor.default_baud,
          port_id: portId ?? "",
        },
        auto_record_on_connect: false,
      };
    case "web_bluetooth":
      return {
        transport: {
          kind: "web_bluetooth",
          profile: descriptor.profile,
        },
        auto_record_on_connect: false,
      };
    case "demo":
      return {
        transport: {
          kind: "demo",
          vehicle_preset: value.demo_vehicle_preset ?? "quadcopter",
        },
        auto_record_on_connect: false,
      };
  }
}

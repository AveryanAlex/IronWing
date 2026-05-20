import { ensureWasmRuntime, wasmWebTransportDescriptors } from "../wasm";
import { createWebBluetoothTransport, isWebBluetoothAvailable } from "../transports/web-bluetooth";
import { createWebSerialTransport, isWebSerialAvailable } from "../transports/web-serial";
import { createWebSocketTransport } from "../transports/websocket";
import { isWebSerialFirmwareAvailable } from "../firmware/web-serial";
import { resetActiveConnection, webBackendRuntime } from "./runtime";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import { observeRecordingInboundBridge, startAutoRecordingOnConnect, stopWebRecording } from "./recording";
import { unsupported } from "./unsupported";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { TransportDescriptor } from "../../../transport";

export type Capability =
  | { kind: "supported" }
  | { kind: "maybe"; reason: string }
  | { kind: "unsupported"; reason: string };

export type RuntimeCapabilities = {
  transports: TransportDescriptor[];
  firmware_install_update: Capability;
  log_library_filesystem: Capability;
  recording_filesystem: Capability;
  mission_transfer: Capability;
  parameter_transfer: Capability;
};

export const maybe = (reason: string): Capability => ({ kind: "maybe", reason });
export const unsupportedCapability = (reason: string): Capability => ({ kind: "unsupported", reason });

export async function ensureLoadedWasmRuntime() {
  const runtime = await ensureWasmRuntime();
  webBackendRuntime.runtimeLoaded = true;
  return runtime;
}

export function webTransportDescriptors(): Promise<TransportDescriptor[]> {
  return wasmWebTransportDescriptors({
    websocketAvailable: typeof WebSocket !== "undefined",
    webSerialAvailable: isWebSerialAvailable(),
    webBluetoothAvailable: isWebBluetoothAvailable(),
  });
}

export async function webRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const webSerialFirmwareAvailable = isWebSerialFirmwareAvailable();
  return {
    transports: await webTransportDescriptors(),
    firmware_install_update: webSerialFirmwareAvailable
      ? { kind: "supported" }
      : unsupportedCapability("Firmware install/update requires WebSerial in pure web mode."),
    log_library_filesystem: unsupportedCapability("Native log-library filesystem access is not available in pure web mode."),
    recording_filesystem: maybe("Browser recording uses File System Access when available, browser downloads for manual saves, and IndexedDB for completed recordings."),
    mission_transfer: maybe("Mission transfer depends on the connected MAVLink browser transport."),
    parameter_transfer: maybe("Parameter transfer depends on the connected MAVLink browser transport."),
  };
}

export async function tryHandleSessionCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "available_transports":
      return handled(await webTransportDescriptors());
    case "runtime_capabilities":
      return handled(await webRuntimeCapabilities());
    case "list_serial_ports_cmd":
      return handled([]);
    case "bt_request_permissions":
    case "bt_stop_scan_ble":
      return handled(undefined);
    case "bt_scan_ble":
    case "bt_get_bonded_devices":
      return handled([]);
    case "connect_link":
      return handled(await connectLink(cmd, args));
    case "open_session_snapshot": {
      const runtime = await ensureLoadedWasmRuntime();
      return handled(runtime.openSessionSnapshot(String(args?.sourceKind ?? "live")));
    }
    case "ack_session_snapshot": {
      const runtime = await ensureLoadedWasmRuntime();
      return handled(runtime.ackSessionSnapshot(
        String(args?.sessionId ?? ""),
        Number(args?.seekEpoch ?? 0),
        Number(args?.resetRevision ?? 0),
      ));
    }
    case "disconnect_link": {
      stopWebRecording({ saveToUserDestination: false });
      await resetActiveConnection();
      if (webBackendRuntime.runtimeLoaded) {
        const runtime = await ensureWasmRuntime();
        await runtime.disconnectLink();
      }
      return handled(undefined);
    }
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

async function connectLink(cmd: string, args?: WebCommandArgs): Promise<void> {
  const request = args?.request as {
    transport?: { kind?: string; url?: string; baud?: number; profile?: "nordic_uart"; vehicle_preset?: string };
    auto_record_on_connect?: boolean;
  } | undefined;
  if (!request?.transport) {
    throw new Error("connect_link requires a transport request");
  }
  if (
    request.transport.kind !== "websocket"
    && request.transport.kind !== "web_serial"
    && request.transport.kind !== "web_bluetooth"
    && request.transport.kind !== "demo"
  ) {
    unsupported(cmd, "Use the built-in demo vehicle or a browser-owned WebSocket, Web Serial, or Web Bluetooth transport.");
  }

  const runtime = await ensureLoadedWasmRuntime();
  stopWebRecording({ saveToUserDestination: false });
  await resetActiveConnection();

  if (request.transport.kind === "demo") {
    await runtime.connectDemo(String(request.transport.vehicle_preset ?? "quadcopter"));
    return;
  }

  const bridge = observeRecordingInboundBridge(runtime.beginConnect());
  const connectAbort = new AbortController();
  const transport = (() => {
    switch (request.transport.kind) {
      case "websocket":
        return createWebSocketTransport(
          { kind: "websocket", url: String(request.transport.url ?? "") },
          bridge,
          connectAbort.signal,
        );
      case "web_serial":
        return createWebSerialTransport(
          { kind: "web_serial", baud: Number(request.transport.baud ?? 57600) },
          bridge,
          connectAbort.signal,
        );
      case "web_bluetooth":
        return createWebBluetoothTransport(
          { kind: "web_bluetooth", profile: request.transport.profile ?? "nordic_uart" },
          bridge,
          connectAbort.signal,
        );
      default:
        unsupported(cmd, "Use the built-in demo vehicle or a browser-owned WebSocket, Web Serial, or Web Bluetooth transport.");
    }
  })();

  webBackendRuntime.connectAbort = connectAbort;
  webBackendRuntime.activeTransport = transport;

  try {
    await transport.start();
    await runtime.waitConnect();
    startAutoRecordingOnConnect(request.auto_record_on_connect === true);
  } catch (error) {
    await transport.close();
    webBackendRuntime.activeTransport = null;
    webBackendRuntime.connectAbort = null;
    throw error;
  }
}

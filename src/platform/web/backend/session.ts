import { ensureWasmRuntime, wasmWebTransportDescriptors } from "../wasm";
import { createWebBluetoothTransport, isWebBluetoothAvailable } from "../transports/web-bluetooth";
import { createWebSerialTransport, isWebSerialAvailable } from "../transports/web-serial";
import { createWebSocketTransport } from "../transports/websocket";
import { isWebSerialGrantAvailable } from "../serial/web-serial";
import { FIRMWARE_INSTALL_UPDATE_WEB_UNSUPPORTED_GUIDANCE } from "../../../lib/firmware/platform-guidance";
import { resetActiveConnection, webBackendRuntime, type WebActiveLinkTarget } from "./runtime";
import { definePlatformCommandHandlers } from "./command-handler";
import { observeRecordingInboundBridge, startAutoRecordingOnConnect, stopWebRecording } from "./recording";
import { unsupported } from "./unsupported";
import type { WebOnlyCommandHandlers } from "./command-handler";
import type { ConnectRequest, ConnectTransport, TransportDescriptor } from "../../../transport";
import type { Capability, RuntimeCapabilities } from "../../../lib/generated/ironwing";

export type { Capability, RuntimeCapabilities };

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
  const webSerialFirmwareAvailable = isWebSerialGrantAvailable();
  return {
    transports: await webTransportDescriptors(),
    firmware_install_update: webSerialFirmwareAvailable
      ? { kind: "supported" }
      : unsupportedCapability(FIRMWARE_INSTALL_UPDATE_WEB_UNSUPPORTED_GUIDANCE),
    log_library_filesystem: unsupportedCapability("Native log-library filesystem access is not available in pure web mode."),
    recording_filesystem: maybe("Browser recording uses File System Access when available, browser downloads for manual saves, and IndexedDB for completed recordings."),
    mission_transfer: maybe("Mission transfer depends on the connected MAVLink browser transport."),
    parameter_transfer: maybe("Parameter transfer depends on the connected MAVLink browser transport."),
  };
}

export const sessionCommandHandlers = definePlatformCommandHandlers({
  available_transports: async () => webTransportDescriptors(),
  bt_request_permissions: async () => undefined,
  bt_stop_scan_ble: async () => undefined,
  bt_scan_ble: async () => [],
  bt_get_bonded_devices: async () => [],
  connect_link: async ({ request }) => connectLink("connect_link", request),
  open_session_snapshot: async ({ sourceKind }) => {
    const runtime = await ensureLoadedWasmRuntime();
    return runtime.openSessionSnapshot(sourceKind);
  },
  ack_session_snapshot: async ({ sessionId, seekEpoch, resetRevision }) => {
    const runtime = await ensureLoadedWasmRuntime();
    return runtime.ackSessionSnapshot(sessionId, seekEpoch, resetRevision);
  },
  disconnect_link: async () => {
    stopWebRecording({ saveToUserDestination: false });
    await resetActiveConnection();
    if (webBackendRuntime.runtimeLoaded) {
      const runtime = await ensureWasmRuntime();
      await runtime.disconnectLink();
    }
  },
});

export const webSessionCommandHandlers = {
  runtime_capabilities: async () => webRuntimeCapabilities(),
} satisfies WebOnlyCommandHandlers;

async function connectLink(cmd: string, request: ConnectRequest | undefined): Promise<void> {
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
    await runtime.connectDemo(request.transport.vehicle_preset);
    webBackendRuntime.activeLinkTarget = { kind: "other" };
    return;
  }

  const bridge = observeRecordingInboundBridge(runtime.beginConnect());
  const connectAbort = new AbortController();
  const transport = (() => {
    switch (request.transport.kind) {
      case "websocket":
        return createWebSocketTransport(
          { kind: "websocket", url: request.transport.url },
          bridge,
          connectAbort.signal,
        );
      case "web_serial":
        return createWebSerialTransport(
          {
            kind: "web_serial",
            baud: request.transport.baud,
            port_id: request.transport.port_id,
          },
          bridge,
          connectAbort.signal,
        );
      case "web_bluetooth":
        return createWebBluetoothTransport(
          { kind: "web_bluetooth", profile: request.transport.profile },
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
    webBackendRuntime.activeLinkTarget = activeLinkTargetForTransportRequest(request.transport);
    await runtime.waitConnect();
    startAutoRecordingOnConnect(request.auto_record_on_connect === true);
  } catch (error) {
    await transport.close();
    webBackendRuntime.activeTransport = null;
    webBackendRuntime.connectAbort = null;
    webBackendRuntime.activeLinkTarget = null;
    throw error;
  }
}

function activeLinkTargetForTransportRequest(request: ConnectTransport): WebActiveLinkTarget {
  if (request.kind === "web_serial") {
    const portId = request.port_id.trim();
    return portId ? { kind: "web_serial", port_id: portId } : { kind: "other" };
  }

  return { kind: "other" };
}

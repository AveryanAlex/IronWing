import type { BrowserMavlinkTransport } from "../transports/types";
import type { FirmwareSessionStatus } from "../../../firmware";

export const IDLE_WEB_FIRMWARE_STATUS: FirmwareSessionStatus = { kind: "idle" };

export type WebBackendRuntime = {
  runtimeLoaded: boolean;
  activeTransport: BrowserMavlinkTransport | null;
  connectAbort: AbortController | null;
  firmwareSessionStatus: FirmwareSessionStatus;
  firmwareInstallAbort: AbortController | null;
};

export const webBackendRuntime: WebBackendRuntime = {
  runtimeLoaded: false,
  activeTransport: null,
  connectAbort: null,
  firmwareSessionStatus: IDLE_WEB_FIRMWARE_STATUS,
  firmwareInstallAbort: null,
};

export async function resetActiveConnection(): Promise<void> {
  webBackendRuntime.connectAbort?.abort();
  webBackendRuntime.connectAbort = null;

  if (webBackendRuntime.activeTransport) {
    await webBackendRuntime.activeTransport.close();
    webBackendRuntime.activeTransport = null;
  }
}

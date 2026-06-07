import type { BrowserMavlinkTransport } from "../transports/types";
import type { FirmwareSessionStatus } from "../../../firmware";

export const IDLE_WEB_FIRMWARE_STATUS: FirmwareSessionStatus = { kind: "idle" };

export type WebActiveLinkTarget =
  | { kind: "web_serial"; port_id: string }
  | { kind: "other" };

export type WebBackendRuntime = {
  runtimeLoaded: boolean;
  activeTransport: BrowserMavlinkTransport | null;
  activeLinkTarget: WebActiveLinkTarget | null;
  connectAbort: AbortController | null;
  firmwareSessionStatus: FirmwareSessionStatus;
  firmwareInstallAbort: AbortController | null;
};

export const webBackendRuntime: WebBackendRuntime = {
  runtimeLoaded: false,
  activeTransport: null,
  activeLinkTarget: null,
  connectAbort: null,
  firmwareSessionStatus: IDLE_WEB_FIRMWARE_STATUS,
  firmwareInstallAbort: null,
};

export async function resetActiveConnection(): Promise<void> {
  webBackendRuntime.connectAbort?.abort();
  webBackendRuntime.connectAbort = null;
  webBackendRuntime.activeLinkTarget = null;

  if (webBackendRuntime.activeTransport) {
    await webBackendRuntime.activeTransport.close();
    webBackendRuntime.activeTransport = null;
  }
}

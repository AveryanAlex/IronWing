import type { BrowserMavlinkTransport } from "../transports/types";

export type WebBackendRuntime = {
  runtimeLoaded: boolean;
  activeTransport: BrowserMavlinkTransport | null;
  connectAbort: AbortController | null;
};

export const webBackendRuntime: WebBackendRuntime = {
  runtimeLoaded: false,
  activeTransport: null,
  connectAbort: null,
};

export async function resetActiveConnection(): Promise<void> {
  webBackendRuntime.connectAbort?.abort();
  webBackendRuntime.connectAbort = null;

  if (webBackendRuntime.activeTransport) {
    await webBackendRuntime.activeTransport.close();
    webBackendRuntime.activeTransport = null;
  }
}

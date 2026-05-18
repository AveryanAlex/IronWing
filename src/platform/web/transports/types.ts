import type { WasmByteBridge } from "../types";

export type BrowserMavlinkTransport = {
  readonly kind: "websocket";
  start(): Promise<void>;
  close(): Promise<void>;
};

export type BrowserMavlinkTransportFactory<TRequest> = (
  request: TRequest,
  bridge: WasmByteBridge,
  signal: AbortSignal,
) => BrowserMavlinkTransport;

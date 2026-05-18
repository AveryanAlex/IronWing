import type { WasmByteBridge } from "../types";
import type { BrowserMavlinkTransport } from "./types";

export type WebSocketTransportRequest = {
  kind: "websocket";
  url: string;
};

class WebSocketTransport implements BrowserMavlinkTransport {
  readonly kind = "websocket" as const;

  #socket: WebSocket | null = null;
  #closed = false;

  constructor(
    private readonly request: WebSocketTransportRequest,
    private readonly bridge: WasmByteBridge,
    private readonly signal: AbortSignal,
  ) {}

  async start(): Promise<void> {
    if (!this.request.url) {
      throw new Error("websocket url is required");
    }

    const socket = new WebSocket(this.request.url);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;

    this.signal.addEventListener("abort", () => {
      void this.close();
    });

    socket.addEventListener("message", (event) => {
      void this.handleMessage(event.data);
    });
    socket.addEventListener("close", () => {
      this.bridge.close();
    });
    socket.addEventListener("error", () => {
      this.bridge.close();
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("websocket connection failed")), {
        once: true,
      });
    });

    void this.drainOutbound();
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.bridge.close();
    this.#socket?.close();
    this.#socket = null;
  }

  private async handleMessage(data: Blob | ArrayBuffer | Uint8Array | string): Promise<void> {
    if (typeof data === "string") {
      return;
    }

    const bytes = data instanceof Uint8Array
      ? data
      : data instanceof Blob
        ? new Uint8Array(await data.arrayBuffer())
        : new Uint8Array(data);
    await this.bridge.pushInbound(bytes);
  }

  private async drainOutbound(): Promise<void> {
    while (!this.#closed && this.#socket && this.#socket.readyState === WebSocket.OPEN) {
      const next = await this.bridge.nextOutbound();
      if (next == null) {
        break;
      }

      const payload = next instanceof Uint8Array
        ? next
        : next instanceof ArrayBuffer
          ? new Uint8Array(next)
          : new Uint8Array(next as ArrayBufferLike);
      this.#socket.send(payload);
    }
  }
}

export function createWebSocketTransport(
  request: WebSocketTransportRequest,
  bridge: WasmByteBridge,
  signal: AbortSignal,
): BrowserMavlinkTransport {
  return new WebSocketTransport(request, bridge, signal);
}

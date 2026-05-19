import type { WasmByteBridge } from "../types";
import type { BrowserMavlinkTransport } from "./types";

export type WebSerialTransportRequest = {
  kind: "web_serial";
  baud: number;
};

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
  };
};

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== "undefined"
    && typeof (navigator as SerialNavigator).serial?.requestPort === "function";
}

class WebSerialTransport implements BrowserMavlinkTransport {
  readonly kind = "web_serial" as const;

  #closed = false;
  #port: SerialPortLike | null = null;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(
    private readonly request: WebSerialTransportRequest,
    private readonly bridge: WasmByteBridge,
    private readonly signal: AbortSignal,
  ) {}

  async start(): Promise<void> {
    const serial = (navigator as SerialNavigator).serial;
    if (typeof serial?.requestPort !== "function") {
      throw new Error("Web Serial is not available in this browser");
    }

    if (!Number.isFinite(this.request.baud) || this.request.baud <= 0) {
      throw new Error("web serial baud is required");
    }

    const port = await serial.requestPort();
    this.#port = port;
    this.signal.addEventListener("abort", () => {
      void this.close();
    }, { once: true });

    await port.open({ baudRate: this.request.baud });
    void this.readInbound();
    void this.drainOutbound();
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.bridge.close();

    await this.#reader?.cancel().catch(() => undefined);
    await this.#writer?.close().catch(() => undefined);
    this.#reader = null;
    this.#writer = null;

    await this.#port?.close().catch(() => undefined);
    this.#port = null;
  }

  private async readInbound(): Promise<void> {
    const reader = this.#port?.readable?.getReader();
    if (!reader) {
      return;
    }

    this.#reader = reader;
    try {
      while (!this.#closed) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value && value.byteLength > 0) {
          await this.bridge.pushInbound(value instanceof Uint8Array ? value : new Uint8Array(value));
        }
      }
    } catch (error) {
      if (!this.#closed) {
        this.bridge.close();
      }
    } finally {
      reader.releaseLock();
      if (this.#reader === reader) {
        this.#reader = null;
      }
    }
  }

  private async drainOutbound(): Promise<void> {
    const writer = this.#port?.writable?.getWriter();
    if (!writer) {
      return;
    }

    this.#writer = writer;
    try {
      while (!this.#closed) {
        const next = await this.bridge.nextOutbound();
        if (next == null) {
          break;
        }

        const payload = next instanceof Uint8Array
          ? next
          : next instanceof ArrayBuffer
            ? new Uint8Array(next)
            : new Uint8Array(next as ArrayBufferLike);
        await writer.write(payload);
      }
    } catch (error) {
      if (!this.#closed) {
        this.bridge.close();
      }
    } finally {
      writer.releaseLock();
      if (this.#writer === writer) {
        this.#writer = null;
      }
    }
  }
}

export function createWebSerialTransport(
  request: WebSerialTransportRequest,
  bridge: WasmByteBridge,
  signal: AbortSignal,
): BrowserMavlinkTransport {
  return new WebSerialTransport(request, bridge, signal);
}

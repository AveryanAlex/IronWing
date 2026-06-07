import type { SerialPortInfo } from "../../../serial-ports";

export type WebSerialAdapter = {
  write(bytes: Uint8Array): Promise<void>;
  read(maxLength: number, timeoutMs: number): Promise<Uint8Array | null>;
  flushInput(): Promise<void>;
  close(): Promise<void>;
};

export type WebSerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
};

type SerialNavigator = Navigator & {
  serial?: {
    getPorts?(): Promise<WebSerialPortLike[]>;
    requestPort?(): Promise<WebSerialPortLike>;
  };
};

const PORT_PREFIX = "webserial";

const portIds = new WeakMap<WebSerialPortLike, string>();
const knownPorts: WebSerialPortLike[] = [];

export function isWebSerialGrantAvailable(): boolean {
  const serial = typeof navigator === "undefined" ? undefined : (navigator as SerialNavigator).serial;
  return typeof serial?.requestPort === "function" && typeof serial?.getPorts === "function";
}

export async function requestWebSerialPort(): Promise<SerialPortInfo> {
  const serial = (navigator as SerialNavigator).serial;
  if (typeof serial?.requestPort !== "function") {
    throw new Error("Web Serial is not available in this browser");
  }

  const port = await serial.requestPort();
  return registerWebSerialPort(port);
}

export async function listGrantedWebSerialPorts(): Promise<SerialPortInfo[]> {
  const serial = typeof navigator === "undefined" ? undefined : (navigator as SerialNavigator).serial;
  if (typeof serial?.getPorts !== "function") {
    return [];
  }

  for (const port of await serial.getPorts()) {
    registerWebSerialPort(port);
  }

  return knownPorts.map(portInfo);
}

export async function openWebSerialPort(portName: string, baud: number, signal: AbortSignal): Promise<WebSerialAdapter> {
  const port = await resolveGrantedWebSerialPort(portName);
  if (!port) {
    throw new Error("WebSerial port is not granted. Use Grant WebSerial port first.");
  }
  if (!Number.isFinite(baud) || baud <= 0) {
    throw new Error("web serial baud is required");
  }

  const adapter = new WebSerialPortAdapter(port, baud, signal);
  await adapter.open();
  return adapter;
}

export function registerWebSerialPort(port: WebSerialPortLike): SerialPortInfo {
  if (!portIds.has(port)) {
    portIds.set(port, `${PORT_PREFIX}:${knownPorts.length + 1}`);
    knownPorts.push(port);
  }

  return portInfo(port);
}

export async function resolveGrantedWebSerialPort(portName: string): Promise<WebSerialPortLike | null> {
  const serial = typeof navigator === "undefined" ? undefined : (navigator as SerialNavigator).serial;
  if (typeof serial?.getPorts === "function") {
    for (const port of await serial.getPorts()) {
      registerWebSerialPort(port);
    }
  }

  return knownPorts.find((candidate) => portInfo(candidate).port_name === portName) ?? null;
}

export function resetGrantedWebSerialPortsForTests(): void {
  knownPorts.splice(0);
}

function portInfo(port: WebSerialPortLike): SerialPortInfo {
  const info = port.getInfo?.() ?? {};
  const id = portIds.get(port) ?? `${PORT_PREFIX}:unknown`;
  return {
    port_name: id,
    vid: typeof info.usbVendorId === "number" ? info.usbVendorId : null,
    pid: typeof info.usbProductId === "number" ? info.usbProductId : null,
    serial_number: null,
    manufacturer: null,
    product: "WebSerial device",
    location: id,
  };
}

class WebSerialPortAdapter implements WebSerialAdapter {
  #closed = false;
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #buffers: Uint8Array[] = [];
  #waiters: Array<() => void> = [];

  constructor(
    private readonly port: WebSerialPortLike,
    private readonly baud: number,
    private readonly signal: AbortSignal,
  ) {}

  async open(): Promise<void> {
    this.signal.addEventListener("abort", () => {
      void this.close();
    }, { once: true });
    await this.port.open({ baudRate: this.baud });
    this.#reader = this.port.readable?.getReader() ?? null;
    this.#writer = this.port.writable?.getWriter() ?? null;
    void this.readLoop();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (this.#closed) {
      throw new Error("WebSerial port is closed");
    }
    if (!this.#writer) {
      throw new Error("WebSerial port is not writable");
    }
    await this.#writer.write(bytes);
  }

  async read(maxLength: number, timeoutMs: number): Promise<Uint8Array | null> {
    if (this.#closed) {
      return null;
    }

    const immediate = this.shiftBuffered(maxLength);
    if (immediate) {
      return immediate;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const waiter = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) {
          this.#waiters.splice(index, 1);
        }
        waiter();
      }, timeoutMs);
      this.#waiters.push(waiter);
    });

    return this.shiftBuffered(maxLength);
  }

  async flushInput(): Promise<void> {
    this.#buffers = [];
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.notifyReaders();
    await this.#reader?.cancel().catch(() => undefined);
    await this.#writer?.close().catch(() => undefined);
    this.#reader?.releaseLock();
    this.#writer?.releaseLock();
    this.#reader = null;
    this.#writer = null;
    await this.port.close().catch(() => undefined);
  }

  private async readLoop(): Promise<void> {
    const reader = this.#reader;
    if (!reader) {
      return;
    }

    try {
      while (!this.#closed) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value && value.byteLength > 0) {
          this.#buffers.push(value instanceof Uint8Array ? value : new Uint8Array(value));
          this.notifyReaders();
        }
      }
    } catch {
      if (!this.#closed) {
        this.#closed = true;
        this.notifyReaders();
      }
    }
  }

  private shiftBuffered(maxLength: number): Uint8Array | null {
    const first = this.#buffers.shift();
    if (!first) {
      return null;
    }

    if (first.byteLength <= maxLength) {
      return first;
    }

    this.#buffers.unshift(first.slice(maxLength));
    return first.slice(0, maxLength);
  }

  private notifyReaders(): void {
    const waiters = this.#waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

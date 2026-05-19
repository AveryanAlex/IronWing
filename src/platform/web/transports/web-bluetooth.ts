import type { WasmByteBridge } from "../types";
import type { BrowserMavlinkTransport } from "./types";

export type WebBluetoothTransportRequest = {
  kind: "web_bluetooth";
  profile: "nordic_uart";
};

export const NORDIC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NORDIC_UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const NORDIC_UART_TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

type BluetoothRemoteGATTCharacteristicLike = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  stopNotifications?(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  writeValue?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
};

type BluetoothRemoteGATTServiceLike = {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
};

type BluetoothRemoteGATTServerLike = {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTServiceLike>;
};

type BluetoothDeviceLike = {
  gatt?: BluetoothRemoteGATTServerLike;
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice(options: {
      filters: Array<{ services: string[] }>;
      optionalServices?: string[];
    }): Promise<BluetoothDeviceLike>;
  };
};

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined"
    && typeof (navigator as BluetoothNavigator).bluetooth?.requestDevice === "function";
}

class WebBluetoothTransport implements BrowserMavlinkTransport {
  readonly kind = "web_bluetooth" as const;

  #closed = false;
  #server: BluetoothRemoteGATTServerLike | null = null;
  #tx: BluetoothRemoteGATTCharacteristicLike | null = null;
  #rx: BluetoothRemoteGATTCharacteristicLike | null = null;
  readonly #handleNotification = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristicLike | null)?.value;
    if (!value) {
      return;
    }

    const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    void this.bridge.pushInbound(bytes);
  };

  constructor(
    private readonly request: WebBluetoothTransportRequest,
    private readonly bridge: WasmByteBridge,
    private readonly signal: AbortSignal,
  ) {}

  async start(): Promise<void> {
    if (this.request.profile !== "nordic_uart") {
      throw new Error("unsupported Web Bluetooth profile");
    }

    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (typeof bluetooth?.requestDevice !== "function") {
      throw new Error("Web Bluetooth is not available in this browser");
    }

    this.signal.addEventListener("abort", () => {
      void this.close();
    }, { once: true });

    const device = await bluetooth.requestDevice({
      filters: [{ services: [NORDIC_UART_SERVICE_UUID] }],
      optionalServices: [NORDIC_UART_SERVICE_UUID],
    });
    if (!device.gatt) {
      throw new Error("selected Bluetooth device does not expose GATT");
    }

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NORDIC_UART_SERVICE_UUID);
    const tx = await service.getCharacteristic(NORDIC_UART_TX_CHARACTERISTIC_UUID);
    const rx = await service.getCharacteristic(NORDIC_UART_RX_CHARACTERISTIC_UUID);
    await tx.startNotifications();
    tx.addEventListener("characteristicvaluechanged", this.#handleNotification);

    this.#server = server;
    this.#tx = tx;
    this.#rx = rx;

    void this.drainOutbound();
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.bridge.close();

    this.#tx?.removeEventListener("characteristicvaluechanged", this.#handleNotification);
    await this.#tx?.stopNotifications?.().catch(() => undefined);
    if (this.#server?.connected) {
      this.#server.disconnect();
    }
    this.#tx = null;
    this.#rx = null;
    this.#server = null;
  }

  private async drainOutbound(): Promise<void> {
    while (!this.#closed && this.#rx) {
      const next = await this.bridge.nextOutbound();
      if (next == null) {
        break;
      }

      const payloadSource = next instanceof Uint8Array
        ? next
        : next instanceof ArrayBuffer
          ? new Uint8Array(next)
          : new Uint8Array(next as ArrayBufferLike);
      const payload = Uint8Array.from(payloadSource);
      if (typeof this.#rx.writeValueWithoutResponse === "function") {
        await this.#rx.writeValueWithoutResponse(payload);
      } else if (typeof this.#rx.writeValue === "function") {
        await this.#rx.writeValue(payload);
      } else {
        throw new Error("Nordic UART RX characteristic is not writable");
      }
    }
  }
}

export function createWebBluetoothTransport(
  request: WebBluetoothTransportRequest,
  bridge: WasmByteBridge,
  signal: AbortSignal,
): BrowserMavlinkTransport {
  return new WebBluetoothTransport(request, bridge, signal);
}

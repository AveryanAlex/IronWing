import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWebBluetoothTransport,
  isWebBluetoothAvailable,
  NORDIC_UART_RX_CHARACTERISTIC_UUID,
  NORDIC_UART_SERVICE_UUID,
  NORDIC_UART_TX_CHARACTERISTIC_UUID,
} from "./web-bluetooth";

class MockCharacteristic extends EventTarget {
  value?: DataView;
  written: Uint8Array[] = [];
  startNotifications = vi.fn(async () => this);
  stopNotifications = vi.fn(async () => this);
  writeValueWithoutResponse = vi.fn(async (value: BufferSource) => {
    this.written.push(new Uint8Array(value as ArrayBuffer));
  });
}

describe("web bluetooth transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a Nordic UART device and bridges characteristic bytes", async () => {
    const tx = new MockCharacteristic();
    const rx = new MockCharacteristic();
    const service = {
      getCharacteristic: vi.fn(async (uuid: string) => {
        if (uuid === NORDIC_UART_TX_CHARACTERISTIC_UUID) return tx;
        if (uuid === NORDIC_UART_RX_CHARACTERISTIC_UUID) return rx;
        throw new Error(`unexpected characteristic ${uuid}`);
      }),
    };
    const server = {
      connected: true,
      connect: vi.fn(async () => server),
      disconnect: vi.fn(() => undefined),
      getPrimaryService: vi.fn(async (uuid: string) => {
        if (uuid !== NORDIC_UART_SERVICE_UUID) throw new Error(`unexpected service ${uuid}`);
        return service;
      }),
    };
    const requestDevice = vi.fn(async () => ({ gatt: server }));
    vi.stubGlobal("navigator", { bluetooth: { requestDevice } });

    const pushInbound = vi.fn(async () => undefined);
    const nextOutbound = vi
      .fn<() => Promise<Uint8Array | null>>()
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(null);
    const close = vi.fn();

    const transport = createWebBluetoothTransport(
      { kind: "web_bluetooth", profile: "nordic_uart" },
      { pushInbound, nextOutbound, close, isClosed: () => false } as never,
      new AbortController().signal,
    );

    expect(isWebBluetoothAvailable()).toBe(true);
    await transport.start();
    tx.value = new DataView(new Uint8Array([9, 8, 7]).buffer);
    tx.dispatchEvent(new Event("characteristicvaluechanged"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [NORDIC_UART_SERVICE_UUID] }],
      optionalServices: [NORDIC_UART_SERVICE_UUID],
    });
    expect(tx.startNotifications).toHaveBeenCalledOnce();
    expect(pushInbound).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
    expect(rx.written).toEqual([new Uint8Array([1, 2, 3])]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isWebSerialGrantAvailable,
  listGrantedWebSerialPorts,
  openWebSerialPort,
  requestWebSerialPort,
  resetGrantedWebSerialPortsForTests,
} from "./web-serial";

describe("web serial registry and adapter", () => {
  afterEach(() => {
    resetGrantedWebSerialPortsForTests();
    vi.unstubAllGlobals();
  });

  it("requests and lists granted ports with USB metadata", async () => {
    const port = makePort();
    vi.stubGlobal("navigator", {
      serial: {
        requestPort: vi.fn(async () => port),
        getPorts: vi.fn(async () => [port]),
      },
    });

    expect(isWebSerialGrantAvailable()).toBe(true);
    await expect(requestWebSerialPort()).resolves.toEqual(expect.objectContaining({
      port_name: "webserial:1",
      vid: 1155,
      pid: 22336,
    }));
    await expect(listGrantedWebSerialPorts()).resolves.toEqual([
      expect.objectContaining({ port_name: "webserial:1" }),
    ]);
  });

  it("opens a granted port, buffers reads with timeout, writes, and closes", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const written: Uint8Array[] = [];
    const port = makePort({
      readable: new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          written.push(chunk);
        },
      }),
    });
    vi.stubGlobal("navigator", {
      serial: {
        requestPort: vi.fn(async () => port),
        getPorts: vi.fn(async () => [port]),
      },
    });

    const granted = await requestWebSerialPort();
    const adapter = await openWebSerialPort(granted.port_name, 115200, new AbortController().signal);
    controller.enqueue(new Uint8Array([1, 2, 3, 4]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await adapter.write(new Uint8Array([9, 8]));
    await expect(adapter.read(2, 10)).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(adapter.read(4, 10)).resolves.toEqual(new Uint8Array([3, 4]));
    await expect(adapter.read(4, 1)).resolves.toBeNull();
    expect(written).toEqual([new Uint8Array([9, 8])]);

    await adapter.close();
    expect(port.close).toHaveBeenCalledOnce();
  });
});

function makePort(overrides: Partial<{
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}> = {}) {
  return {
    readable: overrides.readable ?? null,
    writable: overrides.writable ?? new WritableStream<Uint8Array>(),
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    getInfo: () => ({ usbVendorId: 1155, usbProductId: 22336 }),
  };
}

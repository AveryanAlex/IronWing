import { afterEach, describe, expect, it, vi } from "vitest";

import { registerWebSerialPort, resetGrantedWebSerialPortsForTests } from "../serial/web-serial";
import { createWebSerialTransport, isWebSerialAvailable } from "./web-serial";

describe("web serial transport", () => {
  afterEach(() => {
    resetGrantedWebSerialPortsForTests();
    vi.unstubAllGlobals();
  });

  it("requires a granted port id before opening WebSerial", async () => {
    vi.stubGlobal("navigator", { serial: { getPorts: vi.fn(async () => []), requestPort: vi.fn() } });

    const transport = createWebSerialTransport(
      { kind: "web_serial", baud: 115200 },
      { pushInbound: vi.fn(), nextOutbound: vi.fn(async () => null), close: vi.fn(), isClosed: () => false } as never,
      new AbortController().signal,
    );

    expect(isWebSerialAvailable()).toBe(true);
    await expect(transport.start()).rejects.toThrow("WebSerial port is required");
  });

  it("opens an already granted port id, pushes inbound bytes, and drains outbound bytes", async () => {
    let readableController!: ReadableStreamDefaultController<Uint8Array>;
    const written: Uint8Array[] = [];
    const port = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          readableController = controller;
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          written.push(chunk);
        },
      }),
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const getPorts = vi.fn(async () => [port]);
    const portInfo = registerWebSerialPort(port);
    vi.stubGlobal("navigator", { serial: { getPorts, requestPort: vi.fn() } });

    const pushInbound = vi.fn(async () => undefined);
    const nextOutbound = vi
      .fn<() => Promise<Uint8Array | null>>()
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(null);
    const close = vi.fn();

    const transport = createWebSerialTransport(
      { kind: "web_serial", baud: 115200, port_id: portInfo.port_name },
      { pushInbound, nextOutbound, close, isClosed: () => false } as never,
      new AbortController().signal,
    );

    expect(isWebSerialAvailable()).toBe(true);
    await transport.start();
    readableController.enqueue(new Uint8Array([9, 8, 7]));
    readableController.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getPorts).toHaveBeenCalledOnce();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(pushInbound).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
    expect(written).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("opens an already granted port id without showing the chooser", async () => {
    const port = {
      readable: new ReadableStream<Uint8Array>(),
      writable: new WritableStream<Uint8Array>(),
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const getPorts = vi.fn(async () => [port]);
    const requestPort = vi.fn();
    const portInfo = registerWebSerialPort(port);
    vi.stubGlobal("navigator", { serial: { getPorts, requestPort } });

    const transport = createWebSerialTransport(
      { kind: "web_serial", baud: 57600, port_id: portInfo.port_name },
      { pushInbound: vi.fn(), nextOutbound: vi.fn(async () => null), close: vi.fn(), isClosed: () => false } as never,
      new AbortController().signal,
    );

    await transport.start();

    expect(getPorts).toHaveBeenCalledOnce();
    expect(requestPort).not.toHaveBeenCalled();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 57600 });
  });
});

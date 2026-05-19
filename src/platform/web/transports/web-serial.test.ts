import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebSerialTransport, isWebSerialAvailable } from "./web-serial";

describe("web serial transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a browser port, pushes inbound bytes, and drains outbound bytes", async () => {
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
    const requestPort = vi.fn(async () => port);
    vi.stubGlobal("navigator", { serial: { requestPort } });

    const pushInbound = vi.fn(async () => undefined);
    const nextOutbound = vi
      .fn<() => Promise<Uint8Array | null>>()
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(null);
    const close = vi.fn();

    const transport = createWebSerialTransport(
      { kind: "web_serial", baud: 115200 },
      { pushInbound, nextOutbound, close, isClosed: () => false } as never,
      new AbortController().signal,
    );

    expect(isWebSerialAvailable()).toBe(true);
    await transport.start();
    readableController.enqueue(new Uint8Array([9, 8, 7]));
    readableController.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestPort).toHaveBeenCalledOnce();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(pushInbound).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
    expect(written).toEqual([new Uint8Array([1, 2, 3])]);
  });
});

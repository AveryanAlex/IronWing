import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWebSocketTransport } from "./websocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  readonly url: string;
  binaryType = "blob";
  readyState = MockWebSocket.OPEN;
  sent: Uint8Array[] = [];
  listeners = new Map<string, Array<(event?: any) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open"));
  }

  addEventListener(event: string, listener: (event?: any) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  send(data: Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.emit("close");
  }

  emit(event: string, payload?: any) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

describe("websocket transport", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  it("pushes inbound frames and sends outbound frames", async () => {
    const pushInbound = vi.fn(async () => undefined);
    const nextOutbound = vi
      .fn<() => Promise<Uint8Array | null>>()
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(null);
    const close = vi.fn();

    const transport = createWebSocketTransport(
      { kind: "websocket", url: "ws://127.0.0.1:14560" },
      { pushInbound, nextOutbound, close, isClosed: () => false } as never,
      new AbortController().signal,
    );

    await transport.start();
    const socket = MockWebSocket.instances[0]!;
    socket.emit("message", { data: new Uint8Array([9, 8, 7]) });
    await Promise.resolve();

    expect(pushInbound).toHaveBeenCalledWith(new Uint8Array([9, 8, 7]));
    expect(socket.sent).toEqual([new Uint8Array([1, 2, 3])]);
  });
});

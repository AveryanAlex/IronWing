import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../wasm", () => ({
  ensureWasmRuntime: vi.fn(async () => ({
    beginConnect: vi.fn(() => ({ close: vi.fn(), isClosed: () => false })),
    waitConnect: vi.fn(async () => undefined),
    disconnectLink: vi.fn(async () => undefined),
    openSessionSnapshot: vi.fn(() => ({ envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 } })),
    ackSessionSnapshot: vi.fn(() => ({ result: "accepted", envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 } })),
  })),
}));

vi.mock("../transports/websocket", () => ({
  createWebSocketTransport: vi.fn(() => ({
    kind: "websocket",
    start: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  })),
}));

import { invokeWebCommand } from "./commands";

describe("web backend commands", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "WebSocket",
      class {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
      } as unknown as typeof WebSocket,
    );
  });

  it("reports websocket transport availability", async () => {
    await expect(invokeWebCommand("available_transports")).resolves.toEqual([
      expect.objectContaining({ kind: "websocket", validation: { url_required: true } }),
    ]);
  });

  it("rejects unsupported commands clearly", async () => {
    await expect(invokeWebCommand("mission_upload")).rejects.toThrow(
      "mission_upload is not available in the web runtime yet",
    );
  });
});

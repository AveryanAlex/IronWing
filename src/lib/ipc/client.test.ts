import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@platform/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@platform/event", () => ({
  listen: mocks.listen,
}));

describe("typed IPC client", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
  });

  it("forwards command arguments unchanged", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);
    const { typedInvoke } = await import("./client");

    await typedInvoke("set_message_rate", { messageId: 33, rateHz: 4 });

    expect(mocks.invoke).toHaveBeenCalledWith("set_message_rate", { messageId: 33, rateHz: 4 });
  });

  it("omits args for no-argument commands", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);
    const { typedInvoke } = await import("./client");

    await typedInvoke("mission_cancel");

    expect(mocks.invoke).toHaveBeenCalledWith("mission_cancel", undefined);
  });

  it("forwards event names and handlers unchanged", async () => {
    const unlisten = vi.fn();
    mocks.listen.mockResolvedValueOnce(unlisten);
    const { typedListen } = await import("./client");
    const { EVENT_NAMES } = await import("../generated/events");
    const handler = vi.fn();

    await typedListen(EVENT_NAMES.FIRMWARE_PROGRESS, handler);

    expect(mocks.listen).toHaveBeenCalledWith(EVENT_NAMES.FIRMWARE_PROGRESS, handler);
  });
});

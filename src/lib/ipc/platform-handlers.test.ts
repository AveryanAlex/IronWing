import { describe, expect, it, vi } from "vitest";

import { definePlatformCommandHandlers, invokePlatformCommand } from "./platform-handlers";

describe("platform command handlers", () => {
  it("invokes no-argument handlers", async () => {
    const missionCancel = vi.fn();
    const handlers = definePlatformCommandHandlers({
      mission_cancel: missionCancel,
    });

    await invokePlatformCommand(handlers, "mission_cancel");

    expect(missionCancel).toHaveBeenCalledWith();
  });

  it("passes typed command arguments", async () => {
    const setMessageRate = vi.fn();
    const handlers = definePlatformCommandHandlers({
      set_message_rate: setMessageRate,
    });

    await invokePlatformCommand(handlers, "set_message_rate", { messageId: 33, rateHz: 4 });

    expect(setMessageRate).toHaveBeenCalledWith({ messageId: 33, rateHz: 4 });
  });

  it("returns undefined for unsupported commands", async () => {
    const handlers = definePlatformCommandHandlers({
      mission_cancel: vi.fn(),
    });

    await expect(invokePlatformCommand(handlers, "param_cancel")).resolves.toBeUndefined();
  });
});

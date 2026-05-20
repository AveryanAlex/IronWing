import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@platform/core", () => ({
  invoke,
}));

vi.mock("@platform/event", () => ({
  listen: vi.fn(),
}));

describe("guided bridge command wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes guided session commands with native names and frontend request args", async () => {
    const accepted = { result: "accepted", state: { value: null, provenance: { source: "live" } } };
    invoke.mockResolvedValue(accepted);
    const { startGuidedSession, updateGuidedSession, stopGuidedSession } = await import("./guided");

    const startRequest = { session: { kind: "goto" as const, latitude_deg: 47.1, longitude_deg: 8.2, altitude_m: 120 } };
    const updateRequest = { session: { kind: "goto" as const, latitude_deg: 47.3, longitude_deg: 8.4, altitude_m: 130 } };

    await expect(startGuidedSession(startRequest)).resolves.toBe(accepted);
    await expect(updateGuidedSession(updateRequest)).resolves.toBe(accepted);
    await expect(stopGuidedSession()).resolves.toBe(accepted);

    expect(invoke).toHaveBeenCalledWith("start_guided_session", { request: startRequest });
    expect(invoke).toHaveBeenCalledWith("update_guided_session", { request: updateRequest });
    expect(invoke).toHaveBeenCalledWith("stop_guided_session");
  });

  it("surfaces invoke rejections for guided commands", async () => {
    const { startGuidedSession } = await import("./guided");

    invoke.mockRejectedValueOnce(new Error("guided unavailable"));

    await expect(startGuidedSession({
      session: { kind: "goto", latitude_deg: 47.1, longitude_deg: 8.2, altitude_m: 120 },
    })).rejects.toThrow("guided unavailable");
  });
});

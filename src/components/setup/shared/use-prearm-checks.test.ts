// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestPrearmChecks, subscribeStatusText } = vi.hoisted(() => ({
  requestPrearmChecks: vi.fn(),
  subscribeStatusText: vi.fn(async () => () => {}),
}));

let statusCallback: ((msg: { text: string; severity: string; sequence?: number; timestamp_usec?: number }) => void) | null = null;

vi.mock("../../../calibration", () => ({
  requestPrearmChecks,
}));

vi.mock("../../../statustext", () => ({
  subscribeStatusText,
}));

import { usePrearmChecks } from "./use-prearm-checks";

describe("usePrearmChecks", () => {
  beforeEach(() => {
    requestPrearmChecks.mockReset();
    requestPrearmChecks.mockResolvedValue(undefined);
    subscribeStatusText.mockReset();
    statusCallback = null;
    subscribeStatusText.mockImplementation(async (...args: unknown[]) => {
      statusCallback = args[0] as typeof statusCallback;
      return () => {
        statusCallback = null;
      };
    });
  });

  it("auto-runs once per reset key when checks are supported", async () => {
    const { result, rerender } = renderHook(({ resetKey, connected }) =>
      usePrearmChecks({
        connected,
        canRequestChecks: true,
        preArmGood: false,
        resetKey,
      }),
    { initialProps: { resetKey: "veh-1:true", connected: true } });

    await waitFor(() => expect(requestPrearmChecks).toHaveBeenCalledTimes(1));

    rerender({ resetKey: "veh-1:true", connected: true });
    expect(requestPrearmChecks).toHaveBeenCalledTimes(1);

    rerender({ resetKey: "veh-1:false", connected: false });
    rerender({ resetKey: "veh-1:true", connected: true });

    await waitFor(() => expect(requestPrearmChecks).toHaveBeenCalledTimes(2));
    expect(result.current.hasChecked).toBe(true);
  });

  it("does not auto-run when the support capability is unavailable", async () => {
    renderHook(() => usePrearmChecks({
      connected: true,
      canRequestChecks: false,
      preArmGood: false,
      resetKey: "veh-2:true",
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestPrearmChecks).not.toHaveBeenCalled();
  });

  it("cleans up async status subscription after unmount before resolution", async () => {
    let resolveUnlisten: ((unlisten: () => void) => void) | null = null;
    const unlisten = vi.fn();
    subscribeStatusText.mockImplementation(
      () => new Promise<() => void>((resolve) => {
        resolveUnlisten = resolve;
      }),
    );

    const { unmount } = renderHook(() => usePrearmChecks({
      connected: false,
      canRequestChecks: false,
      preArmGood: false,
      resetKey: "veh-3:false",
    }));

    unmount();
    const resolveAsyncUnlisten = resolveUnlisten as ((unlisten: () => void) => void) | null;
    if (resolveAsyncUnlisten) {
      resolveAsyncUnlisten(unlisten);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("ingests both prearm and pre-arm blocker messages through the subscribed callback", async () => {
    const { result } = renderHook(() => usePrearmChecks({
      connected: false,
      canRequestChecks: false,
      preArmGood: false,
      resetKey: "veh-4:false",
    }));

    await waitFor(() => expect(subscribeStatusText).toHaveBeenCalledTimes(1));

    statusCallback?.({ text: "PreArm: GPS not healthy", severity: "warning" });
    statusCallback?.({ text: "Pre-Arm: GPS not healthy", severity: "warning" });

    await waitFor(() => expect(result.current.blockers).toHaveLength(1));
    expect(result.current.blockers[0]?.rawText).toBe("Pre-Arm: GPS not healthy");
  });
});

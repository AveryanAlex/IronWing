import { describe, expect, it, vi } from "vitest";

describe("attachAsyncListener", () => {
  it("cleans up listeners that resolve after teardown", async () => {
    const stop = vi.fn();
    let resolveListener: ((value: () => void) => void) | null = null;
    const subscribe = vi.fn(
      () => new Promise<() => void>((resolve) => {
        resolveListener = resolve;
      }),
    );

    const { attachAsyncListener } = await import("./async-listener");
    const cleanup = attachAsyncListener(subscribe);

    cleanup();
    expect(resolveListener).not.toBeNull();
    resolveListener!(stop);
    await Promise.resolve();

    expect(subscribe).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });
});

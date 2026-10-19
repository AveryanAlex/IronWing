import { describe, expect, it, vi } from "vitest";
import { subscribeListenerGroup } from "./listener-group";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("subscription groups", () => {
  it("disposes every listener exactly once", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const dispose = await subscribeListenerGroup([async () => first, async () => second]);
    dispose();
    dispose();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("cleans ready subscriptions and propagates the original failure promptly", async () => {
    const stop = vi.fn();
    const pending = deferred<() => void>();
    const error = new Error("event bridge unavailable");
    const group = subscribeListenerGroup([
      async () => stop,
      async () => { throw error; },
      () => pending.promise,
    ]);
    await expect(group).rejects.toBe(error);
    expect(stop).toHaveBeenCalledOnce();
    const lateStop = vi.fn();
    pending.resolve(lateStop);
    await Promise.resolve();
    expect(lateStop).toHaveBeenCalledOnce();
  });

  it("also releases subscriptions when a provider throws synchronously", async () => {
    const stop = vi.fn();
    const error = new Error("invalid event provider");
    await expect(subscribeListenerGroup([
      async () => stop,
      () => { throw error; },
    ])).rejects.toBe(error);
    expect(stop).toHaveBeenCalledOnce();
  });
});

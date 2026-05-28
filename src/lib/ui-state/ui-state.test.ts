import { describe, expect, it } from "vitest";
import { createUiStateStore } from "./ui-state";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem(k) {
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      data.set(k, v);
    },
    removeItem(k) {
      data.delete(k);
    },
    clear() {
      data.clear();
    },
    key() {
      return null;
    },
    get length() {
      return data.size;
    },
  } as Storage;
}

describe("createUiStateStore", () => {
  it("persists and reads overview follow selection", () => {
    const storage = fakeStorage();
    const store = createUiStateStore({ storage });

    store.setOverviewFollow("vehicle");
    expect(store.getOverviewFollow()).toBe("vehicle");

    const reloaded = createUiStateStore({ storage });
    expect(reloaded.getOverviewFollow()).toBe("vehicle");
  });

  it("falls back to no overview follow mode when the stored value is invalid", () => {
    const storage = fakeStorage();
    storage.setItem("ironwing.ui.overview.follow", JSON.stringify("garbage"));
    const store = createUiStateStore({ storage });
    expect(store.getOverviewFollow()).toBeNull();
  });
});

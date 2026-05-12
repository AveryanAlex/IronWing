import { describe, expect, it } from "vitest";
import { createUiStateStore } from "./ui-state";
import type { AppShellWorkspace } from "../../app/shell/app-shell-controller";

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
  it("persists and reads workspace selection", () => {
    const storage = fakeStorage();
    const store = createUiStateStore({ storage });

    store.setActiveWorkspace("mission");
    expect(store.getActiveWorkspace()).toBe("mission");

    const reloaded = createUiStateStore({ storage });
    expect(reloaded.getActiveWorkspace()).toBe("mission");
  });

  it("falls back to overview when stored workspace is invalid", () => {
    const storage = fakeStorage();
    storage.setItem("ironwing.ui.workspace", JSON.stringify("garbage" as AppShellWorkspace));
    const store = createUiStateStore({ storage });
    expect(store.getActiveWorkspace()).toBe("overview");
  });
});

import { describe, expect, it } from "vitest";
import { readIronwingJson, writeIronwingJson, ironwingKey } from "./ironwing-storage";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
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

describe("ironwing-storage", () => {
  it("prefixes keys with ironwing.", () => {
    expect(ironwingKey("workspace")).toBe("ironwing.workspace");
    expect(ironwingKey("ui.setup.section", "battery_monitor")).toBe(
      "ironwing.ui.setup.section.battery_monitor",
    );
  });

  it("round-trips JSON values", () => {
    const storage = fakeStorage();
    writeIronwingJson("ui.workspace", "mission", storage);
    expect(readIronwingJson<string>("ui.workspace", storage)).toBe("mission");
  });
});

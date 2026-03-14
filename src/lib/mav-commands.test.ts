import { describe, it, expect } from "vitest";
import { commandName, commandFullName, MAV_CMD } from "./mav-commands";

describe("commandName", () => {
  it("returns short name for known command", () => {
    expect(commandName(16)).toBe("Waypoint");
    expect(commandName(20)).toBe("RTL");
    expect(commandName(22)).toBe("Takeoff");
  });

  it("returns fallback for unknown command", () => {
    expect(commandName(99999)).toBe("CMD 99999");
  });
});

describe("commandFullName", () => {
  it("returns full name for known command", () => {
    expect(commandFullName(16)).toBe("NAV_WAYPOINT");
    expect(commandFullName(177)).toBe("DO_JUMP");
  });

  it("returns fallback for unknown command", () => {
    expect(commandFullName(99999)).toBe("MAV_CMD_99999");
  });
});

describe("MAV_CMD table", () => {
  it("has entries for all navigation commands", () => {
    expect(MAV_CMD[16]).toEqual({ name: "NAV_WAYPOINT", short: "Waypoint" });
    expect(MAV_CMD[17]).toEqual({ name: "NAV_LOITER_UNLIM", short: "Loiter" });
    expect(MAV_CMD[21]).toEqual({ name: "NAV_LAND", short: "Land" });
    expect(MAV_CMD[22]).toEqual({ name: "NAV_TAKEOFF", short: "Takeoff" });
  });

  it("has entries for fence and rally commands", () => {
    expect(MAV_CMD[5001]).toEqual({ name: "NAV_FENCE_RETURN_POINT", short: "Fence Return" });
    expect(MAV_CMD[5100]).toEqual({ name: "NAV_RALLY_POINT", short: "Rally Point" });
  });

  it("contains the current curated command set size", () => {
    expect(Object.keys(MAV_CMD)).toHaveLength(52);
  });

  it("uses only positive integer command IDs", () => {
    for (const key of Object.keys(MAV_CMD)) {
      const id = Number(key);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });

  it("all entries have both name and short fields", () => {
    for (const [, entry] of Object.entries(MAV_CMD)) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.short).toBe("string");
      expect(entry.short.length).toBeGreaterThan(0);
    }
  });

  it("returns distinct short and full names for known commands", () => {
    expect(commandName(16)).toBe("Waypoint");
    expect(commandFullName(16)).toBe("NAV_WAYPOINT");
    expect(commandName(16)).not.toBe(commandFullName(16));
  });
});

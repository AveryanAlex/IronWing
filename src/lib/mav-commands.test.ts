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
    expect(MAV_CMD[16]).toBeDefined();
    expect(MAV_CMD[17]).toBeDefined();
    expect(MAV_CMD[21]).toBeDefined();
    expect(MAV_CMD[22]).toBeDefined();
  });

  it("has entries for fence and rally commands", () => {
    expect(MAV_CMD[5001]).toBeDefined();
    expect(MAV_CMD[5100]).toBeDefined();
  });

  it("all entries have both name and short fields", () => {
    for (const [, entry] of Object.entries(MAV_CMD)) {
      expect(entry.name).toBeTruthy();
      expect(entry.short).toBeTruthy();
    }
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { getMockPlatformController, invokeMockCommand } from "./backend";

describe("mock backend firmware readiness defaults", () => {
  beforeEach(() => {
    getMockPlatformController().reset();
  });

  it("returns the full firmware_serial_readiness contract", async () => {
    await expect(invokeMockCommand("firmware_serial_readiness")).resolves.toEqual({
      can_start: true,
      session_ready: true,
      session_status: { kind: "idle" },
      blocked_reason: null,
      target_hint: null,
      validation_pending: false,
      bootloader_transition: { kind: "manual_bootloader_entry_required" },
    });
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { getMockPlatformController, invokeMockCommand } from "./backend";

describe("mock backend firmware readiness defaults", () => {
  beforeEach(() => {
    getMockPlatformController().reset();
  });

  it("returns the full firmware_serial_readiness contract", async () => {
    await expect(invokeMockCommand("firmware_serial_readiness")).resolves.toEqual({
      request_token: "mock:firmware_serial_readiness",
      session_status: { kind: "idle" },
      readiness: { kind: "advisory" },
      target_hint: null,
      validation_pending: false,
      bootloader_transition: { kind: "manual_bootloader_entry_required" },
    });
  });
});

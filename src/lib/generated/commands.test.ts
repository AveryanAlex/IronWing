import { describe, expect, it } from "vitest";

import { INVOKE_COMMAND_NAMES } from "./commands";

describe("generated invoke command catalog", () => {
  it("has unique command names and includes active wrapper commands", () => {
    expect(new Set(INVOKE_COMMAND_NAMES).size).toBe(INVOKE_COMMAND_NAMES.length);
    expect(INVOKE_COMMAND_NAMES).toEqual(
      expect.arrayContaining([
        "open_session_snapshot",
        "connect_link",
        "mission_upload",
        "mission_cancel",
        "param_download_all",
        "param_parse_file",
        "log_raw_messages_query",
        "firmware_bootloader_installation",
        "recording_settings_write",
      ]),
    );
  });
});

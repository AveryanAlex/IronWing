import { describe, expect, it } from "vitest";

import { COMMAND_PLATFORM_SUPPORT, INVOKE_COMMAND_NAMES } from "./commands";
import type { InvokeCommandMap } from "./commands";

type ExpectedCommandCount = keyof InvokeCommandMap;

describe("generated invoke command catalog", () => {
  it("has unique command names and includes active wrapper commands", () => {
    const _commandCountTypeCheck: ExpectedCommandCount | null = null;

    expect(new Set(INVOKE_COMMAND_NAMES).size).toBe(INVOKE_COMMAND_NAMES.length);
    expect(_commandCountTypeCheck).toBeNull();
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

  it("keeps platform support metadata aligned with command names", () => {
    expect(Object.keys(COMMAND_PLATFORM_SUPPORT)).toEqual(Array.from(INVOKE_COMMAND_NAMES));
  });
});

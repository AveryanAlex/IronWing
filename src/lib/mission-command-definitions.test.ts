import "../test/mission-codec";
import { describe, expect, it } from "vitest";
import { COMMAND_CATALOG } from "./mission-command-metadata";
import { defaultCommand } from "./mavkit-types";
import { exportMissionItem, parseSimpleItem } from "./mission-plan-io/simple-item-codec";

describe("editable command registry", () => {
  it("has unique wire IDs", () => {
    expect(new Set(COMMAND_CATALOG.map((entry) => entry.id)).size).toBe(COMMAND_CATALOG.length);
  });
  it.each(COMMAND_CATALOG)("round trips $category:$variant defaults through its wire codec", async (entry) => {
    const command = defaultCommand(entry.category, entry.variant);
    const exported = (await exportMissionItem({ command, autocontinue: true }, 0, []));
    expect(exported.command).toBe(entry.id);
    expect((await parseSimpleItem(exported, 0, [])).command).toEqual(command);
  });
});

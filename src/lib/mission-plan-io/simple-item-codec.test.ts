import { describe, expect, it } from "vitest";
import { parseSimpleItem, exportMissionItem } from "./simple-item-codec";
import type { QgcSimpleItem } from "./qgc-types";

describe("unsupported mission values", () => {
  it.each([99, -1, 0.5])("preserves unsupported enum index %s", (value) => {
    const input: QgcSimpleItem = { type: "SimpleItem", command: 178, frame: 2, autoContinue: false, params: [value, 12, 60, 0, 0, 0, 0] };
    const warnings: string[] = [];
    const parsed = parseSimpleItem(input, 0, warnings);
    expect(parsed.command).toHaveProperty("Other");
    expect(exportMissionItem(parsed, 0, [])).toMatchObject(input);
    expect(warnings.join(" ")).toContain("unsupported enum");
  });
  it.each([1, 2, 99])("preserves positional commands with unrepresentable frame %s", (frame) => {
    const input: QgcSimpleItem = { type: "SimpleItem", command: 16, frame, params: [1, 2, 3, 4, 47, 8, 120] };
    const parsed = parseSimpleItem(input, 0, []);
    expect(parsed.command).toHaveProperty("Other");
    expect(exportMissionItem(parsed, 0, [])).toMatchObject(input);
  });
  it("still decodes supported enum values", () => {
    expect(parseSimpleItem({ type: "SimpleItem", command: 178, frame: 2, params: [1, 12, 60, 0, 0, 0, 0] }, 0, []).command)
      .toMatchObject({ Do: { ChangeSpeed: { speed_type: "groundspeed" } } });
  });
});

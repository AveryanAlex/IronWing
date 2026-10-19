import { describe, expect, it } from "vitest";
import { parseSimpleItem, exportMissionItem } from "./simple-item-codec";
import type { QgcSimpleItem } from "./qgc-types";
import sdkFixtures from "../generated/mission-codec-fixtures.json";
import type { MissionItem } from "../mavkit-types";
import { toWireMissionPlan } from "../../mission";

describe("SDK mission command semantics", () => {
  it.each(sdkFixtures)("imports $name using the SDK meaning", ({ input, command }) => {
    const warnings: string[] = [];
    expect(parseSimpleItem(input as QgcSimpleItem, 0, warnings).command).toEqual(command);
    if (!("Other" in command)) expect(warnings).toEqual([]);
  });

  it.each(sdkFixtures)("exports $name using the SDK encoding", ({ input, command }) => {
    const item = { command, autocontinue: true } as MissionItem;
    expect(exportMissionItem(item, 0, [])).toMatchObject(input);
  });
});

describe("unsupported mission values", () => {
  it.each([-1, 0.5, 2])("preserves invalid pause/continue value %s", (value) => {
    const input: QgcSimpleItem = { type: "SimpleItem", command: 193, frame: 2, params: [value, 0, 0, 0, 0, 0, 0] };
    const parsed = parseSimpleItem(input, 0, []);
    expect(parsed.command).toHaveProperty("Other");
    expect(exportMissionItem(parsed, 0, [])).toMatchObject(input);
  });
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
    expect(parsed.command).toHaveProperty(frame === 2 ? "Other" : "QgcPassthrough");
    expect(exportMissionItem(parsed, 0, [])).toMatchObject(input);
  });
  it("still decodes supported enum values", () => {
    expect(parseSimpleItem({ type: "SimpleItem", command: 178, frame: 2, params: [1, 12, 60, 0, 0, 0, 0] }, 0, []).command)
      .toMatchObject({ Do: { ChangeSpeed: { speed_type: "groundspeed" } } });
  });
});


describe("QGC file and SDK coordinate boundary", () => {
  it.each([0, 3, 10])("converts unknown global commands in frame %s to integer wire coordinates", (frame) => {
    const input: QgcSimpleItem = { type: "SimpleItem", command: 60000, frame, params: [1, 2, 3, 4, 55.751244, 37.618423, 80] };
    const item = parseSimpleItem(input, 0, []);
    expect(toWireMissionPlan({ items: [item] }).items[0].command).toMatchObject({ Other: { x: 557512440, y: 376184230 } });
    expect(exportMissionItem(item, 0, [])).toMatchObject(input);
  });

  it.each([1, 99])("preserves frame %s as distinct file content and refuses to send it to Rust", (frame) => {
    const input: QgcSimpleItem = { type: "SimpleItem", command: 16, frame, params: [1, 2, 3, 4, 55.751244, 37.618423, 80] };
    const item = parseSimpleItem(input, 0, []);
    expect(item.command).toEqual({ QgcPassthrough: input });
    expect(exportMissionItem(item, 0, [])).toMatchObject(input);
    expect(() => toWireMissionPlan({ items: [item] })).toThrow("preserved file content");
  });

  it("rejects fractional raw wire coordinates even for manually constructed items", () => {
    const item = parseSimpleItem({ type: "SimpleItem", command: 60000, frame: 0, params: [0, 0, 0, 0, 55, 37, 80] }, 0, []);
    if (!("Other" in item.command)) throw new Error("expected raw SDK command");
    item.command.Other.x = 55.5;
    expect(() => toWireMissionPlan({ items: [item] })).toThrow("integer wire x/y");
  });
});

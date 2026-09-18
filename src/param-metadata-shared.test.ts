// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import xml from "../tests/fixtures/parameter-metadata.xml?raw";
import { parseMetadataXml } from "./param-metadata";

describe("metadata contract shared with the MCP backend", () => {
  it("keeps vehicle precedence, units, ranges, flags and text options", () => {
    const metadata = parseMetadataXml(xml);
    expect(metadata.get("BARO_TEST")).toMatchObject({
      humanName: "Barometer offset", range: { min: -100, max: 100 }, increment: 0.1,
      units: "Pa", unitText: "pascals", rebootRequired: true, readOnly: false,
      values: [{ code: 0, label: "Disabled" }, { code: 1, label: "Enabled" }],
      bitmask: [{ bit: 0, label: "Primary" }, { bit: 2, label: "Secondary" }],
    });
    expect(metadata.get("TEXT_TEST")?.values).toEqual([{ code: 0, label: "Off" }, { code: 1, label: "On" }]);
    expect(metadata.get("TEXT_TEST")?.increment).toBeUndefined();
  });
});

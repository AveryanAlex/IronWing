import { describe, expect, it } from "vitest";

import { detectBooleanEnumOptions } from "./boolean-enum";

describe("detectBooleanEnumOptions", () => {
  it("detects normal enabled disabled enums", () => {
    expect(detectBooleanEnumOptions([
      { code: 0, label: "Disabled" },
      { code: 1, label: "Enabled" },
    ])).toMatchObject({
      off: { code: 0, label: "Disabled" },
      on: { code: 1, label: "Enabled" },
    });
  });

  it("accepts enabled labels with qualifiers", () => {
    expect(detectBooleanEnumOptions([
      { code: 1, label: "Enabled always" },
      { code: 0, label: "Disabled" },
    ])?.on.label).toBe("Enabled always");
  });

  it("rejects two-value 0/1 enums that are not boolean controls", () => {
    expect(detectBooleanEnumOptions([
      { code: 0, label: "Relative to Home" },
      { code: 1, label: "Terrain" },
    ])).toBeNull();
    expect(detectBooleanEnumOptions([
      { code: 0, label: "First battery" },
      { code: 1, label: "Second battery" },
    ])).toBeNull();
  });

  it("rejects enums with extra choices", () => {
    expect(detectBooleanEnumOptions([
      { code: 0, label: "Disabled" },
      { code: 1, label: "Enabled" },
      { code: 2, label: "Auto" },
    ])).toBeNull();
  });
});

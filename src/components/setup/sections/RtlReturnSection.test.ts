import { describe, it, expect } from "vitest";
import {
  toDisplayValue,
  toRawValue,
  formatDisplayValue,
} from "./RtlReturnSection";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

const COPTER_RTL_DOCS_URL = resolveDocsUrl("rtl_mode", "copter")!;
const PLANE_RTL_DOCS_URL = resolveDocsUrl("rtl_mode", "plane")!;

describe("toDisplayValue", () => {
  it("converts cm to m (factor 100)", () => {
    expect(toDisplayValue(1500, 100)).toBe(15);
  });

  it("converts cm/s to m/s (factor 100)", () => {
    expect(toDisplayValue(500, 100)).toBe(5);
  });

  it("converts ms to s (factor 1000)", () => {
    expect(toDisplayValue(5000, 1000)).toBe(5);
  });

  it("handles zero", () => {
    expect(toDisplayValue(0, 100)).toBe(0);
  });

  it("handles fractional results", () => {
    expect(toDisplayValue(1550, 100)).toBe(15.5);
  });

  it("handles negative values", () => {
    expect(toDisplayValue(-100, 100)).toBe(-1);
  });
});

describe("toRawValue", () => {
  it("converts m to cm (factor 100)", () => {
    expect(toRawValue(15, 100)).toBe(1500);
  });

  it("converts m/s to cm/s (factor 100)", () => {
    expect(toRawValue(5, 100)).toBe(500);
  });

  it("converts s to ms (factor 1000)", () => {
    expect(toRawValue(5, 1000)).toBe(5000);
  });

  it("rounds to nearest integer to avoid floating point drift", () => {
    expect(toRawValue(15.55, 100)).toBe(1555);
  });

  it("handles zero", () => {
    expect(toRawValue(0, 100)).toBe(0);
  });

  it("handles fractional display values", () => {
    expect(toRawValue(0.5, 1000)).toBe(500);
  });
});

describe("toDisplayValue / toRawValue roundtrip", () => {
  const cases = [
    { raw: 1500, factor: 100 },
    { raw: 0, factor: 100 },
    { raw: 500, factor: 100 },
    { raw: 5000, factor: 1000 },
    { raw: 1550, factor: 100 },
  ];

  for (const { raw, factor } of cases) {
    it(`roundtrips raw=${raw} factor=${factor}`, () => {
      expect(toRawValue(toDisplayValue(raw, factor), factor)).toBe(raw);
    });
  }
});

describe("formatDisplayValue", () => {
  it("formats altitude with 2 decimal places", () => {
    expect(formatDisplayValue(15, 2)).toBe("15.00");
  });

  it("formats fractional altitude with 2 decimal places", () => {
    expect(formatDisplayValue(15.5, 2)).toBe("15.50");
  });

  it("truncates excess decimals", () => {
    expect(formatDisplayValue(15.556, 2)).toBe("15.56");
  });

  it("formats speed with 2 decimal places", () => {
    expect(formatDisplayValue(5, 2)).toBe("5.00");
  });

  it("formats loiter time with 1 decimal place", () => {
    expect(formatDisplayValue(5, 1)).toBe("5.0");
  });

  it("formats fractional loiter time with 1 decimal place", () => {
    expect(formatDisplayValue(5.5, 1)).toBe("5.5");
  });

  it("formats with 0 decimal places", () => {
    expect(formatDisplayValue(-1, 0)).toBe("-1");
  });

  it("formats zero correctly", () => {
    expect(formatDisplayValue(0, 2)).toBe("0.00");
  });
});

describe("formatDisplayValue integration with conversion", () => {
  it("altitude: 1500 cm → '15.00' m", () => {
    expect(formatDisplayValue(toDisplayValue(1500, 100), 2)).toBe("15.00");
  });

  it("altitude: 1550 cm → '15.50' m", () => {
    expect(formatDisplayValue(toDisplayValue(1550, 100), 2)).toBe("15.50");
  });

  it("speed: 500 cm/s → '5.00' m/s", () => {
    expect(formatDisplayValue(toDisplayValue(500, 100), 2)).toBe("5.00");
  });

  it("loiter: 5000 ms → '5.0' s", () => {
    expect(formatDisplayValue(toDisplayValue(5000, 1000), 1)).toBe("5.0");
  });

  it("loiter: 5500 ms → '5.5' s", () => {
    expect(formatDisplayValue(toDisplayValue(5500, 1000), 1)).toBe("5.5");
  });

  it("sentinel -1 formatted with 0 decimals", () => {
    expect(formatDisplayValue(-1, 0)).toBe("-1");
  });
});

describe("RTL docs URLs", () => {
  it("copter URL points to ardupilot.org copter docs", () => {
    expect(COPTER_RTL_DOCS_URL).toBe(
      "https://ardupilot.org/copter/docs/rtl-mode.html",
    );
  });

  it("plane URL points to ardupilot.org plane docs", () => {
    expect(PLANE_RTL_DOCS_URL).toBe(
      "https://ardupilot.org/plane/docs/rtl-mode.html",
    );
  });
});

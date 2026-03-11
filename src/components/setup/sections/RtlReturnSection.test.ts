import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  toDisplayValue,
  toRawValue,
  formatDisplayValue,
} from "./RtlReturnSection";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

const COPTER_RTL_DOCS_URL = resolveDocsUrl("rtl_mode", "copter")!;
const PLANE_RTL_DOCS_URL = resolveDocsUrl("rtl_mode", "plane")!;

const SECTION_SRC = readFileSync(
  resolve(__dirname, "RtlReturnSection.tsx"),
  "utf-8",
);

// ---------------------------------------------------------------------------
// Unit conversion — pure logic
// ---------------------------------------------------------------------------

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
    // 15.55 * 100 = 1554.9999... in IEEE 754
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

// ---------------------------------------------------------------------------
// Display formatting — fixed decimal precision
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Docs URLs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Structural contract: ConversionHint removed
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — ConversionHint removed", () => {
  it("does not contain ConversionHint component", () => {
    expect(SECTION_SRC).not.toMatch(/ConversionHint/);
  });

  it("does not contain old hint helper functions", () => {
    expect(SECTION_SRC).not.toMatch(/cmToMHint/);
    expect(SECTION_SRC).not.toMatch(/cmpsToMpsHint/);
    expect(SECTION_SRC).not.toMatch(/msToSHint/);
  });

  it("does not show raw cm/cms/ms units to the user", () => {
    // The old code had unit="cm", unit="cm/s", unit="ms" on inputs
    // New code should not pass raw ArduPilot units to any input
    expect(SECTION_SRC).not.toMatch(/unit="cm"/);
    expect(SECTION_SRC).not.toMatch(/unit="cm\/s"/);
    expect(SECTION_SRC).not.toMatch(/unit="ms"/);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: ScaledParamInput with display units
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — scaled inputs", () => {
  it("defines ScaledParamInput local component", () => {
    expect(SECTION_SRC).toMatch(/function ScaledParamInput/);
  });

  it("uses ScaledParamInput for copter altitude params", () => {
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="RTL_ALT"/,
    );
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="RTL_ALT_FINAL"/,
    );
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="RTL_CLIMB_MIN"/,
    );
  });

  it("uses ScaledParamInput for copter speed and timing params", () => {
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="RTL_SPEED"/,
    );
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="RTL_LOIT_TIME"/,
    );
  });

  it("uses ScaledParamInput for plane altitude param", () => {
    expect(SECTION_SRC).toMatch(
      /ScaledParamInput[\s\S]*?paramName="ALT_HOLD_RTL"/,
    );
  });

  it("shows meters as display unit for altitude params", () => {
    expect(SECTION_SRC).toMatch(/displayUnit="m"/);
  });

  it("shows m/s as display unit for speed params", () => {
    expect(SECTION_SRC).toMatch(/displayUnit="m\/s"/);
  });

  it("shows seconds as display unit for timing params", () => {
    expect(SECTION_SRC).toMatch(/displayUnit="s"/);
  });

  it("stages raw values via toRawValue in onChange", () => {
    expect(SECTION_SRC).toMatch(/toRawValue/);
  });

  it("displays converted values via toDisplayValue", () => {
    expect(SECTION_SRC).toMatch(/toDisplayValue/);
  });

  it("uses formatDisplayValue instead of raw String() for display", () => {
    expect(SECTION_SRC).toMatch(/formatDisplayValue/);
    expect(SECTION_SRC).not.toMatch(/String\(displayValue\)/);
  });

  it("ScaledParamInput accepts decimals prop with default of 2", () => {
    expect(SECTION_SRC).toMatch(/decimals\?:\s*number/);
    expect(SECTION_SRC).toMatch(/decimals\s*=\s*2/);
  });

  it("loiter time uses decimals={1}", () => {
    const loiterBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf('paramName="RTL_LOIT_TIME"'),
      SECTION_SRC.indexOf('paramName="RTL_LOIT_TIME"') + 300,
    );
    expect(loiterBlock).toMatch(/decimals=\{1\}/);
  });

  it("altitude params use default decimals (no explicit prop needed)", () => {
    const altBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf('paramName="RTL_ALT"'),
      SECTION_SRC.indexOf('paramName="RTL_ALT"') + 200,
    );
    expect(altBlock).not.toMatch(/decimals=/);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: RTL_CLIMB_MIN uses factor=1 (native meters)
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — RTL_CLIMB_MIN factor", () => {
  it("RTL_CLIMB_MIN uses factor={1} (param is already in meters)", () => {
    const climbIdx = SECTION_SRC.indexOf('paramName="RTL_CLIMB_MIN"');
    expect(climbIdx).toBeGreaterThan(-1);
    const climbBlock = SECTION_SRC.slice(climbIdx, climbIdx + 300);
    expect(climbBlock).toMatch(/factor=\{1\}/);
  });

  it("RTL_CLIMB_MIN does NOT use factor={100} (old cm bug)", () => {
    const climbIdx = SECTION_SRC.indexOf('paramName="RTL_CLIMB_MIN"');
    const climbBlock = SECTION_SRC.slice(climbIdx, climbIdx + 300);
    expect(climbBlock).not.toMatch(/factor=\{100\}/);
  });

  it("factor=1 means display value equals raw value", () => {
    expect(toDisplayValue(10, 1)).toBe(10);
    expect(toRawValue(10, 1)).toBe(10);
  });

  it("factor=1 roundtrips without scaling", () => {
    const raw = 15;
    expect(toRawValue(toDisplayValue(raw, 1), 1)).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: sentinel for plane ALT_HOLD_RTL
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — sentinel handling", () => {
  it("ScaledParamInput supports sentinel prop", () => {
    expect(SECTION_SRC).toMatch(/sentinel\??:\s*number/);
  });

  it("plane ALT_HOLD_RTL uses sentinel={-1}", () => {
    const planeSection = SECTION_SRC.slice(
      SECTION_SRC.indexOf("Plane RTL Configuration"),
    );
    expect(planeSection).toMatch(/sentinel=\{-1\}/);
  });

  it("sentinel bypasses conversion for both display and staging", () => {
    // The component should check sentinel in both display and onChange
    expect(SECTION_SRC).toMatch(/rawValue === sentinel/);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: docs link and helper text
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — docs and guidance", () => {
  it("resolves RTL docs via the docs registry", () => {
    expect(SECTION_SRC).toContain('resolveDocsUrl("rtl_mode"');
  });

  it("uses DocsLink or resolveDocsUrl for docs links", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl|DocsLink/);
  });

  it("has 'How RTL works' link text", () => {
    expect(SECTION_SRC).toMatch(/How RTL works/);
  });

  it("mentions home GPS location context for copter", () => {
    expect(SECTION_SRC).toMatch(/GPS.*arm/i);
  });

  it("includes rally point note", () => {
    expect(SECTION_SRC).toMatch(/rally point/i);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: copter/plane branching preserved
// ---------------------------------------------------------------------------

describe("RtlReturnSection structural — vehicle branching", () => {
  it("retains isPlane helper (imported from shared)", () => {
    expect(SECTION_SRC).toMatch(/isPlaneVehicleType as isPlane/);
  });

  it("has copter-specific section gated on !plane", () => {
    expect(SECTION_SRC).toMatch(/!plane/);
  });

  it("has plane-specific section gated on plane", () => {
    expect(SECTION_SRC).toMatch(/\{plane\s*&&/);
  });

  it("retains RTL_ALT zero warning for copter", () => {
    expect(SECTION_SRC).toMatch(/AlertTriangle/);
    expect(SECTION_SRC).toMatch(/too low for obstacles/);
  });

  it("retains plane autoland options", () => {
    expect(SECTION_SRC).toMatch(/PLANE_RTL_AUTOLAND_OPTIONS/);
    expect(SECTION_SRC).toMatch(/RTL_AUTOLAND/);
    expect(SECTION_SRC).toMatch(/DO_LAND_START/);
  });

  it("retains no-vehicle fallback", () => {
    expect(SECTION_SRC).toMatch(/!vehicleState/);
    expect(SECTION_SRC).toMatch(/Connect to a vehicle/);
  });
});

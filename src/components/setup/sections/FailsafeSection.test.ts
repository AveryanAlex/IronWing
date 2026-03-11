import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  buildDefaultsPreview,
  FAILSAFE_DEFAULTS_COPTER,
  FAILSAFE_DEFAULTS_PLANE,
  COPTER_RADIO_FS_OPTIONS,
  COPTER_GCS_FS_OPTIONS,
  COPTER_BATTERY_FS_OPTIONS,
} from "./FailsafeSection";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamStore } from "../../../params";

const SECTION_SRC = readFileSync(resolve(__dirname, "FailsafeSection.tsx"), "utf-8");

function makeStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let i = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: i++ };
  }
  return { params, expected_count: i };
}

function makeParams(overrides: Partial<ParamInputParams> = {}): ParamInputParams {
  return {
    store: null,
    staged: new Map(),
    metadata: null,
    stage: () => {},
    ...overrides,
  };
}

describe("FAILSAFE_DEFAULTS tables", () => {
  it("copter defaults include all expected params", () => {
    const names = FAILSAFE_DEFAULTS_COPTER.map((d) => d.paramName);
    expect(names).toContain("FS_THR_ENABLE");
    expect(names).toContain("FS_EKF_ACTION");
    expect(names).toContain("BATT_FS_LOW_ACT");
    expect(names).toContain("BATT_FS_CRT_ACT");
    expect(names).toContain("FS_CRASH_CHECK");
  });

  it("copter defaults do NOT include FS_GCS_ENABLE (removed per product decision)", () => {
    const names = FAILSAFE_DEFAULTS_COPTER.map((d) => d.paramName);
    expect(names).not.toContain("FS_GCS_ENABLE");
  });

  it("plane defaults include all expected params", () => {
    const names = FAILSAFE_DEFAULTS_PLANE.map((d) => d.paramName);
    expect(names).toContain("THR_FAILSAFE");
    expect(names).toContain("BATT_FS_LOW_ACT");
    expect(names).toContain("BATT_FS_CRT_ACT");
  });

  it("plane defaults do not include copter-only params", () => {
    const names = FAILSAFE_DEFAULTS_PLANE.map((d) => d.paramName);
    expect(names).not.toContain("FS_THR_ENABLE");
    expect(names).not.toContain("FS_GCS_ENABLE");
    expect(names).not.toContain("FS_EKF_ACTION");
    expect(names).not.toContain("FS_CRASH_CHECK");
  });

  it("plane defaults do NOT include FS_LONG_ACTN (GCS long failsafe removed)", () => {
    const names = FAILSAFE_DEFAULTS_PLANE.map((d) => d.paramName);
    expect(names).not.toContain("FS_LONG_ACTN");
  });

  it("BATT_FS_LOW_ACT defaults to 2 (RTL) in both tables", () => {
    const copterLow = FAILSAFE_DEFAULTS_COPTER.find((d) => d.paramName === "BATT_FS_LOW_ACT")!;
    const planeLow = FAILSAFE_DEFAULTS_PLANE.find((d) => d.paramName === "BATT_FS_LOW_ACT")!;
    expect(copterLow.value).toBe(2);
    expect(planeLow.value).toBe(2);
  });

  it("BATT_FS_CRT_ACT defaults to 1 (Land) in both tables", () => {
    const copterCrt = FAILSAFE_DEFAULTS_COPTER.find((d) => d.paramName === "BATT_FS_CRT_ACT")!;
    const planeCrt = FAILSAFE_DEFAULTS_PLANE.find((d) => d.paramName === "BATT_FS_CRT_ACT")!;
    expect(copterCrt.value).toBe(1);
    expect(planeCrt.value).toBe(1);
  });

  it("BATT_FS_LOW_ACT is NOT 1 (that would be Land, not RTL)", () => {
    const copterLow = FAILSAFE_DEFAULTS_COPTER.find((d) => d.paramName === "BATT_FS_LOW_ACT")!;
    expect(copterLow.value).not.toBe(1);
  });

  it("BATT_FS_CRT_ACT is NOT 3 (that would be SmartRTL, not Land)", () => {
    const copterCrt = FAILSAFE_DEFAULTS_COPTER.find((d) => d.paramName === "BATT_FS_CRT_ACT")!;
    expect(copterCrt.value).not.toBe(3);
  });

  it("all defaults have non-empty label", () => {
    for (const d of [...FAILSAFE_DEFAULTS_COPTER, ...FAILSAFE_DEFAULTS_PLANE]) {
      expect(d.label.length).toBeGreaterThan(0);
    }
  });
});

describe("buildDefaultsPreview", () => {
  it("returns all copter defaults when no params loaded (store=null)", () => {
    const params = makeParams();
    const preview = buildDefaultsPreview(false, params);
    expect(preview).toHaveLength(FAILSAFE_DEFAULTS_COPTER.length);
    for (const entry of preview) {
      expect(entry.willChange).toBe(true);
      expect(entry.currentValue).toBeNull();
    }
  });

  it("returns plane defaults when isPlane=true", () => {
    const params = makeParams();
    const preview = buildDefaultsPreview(true, params);
    expect(preview).toHaveLength(FAILSAFE_DEFAULTS_PLANE.length);
    const names = preview.map((e) => e.paramName);
    expect(names).toContain("THR_FAILSAFE");
    expect(names).not.toContain("FS_THR_ENABLE");
  });

  it("marks willChange=false when current value already matches default", () => {
    const params = makeParams({
      store: makeStore({
        FS_THR_ENABLE: 1,
        FS_EKF_ACTION: 1,
        BATT_FS_LOW_ACT: 2,
        BATT_FS_CRT_ACT: 1,
        FS_CRASH_CHECK: 1,
      }),
    });
    const preview = buildDefaultsPreview(false, params);
    const thrEntry = preview.find((e) => e.paramName === "FS_THR_ENABLE")!;
    expect(thrEntry.willChange).toBe(false);
    expect(thrEntry.currentValue).toBe(1);
  });

  it("uses staged value over store value for current", () => {
    const params = makeParams({
      store: makeStore({ FS_THR_ENABLE: 0 }),
      staged: new Map([["FS_THR_ENABLE", 1]]),
    });
    const preview = buildDefaultsPreview(false, params);
    const thrEntry = preview.find((e) => e.paramName === "FS_THR_ENABLE")!;
    expect(thrEntry.willChange).toBe(false);
    expect(thrEntry.currentValue).toBe(1);
  });

  it("reports change count correctly", () => {
    const params = makeParams({
      store: makeStore({
        FS_THR_ENABLE: 1,
        FS_EKF_ACTION: 1,
        BATT_FS_LOW_ACT: 2,
        BATT_FS_CRT_ACT: 1,
        FS_CRASH_CHECK: 1,
      }),
    });
    const preview = buildDefaultsPreview(false, params);
    const changeCount = preview.filter((e) => e.willChange).length;
    expect(changeCount).toBe(0);
  });

  it("includes BATT_FS_CRT_ACT in preview with correct default", () => {
    const params = makeParams({
      store: makeStore({ BATT_FS_CRT_ACT: 0 }),
    });
    const preview = buildDefaultsPreview(false, params);
    const crtEntry = preview.find((e) => e.paramName === "BATT_FS_CRT_ACT")!;
    expect(crtEntry).toBeDefined();
    expect(crtEntry.newValue).toBe(1);
    expect(crtEntry.willChange).toBe(true);
  });

  it("includes BATT_FS_LOW_ACT in preview with correct default", () => {
    const params = makeParams({
      store: makeStore({ BATT_FS_LOW_ACT: 0 }),
    });
    const preview = buildDefaultsPreview(false, params);
    const lowEntry = preview.find((e) => e.paramName === "BATT_FS_LOW_ACT")!;
    expect(lowEntry).toBeDefined();
    expect(lowEntry.newValue).toBe(2);
    expect(lowEntry.willChange).toBe(true);
  });
});

describe("COPTER_RADIO_FS_OPTIONS matches official ArduPilot FS_THR_ENABLE mapping", () => {
  const byValue = Object.fromEntries(COPTER_RADIO_FS_OPTIONS.map((o) => [o.value, o.label]));

  it("includes all values 0-7", () => {
    for (let v = 0; v <= 7; v++) {
      expect(byValue[v]).toBeDefined();
    }
  });

  it("value 0 = Disabled", () => expect(byValue[0]).toBe("Disabled"));
  it("value 1 = RTL", () => expect(byValue[1]).toBe("RTL"));
  it("value 2 = Continue Mission (Auto)", () => expect(byValue[2]).toMatch(/Continue.*Auto/));
  it("value 3 = Land", () => expect(byValue[3]).toBe("Land"));
  it("value 5 = SmartRTL → Land", () => expect(byValue[5]).toMatch(/SmartRTL.*Land/));
  it("value 7 = Brake → Land", () => expect(byValue[7]).toMatch(/Brake.*Land/));
});

describe("COPTER_GCS_FS_OPTIONS matches official ArduPilot FS_GCS_ENABLE mapping", () => {
  const byValue = Object.fromEntries(COPTER_GCS_FS_OPTIONS.map((o) => [o.value, o.label]));

  it("includes all values 0-7", () => {
    for (let v = 0; v <= 7; v++) {
      expect(byValue[v]).toBeDefined();
    }
  });

  it("value 0 = Disabled", () => expect(byValue[0]).toBe("Disabled"));
  it("value 1 = RTL", () => expect(byValue[1]).toBe("RTL"));
  it("value 2 = Continue Mission (Auto)", () => expect(byValue[2]).toMatch(/Continue.*Auto/));
  it("value 5 = Land", () => expect(byValue[5]).toBe("Land"));
  it("value 6 = Auto DO_LAND_START → RTL", () => expect(byValue[6]).toMatch(/DO_LAND_START.*RTL/));
  it("value 7 = Brake → Land", () => expect(byValue[7]).toMatch(/Brake.*Land/));
});

describe("COPTER_BATTERY_FS_OPTIONS matches official ArduPilot BATT_FS_*_ACT mapping", () => {
  const byValue = Object.fromEntries(COPTER_BATTERY_FS_OPTIONS.map((o) => [o.value, o.label]));

  it("includes all values 0-7", () => {
    for (let v = 0; v <= 7; v++) {
      expect(byValue[v]).toBeDefined();
    }
  });

  it("value 0 = Warn Only", () => expect(byValue[0]).toBe("Warn Only"));
  it("value 1 = Land", () => expect(byValue[1]).toBe("Land"));
  it("value 2 = RTL", () => expect(byValue[2]).toBe("RTL"));
  it("value 3 = SmartRTL → RTL", () => expect(byValue[3]).toMatch(/SmartRTL.*RTL/));
  it("value 4 = SmartRTL → Land", () => expect(byValue[4]).toMatch(/SmartRTL.*Land/));
  it("value 5 = Terminate (marked dangerous)", () => expect(byValue[5]).toMatch(/Terminate/));
  it("value 6 = Auto DO_LAND_START → RTL", () => expect(byValue[6]).toMatch(/DO_LAND_START.*RTL/));
  it("value 7 = Brake → Land", () => expect(byValue[7]).toMatch(/Brake.*Land/));
});

describe("FailsafeSection structural contract — shared primitives", () => {
  it("uses SetupSectionIntro for the section intro", () => {
    expect(SECTION_SRC).toMatch(/import.*SetupSectionIntro.*from.*shared\/SetupSectionIntro/);
    expect(SECTION_SRC).toMatch(/<SetupSectionIntro/);
  });

  it("uses SectionCardHeader for card headers", () => {
    expect(SECTION_SRC).toMatch(/import.*SectionCardHeader.*from.*shared\/SectionCardHeader/);
    expect(SECTION_SRC).toMatch(/<SectionCardHeader/);
  });

  it("uses PreviewStagePanel for the defaults preview", () => {
    expect(SECTION_SRC).toMatch(/import.*PreviewStagePanel.*from.*shared\/PreviewStagePanel/);
    expect(SECTION_SRC).toMatch(/<PreviewStagePanel/);
  });

  it("does NOT contain the old DefaultsPreviewPanel local component", () => {
    expect(SECTION_SRC).not.toMatch(/function DefaultsPreviewPanel/);
  });

  it("uses resolveDocsUrl from the centralized docs registry", () => {
    expect(SECTION_SRC).toMatch(/import.*resolveDocsUrl.*from.*ardupilot-docs/);
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\(/);
  });

  it("does NOT hardcode BATTERY_DOCS_URL", () => {
    expect(SECTION_SRC).not.toMatch(/BATTERY_DOCS_URL/);
  });
});

describe("FailsafeSection structural contract — defaults preview", () => {
  it("does NOT immediately call applyDefaults on button click", () => {
    const headerBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf("Apply Recommended Defaults"),
      SECTION_SRC.indexOf("Radio Failsafe"),
    );
    expect(headerBlock).not.toMatch(/onClick=\{[^}]*applyDefaults/);
    expect(headerBlock).toMatch(/defaultsPreviewOpen|setDefaultsPreviewOpen/);
  });

  it("renders PreviewStagePanel when preview is open", () => {
    expect(SECTION_SRC).toMatch(/PreviewStagePanel/);
    expect(SECTION_SRC).toMatch(/defaultsPreviewOpen/);
  });

  it("PreviewStagePanel has onStage and onCancel callbacks", () => {
    expect(SECTION_SRC).toMatch(/onStage=/);
    expect(SECTION_SRC).toMatch(/onCancel=/);
  });

  it("calls buildDefaultsPreview", () => {
    expect(SECTION_SRC).toMatch(/buildDefaultsPreview\(/);
  });
});

describe("FailsafeSection structural contract — clickable preview rows", () => {
  it("accepts navigateToParam prop", () => {
    expect(SECTION_SRC).toMatch(/navigateToParam\?.*:\s*\(paramName:\s*string\)\s*=>\s*void/);
  });

  it("wires onRowClick to navigateToParam", () => {
    expect(SECTION_SRC).toMatch(/onRowClick=/);
    expect(SECTION_SRC).toMatch(/navigateToParam/);
  });

  it("preview rows have human-friendly label and raw paramName", () => {
    expect(SECTION_SRC).toMatch(/label:\s*entry\.label/);
    expect(SECTION_SRC).toMatch(/paramName:\s*entry\.paramName/);
  });
});

describe("FailsafeSection structural contract — battery card", () => {
  it("uses SectionCardHeader with battery docs from registry", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_battery"/);
  });

  it("includes escalation helper text about LOW vs CRITICAL", () => {
    expect(SECTION_SRC).toMatch(/Low.*RTL.*Critical.*Land/is);
  });

  it("includes reboot/safety note about battery failsafe", () => {
    expect(SECTION_SRC).toMatch(/reboot/i);
  });
});

describe("FailsafeSection structural contract — per-card docs links", () => {
  it("resolves radio failsafe docs", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_radio"/);
  });

  it("resolves GCS failsafe docs", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_gcs"/);
  });

  it("resolves EKF failsafe docs", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_ekf"/);
  });

  it("resolves crash detection docs", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_crash_check"/);
  });

  it("resolves section-level failsafe landing page docs", () => {
    expect(SECTION_SRC).toMatch(/resolveDocsUrl\("failsafe_landing_page"/);
  });
});

describe("FailsafeSection structural contract — layout", () => {
  it("does not have empty placeholder divs for spacing", () => {
    const batterySection = SECTION_SRC.slice(
      SECTION_SRC.indexOf("Battery Failsafe"),
      SECTION_SRC.indexOf("GCS Failsafe"),
    );
    const emptyDivCount = (batterySection.match(/<div\s*\/>/g) || []).length;
    expect(emptyDivCount).toBe(0);
  });
});

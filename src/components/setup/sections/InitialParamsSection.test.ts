import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  computeTriState,
  toggleGroup,
  toggleItem,
  selectAll,
  selectNone,
} from "./initial-params-selection";
import { isPlane, hasQuadPlaneParams } from "./InitialParamsSection";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

const SECTION_SRC = readFileSync(resolve(__dirname, "InitialParamsSection.tsx"), "utf-8");

// ---------------------------------------------------------------------------
// computeTriState
// ---------------------------------------------------------------------------

describe("computeTriState", () => {
  it("returns 'none' for empty items list", () => {
    expect(computeTriState([], new Set(["a"]))).toBe("none");
  });

  it("returns 'none' when no items are selected", () => {
    expect(computeTriState(["a", "b", "c"], new Set())).toBe("none");
  });

  it("returns 'all' when every item is selected", () => {
    expect(computeTriState(["a", "b"], new Set(["a", "b"]))).toBe("all");
  });

  it("returns 'some' when partially selected", () => {
    expect(computeTriState(["a", "b", "c"], new Set(["b"]))).toBe("some");
  });

  it("ignores extra items in selected that aren't in the items list", () => {
    expect(computeTriState(["a", "b"], new Set(["a", "b", "z"]))).toBe("all");
  });
});

// ---------------------------------------------------------------------------
// toggleGroup
// ---------------------------------------------------------------------------

describe("toggleGroup", () => {
  const group = ["a", "b", "c"];

  it("selects all in group when none are selected", () => {
    const result = toggleGroup(group, new Set());
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("selects all in group when some are selected", () => {
    const result = toggleGroup(group, new Set(["a"]));
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("deselects all in group when all are selected", () => {
    const result = toggleGroup(group, new Set(["a", "b", "c"]));
    expect(result).toEqual(new Set());
  });

  it("preserves items outside the group", () => {
    const result = toggleGroup(group, new Set(["a", "b", "c", "x", "y"]));
    expect(result).toEqual(new Set(["x", "y"]));
  });

  it("preserves items outside group when selecting all", () => {
    const result = toggleGroup(group, new Set(["x"]));
    expect(result).toEqual(new Set(["a", "b", "c", "x"]));
  });
});

// ---------------------------------------------------------------------------
// toggleItem
// ---------------------------------------------------------------------------

describe("toggleItem", () => {
  it("adds an unselected item", () => {
    const result = toggleItem("b", new Set(["a"]));
    expect(result).toEqual(new Set(["a", "b"]));
  });

  it("removes a selected item", () => {
    const result = toggleItem("a", new Set(["a", "b"]));
    expect(result).toEqual(new Set(["b"]));
  });

  it("returns a new Set (immutable)", () => {
    const original = new Set(["a"]);
    const result = toggleItem("a", original);
    expect(original.has("a")).toBe(true);
    expect(result.has("a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectAll / selectNone
// ---------------------------------------------------------------------------

describe("selectAll", () => {
  it("returns set with all items", () => {
    expect(selectAll(["a", "b", "c"])).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns empty set for empty input", () => {
    expect(selectAll([])).toEqual(new Set());
  });
});

describe("selectNone", () => {
  it("returns genuinely empty set", () => {
    const result = selectNone();
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Regression: empty set must NOT mean "all selected"
// ---------------------------------------------------------------------------

describe("empty-set-is-none regression", () => {
  it("computeTriState treats empty selected as 'none', not 'all'", () => {
    const items = ["MOT_THST_EXPO", "INS_GYRO_FILTER", "BATT_ARM_VOLT"];
    expect(computeTriState(items, new Set())).toBe("none");
  });

  it("selectNone followed by computeTriState returns 'none'", () => {
    const items = ["A", "B", "C"];
    const sel = selectNone();
    expect(computeTriState(items, sel)).toBe("none");
  });

  it("toggleGroup on empty selection selects all (not deselects)", () => {
    const group = ["A", "B"];
    const result = toggleGroup(group, new Set());
    expect(result).toEqual(new Set(["A", "B"]));
  });
});

// ---------------------------------------------------------------------------
// Plain fixed-wing gating
// ---------------------------------------------------------------------------

describe("isPlane", () => {
  it("returns true for Fixed_Wing", () => {
    expect(isPlane({ vehicle_type: "Fixed_Wing" } as VehicleState)).toBe(true);
  });

  it("returns false for Quadrotor", () => {
    expect(isPlane({ vehicle_type: "Quadrotor" } as VehicleState)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPlane(null)).toBe(false);
  });
});

describe("hasQuadPlaneParams", () => {
  function makeStore(p: Record<string, number>): ParamInputParams["store"] {
    return { params: p, expected_count: 0 } as unknown as ParamInputParams["store"];
  }

  function makeParams(storeParams: Record<string, number> | null): ParamInputParams {
    return {
      store: storeParams ? makeStore(storeParams) : null,
      staged: new Map(),
      metadata: null,
      stage: () => {},
    };
  }

  it("returns true when Q_FRAME_CLASS exists", () => {
    expect(hasQuadPlaneParams(makeParams({ Q_FRAME_CLASS: 1 }))).toBe(true);
  });

  it("returns false when Q_FRAME_CLASS absent", () => {
    expect(hasQuadPlaneParams(makeParams({ SOME_PARAM: 1 }))).toBe(false);
  });

  it("returns false when store is null", () => {
    expect(hasQuadPlaneParams(makeParams(null))).toBe(false);
  });
});

describe("plain fixed-wing gating", () => {
  function makeStore(p: Record<string, number>): ParamInputParams["store"] {
    return { params: p, expected_count: 0 } as unknown as ParamInputParams["store"];
  }

  it("plain fixed-wing is detected when isPlane=true and no Q_FRAME_CLASS", () => {
    const vs = { vehicle_type: "Fixed_Wing" } as VehicleState;
    const params: ParamInputParams = {
      store: makeStore({ SERVO1_FUNCTION: 4 }),
      staged: new Map(),
      metadata: null,
      stage: () => {},
    };
    expect(isPlane(vs)).toBe(true);
    expect(hasQuadPlaneParams(params)).toBe(false);
  });

  it("quadplane is not plain fixed-wing", () => {
    const vs = { vehicle_type: "Fixed_Wing" } as VehicleState;
    const params: ParamInputParams = {
      store: makeStore({ Q_FRAME_CLASS: 1 }),
      staged: new Map(),
      metadata: null,
      stage: () => {},
    };
    expect(isPlane(vs)).toBe(true);
    expect(hasQuadPlaneParams(params)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural contract: InitialParamsSection.tsx
// ---------------------------------------------------------------------------

describe("battery failsafe defaults consistency", () => {
  it("BATT_FS_LOW_ACT is 2 (RTL) in SAFETY_DEFAULTS", () => {
    expect(SECTION_SRC).toMatch(/BATT_FS_LOW_ACT:\s*2/);
  });

  it("BATT_FS_CRT_ACT is 1 (Land) in SAFETY_DEFAULTS", () => {
    expect(SECTION_SRC).toMatch(/BATT_FS_CRT_ACT:\s*1/);
  });

  it("BATT_FS_LOW_ACT is NOT 1 (that is Land in official ArduPilot mapping)", () => {
    const match = SECTION_SRC.match(/BATT_FS_LOW_ACT:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).not.toBe(1);
  });

  it("BATT_FS_CRT_ACT is NOT 3 (that is SmartRTL in official ArduPilot mapping)", () => {
    const match = SECTION_SRC.match(/BATT_FS_CRT_ACT:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).not.toBe(3);
  });
});

describe("InitialParamsSection structural contract", () => {
  it("does NOT contain effectiveSelected sentinel pattern", () => {
    expect(SECTION_SRC).not.toMatch(/selected\.size\s*===\s*0.*allNames/);
    expect(SECTION_SRC).not.toContain("effectiveSelected");
  });

  it("imports from initial-params-selection helper", () => {
    expect(SECTION_SRC).toContain("initial-params-selection");
  });

  it("initializes selected with all param names, not empty Set", () => {
    expect(SECTION_SRC).not.toMatch(/useState<Set<string>>\(\(\)\s*=>\s*new Set\(\)\)/);
  });

  it("uses computeTriState for global and group tri-state", () => {
    expect(SECTION_SRC).toContain("computeTriState");
  });

  it("uses toggleGroup for group header clicks", () => {
    expect(SECTION_SRC).toContain("toggleGroup");
  });

  it("uses toggleItem for row clicks", () => {
    expect(SECTION_SRC).toContain("toggleItem");
  });

  it("does NOT call setState during render (no render-time state sync)", () => {
    expect(SECTION_SRC).not.toMatch(/if\s*\([^)]*\.key\s*!==\s*[^)]*\)\s*\{?\s*set/);
  });

  it("resets selection via useEffect, not render-time mutation", () => {
    expect(SECTION_SRC).toMatch(/useEffect\(\(\)\s*=>\s*\{?\s*\n?\s*setSelected/);
  });

  it("global tri-state control uses SetupCheckbox with onChange for interactivity", () => {
    expect(SECTION_SRC).toContain("triStateToChecked(globalTriState)");
    expect(SECTION_SRC).toContain("onChange={handleGlobalToggle}");
  });

  it("gates calculator behind plain fixed-wing check with early return", () => {
    expect(SECTION_SRC).toContain("isPlainFixedWing");
    const mainFn = SECTION_SRC.slice(SECTION_SRC.indexOf("export function InitialParamsSection("));
    expect(mainFn).toMatch(/if\s*\(\s*isPlainFixedWing\s*\)/);
  });

  it("no hooks appear after the isPlainFixedWing early return", () => {
    const mainFn = SECTION_SRC.slice(SECTION_SRC.indexOf("export function InitialParamsSection("));
    const earlyReturnIdx = mainFn.indexOf("if (isPlainFixedWing)");
    expect(earlyReturnIdx).toBeGreaterThan(0);
    const afterEarlyReturn = mainFn.slice(earlyReturnIdx);
    expect(afterEarlyReturn).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref)\s*[<(]/);
  });
});

// ---------------------------------------------------------------------------
// Task 9: Shared intro/header treatment and navigateToParam wiring
// ---------------------------------------------------------------------------

describe("InitialParamsSection shared shell chrome", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(SECTION_SRC).toContain('import { SetupSectionIntro } from "../shared/SetupSectionIntro"');
  });

  it("renders SetupSectionIntro for the main view", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
    expect(SECTION_SRC).toContain('title="Initial Parameters Calculator"');
  });

  it("uses SetupSectionIntro for the plain fixed-wing fallback too", () => {
    const earlyReturnBlock = SECTION_SRC.slice(
      SECTION_SRC.indexOf("if (isPlainFixedWing)"),
      SECTION_SRC.indexOf("return (", SECTION_SRC.indexOf("if (isPlainFixedWing)") + 50),
    );
    expect(earlyReturnBlock).toContain("SetupSectionIntro");
  });
});

describe("InitialParamsSection navigateToParam wiring", () => {
  it("accepts navigateToParam as an optional prop", () => {
    expect(SECTION_SRC).toMatch(/navigateToParam\??\s*:\s*\(paramName:\s*string\)\s*=>\s*void/);
  });

  it("DiffRow accepts onNavigate callback", () => {
    const diffRowFn = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function DiffRow("),
      SECTION_SRC.indexOf("function InitialParamsSection(") > 0
        ? SECTION_SRC.indexOf("export function InitialParamsSection(")
        : undefined,
    );
    expect(diffRowFn).toMatch(/onNavigate\??\s*:\s*\(paramName:\s*string\)\s*=>\s*void/);
  });

  it("passes navigateToParam as onNavigate to DiffRow", () => {
    expect(SECTION_SRC).toContain("onNavigate={navigateToParam}");
  });

  it("DiffRow renders a clickable param name when onNavigate is provided", () => {
    const diffRowFn = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function DiffRow("),
      SECTION_SRC.indexOf("export function InitialParamsSection("),
    );
    expect(diffRowFn).toContain("onNavigate(param.name)");
    expect(diffRowFn).toContain("text-accent hover:underline");
  });

  it("DiffRow still renders plain text when onNavigate is absent", () => {
    const diffRowFn = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function DiffRow("),
      SECTION_SRC.indexOf("export function InitialParamsSection("),
    );
    expect(diffRowFn).toContain("text-text-primary");
  });

  it("preserves the grouped diff-table model (not hidden preview)", () => {
    expect(SECTION_SRC).toContain("Computed Parameters");
    expect(SECTION_SRC).toContain("GROUP_META");
    expect(SECTION_SRC).toContain("grouped.map");
  });

  it("preserves tri-state checkbox workflow via shared SetupCheckbox", () => {
    expect(SECTION_SRC).toContain("SetupCheckbox");
    expect(SECTION_SRC).toContain("triStateToChecked");
    expect(SECTION_SRC).toContain("handleGlobalToggle");
    expect(SECTION_SRC).toContain("handleGroupToggle");
    expect(SECTION_SRC).toContain("handleRowToggle");
  });

  it("imports SetupCheckbox from shared module", () => {
    expect(SECTION_SRC).toContain('import { SetupCheckbox } from "../shared/SetupCheckbox"');
  });

  it("does not define a local TriStateCheckbox function (uses shared SetupCheckbox)", () => {
    expect(SECTION_SRC).not.toMatch(/function TriStateCheckbox\(/);
  });

  it("DiffRow uses SetupCheckbox for row selection", () => {
    const diffRowFn = SECTION_SRC.slice(
      SECTION_SRC.indexOf("function DiffRow("),
      SECTION_SRC.indexOf("export function InitialParamsSection("),
    );
    expect(diffRowFn).toContain("<SetupCheckbox");
  });

  it("preserves Stage All and Stage Selected buttons", () => {
    expect(SECTION_SRC).toContain("Stage All Recommended");
    expect(SECTION_SRC).toContain("Stage Selected");
    expect(SECTION_SRC).toContain("stageAll");
    expect(SECTION_SRC).toContain("stageSelected");
  });
});

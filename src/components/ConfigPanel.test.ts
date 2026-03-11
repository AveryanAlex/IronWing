import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "ConfigPanel.tsx"), "utf-8");

describe("ConfigPanel uses shared formatting helpers", () => {
  it("imports formatStagedValue from shared param-format-helpers", () => {
    expect(src).toContain('import { formatStagedValue, displayParamValue } from "./setup/shared/param-format-helpers"');
  });

  it("does not define a local displayValue function", () => {
    expect(src).not.toMatch(/^function displayValue\(/m);
  });

  it("does not define a local formatStagedValue function", () => {
    expect(src).not.toMatch(/^function formatStagedValue\(/m);
  });

  it("does not define a local INTEGER_TYPES constant", () => {
    expect(src).not.toMatch(/^const INTEGER_TYPES/m);
  });
});

describe("ConfigPanel has no inline StagedDiffPanel", () => {
  it("does not define a StagedDiffPanel function", () => {
    expect(src).not.toMatch(/function StagedDiffPanel\(/);
  });

  it("does not render a StagedDiffPanel component", () => {
    expect(src).not.toMatch(/<StagedDiffPanel/);
  });

  it("does not reference HIDES_SHELL_STAGED_BAR", () => {
    expect(src).not.toContain("HIDES_SHELL_STAGED_BAR");
  });
});

describe("ConfigPanel preserves toolbar apply/discard controls", () => {
  it("has an Apply button that calls applyStaged", () => {
    expect(src).toMatch(/params\.applyStaged/);
    expect(src).toMatch(/Apply/);
  });

  it("has a Discard All button that calls unstageAll", () => {
    expect(src).toMatch(/params\.unstageAll/);
    expect(src).toMatch(/Discard All/);
  });

  it("has a Refresh button that calls download", () => {
    expect(src).toMatch(/params\.download/);
    expect(src).toMatch(/Refresh/);
  });
});

describe("ConfigPanel param row uses shared displayParamValue", () => {
  it("calls displayParamValue (not displayValue) for current values", () => {
    expect(src).toContain("displayParamValue(param)");
    expect(src).not.toMatch(/\bdisplayValue\(/);
  });

  it("calls formatStagedValue for staged values", () => {
    expect(src).toContain("formatStagedValue(");
  });
});

describe("ConfigPanel highlight param support", () => {
  it("accepts highlightParam and onHighlightHandled props", () => {
    expect(src).toMatch(/highlightParam\??\s*:\s*string\s*\|\s*null/);
    expect(src).toMatch(/onHighlightHandled\??\s*:\s*\(\)\s*=>\s*void/);
  });

  it("passes highlightParam through to ParamsTabContent", () => {
    const configPanelFn = src.slice(src.indexOf("export function ConfigPanel("));
    expect(configPanelFn).toContain("highlightParam={highlightParam}");
    expect(configPanelFn).toContain("onHighlightHandled={onHighlightHandled}");
  });
});

describe("ParamRow data-setup-param anchor in ConfigPanel", () => {
  it("renders data-setup-param attribute with param.name", () => {
    const paramRowFn = src.slice(src.indexOf("function ParamRow("));
    expect(paramRowFn).toContain("data-setup-param={param.name}");
  });

  it("accepts a highlighted prop", () => {
    const paramRowFn = src.slice(src.indexOf("function ParamRow("));
    expect(paramRowFn).toMatch(/highlighted\??\s*:\s*boolean/);
  });

  it("applies setup-param-highlight class when highlighted", () => {
    const paramRowFn = src.slice(src.indexOf("function ParamRow("));
    expect(paramRowFn).toContain("setup-param-highlight");
  });
});

describe("ParamGroup auto-expand for highlighted param", () => {
  it("accepts highlightParam prop", () => {
    const groupFn = src.slice(src.indexOf("function ParamGroup("));
    expect(groupFn).toMatch(/highlightParam\??\s*:\s*string\s*\|\s*null/);
  });

  it("auto-expands when the group contains the highlighted param", () => {
    const groupFn = src.slice(src.indexOf("function ParamGroup("));
    expect(groupFn).toContain("groupContainsHighlight");
    expect(groupFn).toMatch(/setExpanded\(true\)/);
  });

  it("passes highlightParam to ParamRow as highlighted boolean", () => {
    const groupFn = src.slice(src.indexOf("function ParamGroup("));
    expect(groupFn).toMatch(/highlighted=\{highlightParam\s*===\s*param\.name\}/);
  });
});

describe("ParamsTabContent highlight scroll behavior", () => {
  it("uses scrollIntoView for highlighted param", () => {
    const tabFn = src.slice(src.indexOf("function ParamsTabContent("));
    expect(tabFn).toContain("scrollIntoView");
    expect(tabFn).toContain('behavior: "smooth"');
    expect(tabFn).toContain('block: "center"');
  });

  it("calls onHighlightHandled after highlight timeout", () => {
    const tabFn = src.slice(src.indexOf("function ParamsTabContent("));
    expect(tabFn).toContain("onHighlightHandled");
  });

  it("passes highlightParam to each ParamGroup", () => {
    const tabFn = src.slice(src.indexOf("function ParamsTabContent("));
    expect(tabFn).toContain("highlightParam={highlightParam}");
  });
});

describe("BitmaskEditor uses shared SetupCheckbox", () => {
  it("imports SetupCheckbox from shared module", () => {
    expect(src).toContain('import { SetupCheckbox } from "./setup/shared/SetupCheckbox"');
  });

  it("renders SetupCheckbox in BitmaskEditor", () => {
    const bitmaskFn = src.slice(src.indexOf("function BitmaskEditor("));
    expect(bitmaskFn).toContain("<SetupCheckbox");
  });

  it("does not use native checkbox inputs in BitmaskEditor", () => {
    const start = src.indexOf("function BitmaskEditor(");
    const end = src.indexOf("function TextEditor(");
    const bitmaskFn = src.slice(start, end);
    expect(bitmaskFn).not.toContain('type="checkbox"');
  });
});

describe("ParamGroup expand/collapse uses rotating ChevronDown", () => {
  it("does not import ChevronRight", () => {
    expect(src).not.toContain("ChevronRight");
  });

  it("uses a single ChevronDown with rotate-180 transition", () => {
    const groupFn = src.slice(src.indexOf("function ParamGroup("));
    expect(groupFn).toContain("rotate-180");
    expect(groupFn).toContain("transition-transform duration-200");
  });
});

const fullParamsSrc = readFileSync(resolve(__dirname, "setup/sections/FullParametersSection.tsx"), "utf-8");

describe("FullParametersSection shell framing", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(fullParamsSrc).toContain('import { SetupSectionIntro } from "../shared/SetupSectionIntro"');
  });

  it("renders SetupSectionIntro with Full Parameters title", () => {
    expect(fullParamsSrc).toContain("<SetupSectionIntro");
    expect(fullParamsSrc).toContain('title="Full Parameters"');
  });

  it("does not contain StagedDiffPanel or HIDES_SHELL_STAGED_BAR", () => {
    expect(fullParamsSrc).not.toContain("StagedDiffPanel");
    expect(fullParamsSrc).not.toContain("HIDES_SHELL_STAGED_BAR");
  });

  it("passes highlightParam and onHighlightHandled to ConfigPanel", () => {
    expect(fullParamsSrc).toContain("highlightParam={highlightParam}");
    expect(fullParamsSrc).toContain("onHighlightHandled={onHighlightHandled}");
  });

  it("remains a thin wrapper delegating to ConfigPanel", () => {
    expect(fullParamsSrc).toContain("<ConfigPanel");
    const lineCount = fullParamsSrc.split("\n").length;
    expect(lineCount).toBeLessThan(50);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const HOOK_PATTERN = /\b(useState|useCallback|useMemo|useEffect|useRef|useReducer|useContext)\s*[(<]/;

// ---------------------------------------------------------------------------
// Nav item color: completed labels stay neutral, only icon stays green
// ---------------------------------------------------------------------------

describe("SectionNavItem completed color", () => {
  const src = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");

  const navItemFn = src.slice(src.indexOf("function SectionNavItem("));
  const navItemBody = navItemFn.slice(0, navItemFn.indexOf("\nfunction "));

  it("does not apply text-success class to the nav item button", () => {
    const classNameBlock = navItemBody.slice(
      navItemBody.indexOf("className={cn("),
      navItemBody.indexOf(")}>") + 3,
    );
    expect(classNameBlock).not.toContain("text-success");
  });

  it("does not apply text-accent to active nav item labels", () => {
    const classNameBlock = navItemBody.slice(
      navItemBody.indexOf("className={cn("),
      navItemBody.indexOf(")}>") + 3,
    );
    expect(classNameBlock).not.toContain("text-accent");
  });

  it("imports SectionStatusIcon from the shared module", () => {
    expect(src).toContain('import { SectionStatusIcon } from "./shared/SectionStatusIcon"');
  });
});

describe("SetupSectionPanel hook order", () => {
  it("has no React hook calls after the early return in SetupSectionPanel", () => {
    const src = readFileSync(
      resolve(__dirname, "SetupSectionPanel.tsx"),
      "utf-8",
    );

    const fnStart = src.indexOf("export function SetupSectionPanel(");
    expect(fnStart).toBeGreaterThan(-1);

    const body = src.slice(fnStart);

    const earlyReturnIdx = body.indexOf("if (!connected) return");
    expect(earlyReturnIdx).toBeGreaterThan(-1);

    const afterEarlyReturn = body.slice(earlyReturnIdx);
    const lines = afterEarlyReturn.split("\n").slice(1);

    const violatingLines = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => HOOK_PATTERN.test(line));

    expect(
      violatingLines,
      `Hook calls found after early return:\n${violatingLines.map((v) => `  line +${v.num}: ${v.line}`).join("\n")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Onboarding state: connected but params not yet downloaded
// ---------------------------------------------------------------------------

describe("SetupSectionPanel onboarding gate (connected, no params)", () => {
  const panelSrc = readFileSync(
    resolve(__dirname, "SetupSectionPanel.tsx"),
    "utf-8",
  );
  const overviewSrc = readFileSync(
    resolve(__dirname, "sections", "OverviewSection.tsx"),
    "utf-8",
  );

  it("computes a paramsLoaded boolean from params.store", () => {
    // The panel must derive a paramsLoaded flag that is false when params.store is null
    expect(panelSrc).toMatch(/paramsLoaded\b/);
    expect(panelSrc).toMatch(/params\.store\s*!==?\s*null/);
  });

  it("forces activeSection to overview when setup is not ready", () => {
    const fnBody = panelSrc.slice(
      panelSrc.indexOf("export function SetupSectionPanel("),
    );
    expect(fnBody).toMatch(/!setupReady/);
    expect(fnBody).toMatch(/setupReady.*overview|overview.*setupReady/s);
  });

  it("passes setupReady to SectionNav for dimming locked sections", () => {
    expect(panelSrc).toMatch(/SectionNav[\s\S]*?setupReady/);
  });

  it("SectionNavItem supports a locked state that dims the button", () => {
    // SectionNavItem must accept and use a locked/disabled prop
    const navItemFn = panelSrc.slice(
      panelSrc.indexOf("function SectionNavItem("),
    );
    expect(navItemFn).toMatch(/locked|disabled/);
    // Locked items should have reduced opacity or pointer-events-none
    expect(navItemFn).toMatch(/opacity|pointer-events-none/);
  });

  it("OverviewSection renders onboarding content when params.store is null", () => {
    // OverviewSection must check for params.store === null and show onboarding UI
    const fnBody = overviewSrc.slice(
      overviewSrc.indexOf("export function OverviewSection("),
    );
    // Must contain a check for params.store being null
    expect(fnBody).toMatch(/params\.store\s*===?\s*null/);
    // Must contain download-focused CTA text
    expect(overviewSrc).toMatch(/Download.*Param|param.*download/i);
    // Must contain instructional/onboarding text explaining why params are needed
    expect(overviewSrc).toMatch(/parameter/i);
  });

  it("normalizes activeSection state to overview via useEffect, not just visual override", () => {
    const fnBody = panelSrc.slice(
      panelSrc.indexOf("export function SetupSectionPanel("),
    );

    // Must have a useEffect that calls setActiveSection("overview") when setup isn't ready.
    // This normalizes the *persisted* state so it doesn't jump back when the gate lifts.
    const hasNormalizationEffect = /useEffect\(\s*\(\)\s*=>\s*\{[^}]*setActiveSection\(\s*["']overview["']\s*\)[^}]*!setupReady/s.test(fnBody)
      || /useEffect\(\s*\(\)\s*=>\s*\{[^}]*!setupReady[^}]*setActiveSection\(\s*["']overview["']\s*\)/s.test(fnBody);

    expect(
      hasNormalizationEffect,
      "SetupSectionPanel must contain a useEffect that calls setActiveSection('overview') when !setupReady",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metadata gate: sections locked until both params and metadata are available
// ---------------------------------------------------------------------------

describe("SetupSectionPanel metadata gate", () => {
  const panelSrc = readFileSync(
    resolve(__dirname, "SetupSectionPanel.tsx"),
    "utf-8",
  );
  const overviewSrc = readFileSync(
    resolve(__dirname, "sections", "OverviewSection.tsx"),
    "utf-8",
  );
  const fnBody = panelSrc.slice(
    panelSrc.indexOf("export function SetupSectionPanel("),
  );

  it("computes setupReady from both params.store and params.metadata", () => {
    expect(fnBody).toMatch(/setupReady\b/);
    expect(fnBody).toMatch(/params\.metadata\s*!==?\s*null/);
    expect(fnBody).toMatch(/params\.store\s*!==?\s*null/);
  });

  it("uses setupReady (not just paramsLoaded) for the effective section gate", () => {
    expect(fnBody).toMatch(/!setupReady\s*\?.*["']overview["']/);
  });

  it("passes setupReady to SectionNav for locking", () => {
    // Both SectionNav render sites must receive setupReady
    const navMatches = fnBody.match(/SectionNav[\s\S]*?setupReady/g);
    expect(navMatches?.length).toBeGreaterThanOrEqual(2);
  });

  it("OverviewSection handles metadata-loading state after params are downloaded", () => {
    // Must handle the case where params.store exists but metadata is still loading
    expect(overviewSrc).toMatch(/metadataLoading/);
    // Must show some UI for this intermediate state
    expect(overviewSrc).toMatch(/Loading.*description|description.*loading/i);
  });

  it("OverviewSection handles metadata-failed state", () => {
    // Must handle the case where metadata failed (store exists, not loading, metadata null)
    // Should show explanatory message and/or retry
    expect(overviewSrc).toMatch(/metadata.*null|metadata.*unavailable|Could not load/i);
  });
});

// ---------------------------------------------------------------------------
// Regression: confirmSection must be wired through SetupSectionPanel
// ---------------------------------------------------------------------------

describe("confirmSection wiring for user-confirmed sections", () => {
  const src = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const fnBody = src.slice(src.indexOf("export function SetupSectionPanel("));

  it("destructures confirmSection from useSetupSections", () => {
    const hookIdx = fnBody.indexOf("useSetupSections(");
    const destructureStart = fnBody.lastIndexOf("const", hookIdx);
    const block = fnBody.slice(destructureStart, hookIdx + 200);
    expect(block).toContain("confirmSection");
  });

  it("defines a callback that calls confirmSection for flight_modes", () => {
    expect(fnBody).toMatch(/flight_modes.*confirmSection|confirmSection.*flight_modes/s);
  });

  it("defines a callback that calls confirmSection for failsafe", () => {
    expect(fnBody).toMatch(/failsafe.*confirmSection|confirmSection.*failsafe/s);
  });

  it("passes onApplySuccess to StagedParamsBar", () => {
    expect(fnBody).toMatch(/StagedParamsBar[\s\S]*?onApplySuccess/);
  });

  it("StagedParamsBar calls onApplySuccess after successful apply", () => {
    const barFn = src.slice(src.indexOf("function StagedParamsBar("));
    const barBody = barFn.slice(0, barFn.indexOf("\n// ----") > 0 ? barFn.indexOf("\n// ----") : barFn.indexOf("\nexport ") > 0 ? barFn.indexOf("\nexport ") : barFn.indexOf("\nfunction Section"));
    expect(barBody).toContain("onApplySuccess");
    expect(barBody).toMatch(/applyStaged[\s\S]*?onApplySuccess/);
  });
});

// ---------------------------------------------------------------------------
// Regression: applyStaged must return a boolean and StagedParamsBar must gate
// onApplySuccess on the result — prevents false-positive section confirmation
// ---------------------------------------------------------------------------

describe("applyStaged success gating (false-positive completion fix)", () => {
  const panelSrc = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const hookSrc = readFileSync(resolve(__dirname, "../../hooks/use-params.ts"), "utf-8");

  it("useParams.applyStaged has an explicit Promise<boolean> return type", () => {
    // The return type annotation must be present so callers know they get a boolean
    expect(hookSrc).toMatch(/applyStaged\s*=\s*useCallback\(\s*async\s*\(\s*\)\s*:\s*Promise<boolean>/);
  });

  it("useParams.applyStaged returns true only when all params succeed (failed.length === 0)", () => {
    const applyStagedFn = hookSrc.slice(hookSrc.indexOf("const applyStaged"));
    const fnBody = applyStagedFn.slice(0, applyStagedFn.indexOf("], [connected, staged])"));

    // Must return true only in the zero-failures branch
    expect(fnBody).toMatch(/failed\.length\s*===\s*0[\s\S]*?return\s+true/);
    // Must return false in the partial-failure branch
    expect(fnBody).toMatch(/toast\.warning[\s\S]*?return\s+false/);
    // Must return false in the catch branch
    expect(fnBody).toMatch(/toast\.error[\s\S]*?return\s+false/);
    // Must return false for the early-exit (not connected or empty staged)
    expect(fnBody).toMatch(/if\s*\(!connected\s*\|\|\s*staged\.size\s*===\s*0\)\s*return\s+false/);
  });

  it("StagedParamsBar gates onApplySuccess on the applyStaged return value", () => {
    const barFn = panelSrc.slice(panelSrc.indexOf("function StagedParamsBar("));
    const barBody = barFn.slice(0, barFn.indexOf("\n// ----") > 0 ? barFn.indexOf("\n// ----") : barFn.indexOf("\nexport ") > 0 ? barFn.indexOf("\nexport ") : barFn.indexOf("\nfunction Section"));

    // Must capture the return value of applyStaged
    expect(barBody).toMatch(/(?:const|let)\s+\w+\s*=\s*await\s+params\.applyStaged\(\)/);

    // Must conditionally call onApplySuccess based on the captured result
    // e.g. "if (allSucceeded) onApplySuccess?.()"
    expect(barBody).toMatch(/if\s*\(\w+\)\s*onApplySuccess/);
  });

  it("StagedParamsBar does NOT unconditionally call onApplySuccess after applyStaged", () => {
    const barFn = panelSrc.slice(panelSrc.indexOf("function StagedParamsBar("));
    const barBody = barFn.slice(0, barFn.indexOf("\n// ----") > 0 ? barFn.indexOf("\n// ----") : barFn.indexOf("\nexport ") > 0 ? barFn.indexOf("\nexport ") : barFn.indexOf("\nfunction Section"));

    // The old bug: `await params.applyStaged(); onApplySuccess?.();`
    // This pattern must NOT exist — there must be a conditional between applyStaged and onApplySuccess
    const handleApplyFn = barBody.slice(barBody.indexOf("handleApply"));
    const applyLine = handleApplyFn.indexOf("applyStaged()");
    const successLine = handleApplyFn.indexOf("onApplySuccess");
    expect(applyLine).toBeGreaterThan(-1);
    expect(successLine).toBeGreaterThan(-1);

    // Between applyStaged() and onApplySuccess there must be a conditional (if)
    const between = handleApplyFn.slice(applyLine, successLine);
    expect(between).toMatch(/if\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// Param navigation: navigateToParam contract
// ---------------------------------------------------------------------------

describe("navigateToParam shell-level contract", () => {
  const panelSrc = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const fnBody = panelSrc.slice(panelSrc.indexOf("export function SetupSectionPanel("));

  it("defines a navigateToParam callback using useCallback", () => {
    expect(fnBody).toMatch(/navigateToParam\s*=\s*useCallback/);
  });

  it("navigateToParam tries in-section anchor first via data-setup-param selector", () => {
    const navFn = fnBody.slice(fnBody.indexOf("navigateToParam"));
    expect(navFn).toContain('data-setup-param');
    expect(navFn).toContain("scrollIntoView");
  });

  it("navigateToParam applies setup-param-highlight class for in-section matches", () => {
    const navFn = fnBody.slice(fnBody.indexOf("navigateToParam"));
    expect(navFn).toContain("setup-param-highlight");
  });

  it("navigateToParam clears previous highlight timer before setting a new one", () => {
    const navFn = fnBody.slice(fnBody.indexOf("navigateToParam"));
    expect(navFn).toMatch(/clearTimeout\(highlightTimerRef/);
  });

  it("navigateToParam falls back to full_parameters when anchor is not found", () => {
    const navFn = fnBody.slice(fnBody.indexOf("navigateToParam"), fnBody.indexOf("navigateToParam") + 800);
    expect(navFn).toContain('setFilterMode("all")');
    expect(navFn).toContain("setSearch(paramName)");
    expect(navFn).toContain('setActiveSection("full_parameters")');
  });

  it("passes highlightParam and onHighlightHandled to FullParametersSection", () => {
    expect(fnBody).toMatch(/FullParametersSection[\s\S]*?highlightParam/);
    expect(fnBody).toMatch(/FullParametersSection[\s\S]*?onHighlightHandled/);
  });

  it("manages pendingHighlightParam state for the fallback path", () => {
    expect(fnBody).toContain("pendingHighlightParam");
    expect(fnBody).toContain("setPendingHighlightParam");
  });
});

// ---------------------------------------------------------------------------
// Unified staged tray: shell-owned for all sections including Full Parameters
// ---------------------------------------------------------------------------

describe("Unified staged tray architecture", () => {
  const src = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const fnBody = src.slice(src.indexOf("export function SetupSectionPanel("));

  it("does not import HIDES_SHELL_STAGED_BAR", () => {
    expect(src).not.toContain("HIDES_SHELL_STAGED_BAR");
  });

  it("does not compute hideShellStagedBar", () => {
    expect(fnBody).not.toContain("hideShellStagedBar");
  });

  it("renders StagedParamsBar unconditionally (no section-specific gating)", () => {
    expect(fnBody).toContain("<StagedParamsBar");
    expect(fnBody).not.toMatch(/!hide.*StagedParamsBar|hide.*&&.*StagedParamsBar/);
  });

  it("places StagedParamsBar as a shell-level footer beneath the body split", () => {
    const returnBlock = fnBody.slice(fnBody.indexOf("return ("));

    // Only one instance (shell-level footer, not duplicated per branch)
    const allStagedBarOccurrences = (returnBlock.match(/<StagedParamsBar/g) || []).length;
    expect(allStagedBarOccurrences).toBe(1);

    // The old content-column wrapper (flex flex-1 flex-col) no longer exists —
    // content scroll div is a direct child of the body row
    expect(returnBlock).not.toContain('className="flex flex-1 flex-col overflow-hidden"');
  });

  it("uses shared formatting helpers from param-format-helpers", () => {
    expect(src).toContain('import { formatStagedValue, displayParamValue } from "./shared/param-format-helpers"');
  });

  it("does not define local INTEGER_TYPES or displayValue", () => {
    expect(src).not.toMatch(/^const INTEGER_TYPES/m);
    expect(src).not.toMatch(/^function (displayValue|fmtVal)\(/m);
  });
});

// ---------------------------------------------------------------------------
// Scroll reset: content scroll container resets to top on section change
// ---------------------------------------------------------------------------

describe("Content scroll reset on section change", () => {
  const src = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const fnBody = src.slice(src.indexOf("export function SetupSectionPanel("));

  it("declares a contentScrollRef", () => {
    expect(fnBody).toMatch(/contentScrollRef\s*=\s*useRef/);
  });

  it("has a useEffect that resets scrollTop when activeSection changes", () => {
    expect(fnBody).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*contentScrollRef\.current[^}]*scrollTop\s*=\s*0/s);
    expect(fnBody).toMatch(/\[activeSection\]/);
  });

  it("attaches contentScrollRef to the overflow-y-auto content container", () => {
    expect(fnBody).toMatch(/ref=\{contentScrollRef\}.*overflow-y-auto/s);
  });
});

describe("StagedParamsBar animated expand/collapse", () => {
  const src = readFileSync(resolve(__dirname, "SetupSectionPanel.tsx"), "utf-8");
  const barFn = src.slice(src.indexOf("function StagedParamsBar("));
  const barBody = barFn.slice(0, barFn.indexOf("\n// ----") > 0 ? barFn.indexOf("\n// ----") : barFn.indexOf("\nexport ") > 0 ? barFn.indexOf("\nexport ") : barFn.indexOf("\nfunction Section"));

  it("uses CSS grid rows for animated expand/collapse", () => {
    expect(barBody).toContain("grid-rows-[1fr]");
    expect(barBody).toContain("grid-rows-[0fr]");
  });

  it("uses transition-[grid-template-rows] for smooth animation", () => {
    expect(barBody).toContain("transition-[grid-template-rows]");
  });

  it("has an overflow-hidden inner wrapper", () => {
    expect(barBody).toContain("overflow-hidden");
    expect(barBody).toContain("min-h-0");
  });

  it("uses aria-expanded on the toggle button", () => {
    expect(barBody).toContain("aria-expanded");
  });

  it("uses aria-hidden on the collapsible panel", () => {
    expect(barBody).toContain("aria-hidden");
  });

  it("uses a single rotating chevron with rotate-180", () => {
    expect(barBody).toContain("transition-transform");
    expect(barBody).toContain("rotate-180");
  });
});

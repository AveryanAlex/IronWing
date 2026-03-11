import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (file: string) => readFileSync(resolve(__dirname, file), "utf-8");

// ---------------------------------------------------------------------------
// DocsLink
// ---------------------------------------------------------------------------

describe("DocsLink", () => {
  const src = read("DocsLink.tsx");

  it("exports a DocsLink component", () => {
    expect(src).toMatch(/export function DocsLink\(/);
  });

  it("accepts docsUrl prop that is nullable", () => {
    expect(src).toMatch(/docsUrl.*string\s*\|\s*null/);
  });

  it("accepts optional docsLabel prop", () => {
    expect(src).toMatch(/docsLabel\?.*string/);
  });

  it("renders nothing when docsUrl is falsy", () => {
    expect(src).toMatch(/if\s*\(!docsUrl\)\s*return\s+null/);
  });

  it("renders an anchor with target=_blank and rel=noopener noreferrer", () => {
    expect(src).toContain('target="_blank"');
    expect(src).toContain('rel="noopener noreferrer"');
  });

  it("renders ExternalLink icon from lucide-react", () => {
    expect(src).toContain("ExternalLink");
    expect(src).toMatch(/h-3 w-3/);
  });

  it("supports inline and header variants", () => {
    expect(src).toMatch(/variant.*"inline"\s*\|\s*"header"/);
  });

  it("merges className with base variant styles instead of replacing them", () => {
    // className should augment (append to) the base variant, not replace via ??
    expect(src).not.toMatch(/className\s*=\s*\{className\s*\?\?/);
    // base classes must always be included, with className appended
    expect(src).toMatch(/className=\{`\$\{base\}/);
  });
});

// ---------------------------------------------------------------------------
// SectionStatusIcon
// ---------------------------------------------------------------------------

describe("SectionStatusIcon", () => {
  const src = read("SectionStatusIcon.tsx");

  it("exports a SectionStatusIcon component", () => {
    expect(src).toMatch(/export function SectionStatusIcon\(/);
  });

  it("imports SectionStatus type from use-setup-sections", () => {
    expect(src).toMatch(/import.*SectionStatus.*from.*use-setup-sections/);
  });

  it("renders success styling for complete status", () => {
    expect(src).toContain("bg-success/20");
    expect(src).toContain("text-success");
  });

  it("renders accent styling for in_progress status", () => {
    expect(src).toContain("bg-accent/20");
    expect(src).toContain("text-accent");
  });

  it("renders muted styling for not_started status", () => {
    expect(src).toContain("bg-bg-tertiary");
    expect(src).toContain("text-text-muted");
  });

  it("handles all three SectionStatus values", () => {
    expect(src).toContain('"complete"');
    expect(src).toContain('"in_progress"');
  });
});

// ---------------------------------------------------------------------------
// SetupSectionIntro
// ---------------------------------------------------------------------------

describe("SetupSectionIntro", () => {
  const src = read("SetupSectionIntro.tsx");

  it("exports a SetupSectionIntro component", () => {
    expect(src).toMatch(/export function SetupSectionIntro\(/);
  });

  it("accepts icon, title, description as required props", () => {
    expect(src).toMatch(/icon:\s*LucideIcon/);
    expect(src).toMatch(/title:\s*string/);
    expect(src).toMatch(/description:\s*string/);
  });

  it("accepts optional docsUrl prop", () => {
    expect(src).toMatch(/docsUrl\?.*string\s*\|\s*null/);
  });

  it("accepts optional docsLabel prop", () => {
    expect(src).toMatch(/docsLabel\?.*string/);
  });

  it("accepts optional actionSlot prop of type ReactNode", () => {
    expect(src).toMatch(/actionSlot\?.*ReactNode/);
  });

  it("renders DocsLink from shared module", () => {
    expect(src).toMatch(/import.*DocsLink.*from.*\.\/DocsLink/);
    expect(src).toContain("<DocsLink");
  });

  it("renders with accent/5 card background matching existing pattern", () => {
    expect(src).toContain("bg-accent/5");
    expect(src).toContain("border-border-light");
  });

  it("is not sticky (no sticky/fixed classes)", () => {
    expect(src).not.toContain("sticky");
    expect(src).not.toContain("position: fixed");
    expect(src).not.toContain("position: sticky");
  });
});

// ---------------------------------------------------------------------------
// SectionCardHeader
// ---------------------------------------------------------------------------

describe("SectionCardHeader", () => {
  const src = read("SectionCardHeader.tsx");

  it("exports a SectionCardHeader component", () => {
    expect(src).toMatch(/export function SectionCardHeader\(/);
  });

  it("accepts icon, title as required props", () => {
    expect(src).toMatch(/icon:\s*LucideIcon/);
    expect(src).toMatch(/title:\s*string/);
  });

  it("accepts optional docsUrl prop", () => {
    expect(src).toMatch(/docsUrl\?.*string\s*\|\s*null/);
  });

  it("renders DocsLink from shared module", () => {
    expect(src).toMatch(/import.*DocsLink.*from.*\.\/DocsLink/);
    expect(src).toContain("<DocsLink");
  });

  it("uses flex justify-between layout for title/docs placement", () => {
    expect(src).toContain("justify-between");
  });

  it("renders title in the standard card header style", () => {
    expect(src).toContain("text-[11px]");
    expect(src).toContain("uppercase");
    expect(src).toContain("tracking-wider");
  });
});

// ---------------------------------------------------------------------------
// PreviewStagePanel
// ---------------------------------------------------------------------------

describe("PreviewStagePanel", () => {
  const src = read("PreviewStagePanel.tsx");

  it("exports a PreviewStagePanel component", () => {
    expect(src).toMatch(/export function PreviewStagePanel\(/);
  });

  it("exports PreviewRow type", () => {
    expect(src).toMatch(/export type PreviewRow\b/);
  });

  it("PreviewRow has key, label, paramName?, detail?, willChange fields", () => {
    expect(src).toMatch(/key:\s*string/);
    expect(src).toMatch(/label:\s*string/);
    expect(src).toMatch(/paramName\?:\s*string/);
    expect(src).toMatch(/detail\?:\s*string/);
    expect(src).toMatch(/willChange:\s*boolean/);
  });

  it("accepts onStage and onCancel callbacks", () => {
    expect(src).toMatch(/onStage:\s*\(\)\s*=>\s*void/);
    expect(src).toMatch(/onCancel:\s*\(\)\s*=>\s*void/);
  });

  it("accepts optional onRowClick callback", () => {
    expect(src).toMatch(/onRowClick\?:\s*\(row:\s*PreviewRow\)\s*=>\s*void/);
  });

  it("disables stage button when no changes exist", () => {
    expect(src).toMatch(/disabled=\{changeCount\s*===\s*0\}/);
  });

  it("shows 'already set' text for rows that will not change", () => {
    expect(src).toContain("already set");
  });

  it("visually mutes rows that will not change", () => {
    expect(src).toContain("text-text-muted");
    expect(src).toMatch(/willChange[\s\S]*?bg-accent|bg-accent[\s\S]*?willChange/);
  });

  it("makes changed rows clickable when onRowClick is provided", () => {
    expect(src).toContain("cursor-pointer");
    expect(src).toContain("hover:bg-accent/10");
  });

  it("renders rows with keyboard accessibility when clickable", () => {
    expect(src).toContain('role={interactive ? "button" : undefined}');
    expect(src).toContain("tabIndex");
    expect(src).toContain("onKeyDown");
  });

  it("uses accent/5 card background matching existing preview patterns", () => {
    expect(src).toContain("bg-accent/5");
    expect(src).toContain("border-accent/20");
  });
});

// ---------------------------------------------------------------------------
// Integration: SetupSectionPanel uses shared SectionStatusIcon
// ---------------------------------------------------------------------------

describe("SetupSectionPanel shared status icon integration", () => {
  const src = read("../SetupSectionPanel.tsx");

  it("imports SectionStatusIcon from shared module", () => {
    expect(src).toContain('import { SectionStatusIcon } from "./shared/SectionStatusIcon"');
  });

  it("does not define a local SectionStatusIcon function", () => {
    expect(src).not.toMatch(/function SectionStatusIcon\(/);
  });

  it("uses SectionStatusIcon in JSX", () => {
    expect(src).toContain("<SectionStatusIcon");
  });
});

// ---------------------------------------------------------------------------
// Integration: OverviewSection uses shared SectionStatusIcon
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SetupCheckbox
// ---------------------------------------------------------------------------

describe("SetupCheckbox", () => {
  const src = read("SetupCheckbox.tsx");

  it("exports a SetupCheckbox component", () => {
    expect(src).toMatch(/export function SetupCheckbox\(/);
  });

  it("accepts checked prop as boolean or mixed string", () => {
    expect(src).toMatch(/checked:\s*boolean\s*\|\s*"mixed"/);
  });

  it("accepts optional onChange prop", () => {
    expect(src).toMatch(/onChange\?:\s*\(\)\s*=>\s*void/);
  });

  it("accepts optional disabled prop", () => {
    expect(src).toMatch(/disabled\?:\s*boolean/);
  });

  it("accepts optional size prop with default 14", () => {
    expect(src).toMatch(/size\s*=\s*14/);
  });

  it("renders Check icon when checked is true", () => {
    expect(src).toContain("Check");
    expect(src).toMatch(/checked\s*===\s*true.*Check/s);
  });

  it("renders Minus icon when checked is mixed", () => {
    expect(src).toContain("Minus");
    expect(src).toMatch(/checked\s*===\s*"mixed".*Minus/s);
  });

  it("renders as interactive button when onChange is provided", () => {
    expect(src).toContain("<button");
    expect(src).toContain('type="button"');
    expect(src).toContain('role="checkbox"');
  });

  it("renders as presentation span when onChange is omitted", () => {
    expect(src).toContain("<span");
  });

  it("uses accent border/bg styling for active state", () => {
    expect(src).toContain("border-accent bg-accent text-white");
  });

  it("uses border/bg-secondary styling for inactive state", () => {
    expect(src).toContain("border-border bg-bg-secondary");
  });

  it("has hover and focus-visible affordances on button", () => {
    expect(src).toContain("hover:border-accent");
    expect(src).toContain("focus-visible:ring-1");
    expect(src).toContain("focus-visible:ring-accent");
  });

  it("applies aria-checked with correct mixed value", () => {
    expect(src).toContain("aria-checked");
    expect(src).toContain('"mixed"');
  });

  it("applies disabled styling with opacity and cursor", () => {
    expect(src).toContain("opacity-50");
    expect(src).toContain("cursor-not-allowed");
  });
});

// ---------------------------------------------------------------------------
// Integration: ParamBitmaskInput uses shared SetupCheckbox
// ---------------------------------------------------------------------------

describe("ParamBitmaskInput shared SetupCheckbox integration", () => {
  const src = read("../primitives/ParamBitmaskInput.tsx");

  it("imports SetupCheckbox from shared module", () => {
    expect(src).toContain('import { SetupCheckbox } from "../shared/SetupCheckbox"');
  });

  it("renders SetupCheckbox for bitmask bits", () => {
    expect(src).toContain("<SetupCheckbox");
  });

  it("does not use native checkbox inputs", () => {
    expect(src).not.toContain('type="checkbox"');
    expect(src).not.toContain("accent-accent");
  });
});

describe("OverviewSection shared status icon integration", () => {
  const src = read("../sections/OverviewSection.tsx");

  it("imports SectionStatusIcon from shared module", () => {
    expect(src).toContain('import { SectionStatusIcon } from "../shared/SectionStatusIcon"');
  });

  it("does not define a local StatusBadge function", () => {
    expect(src).not.toMatch(/function StatusBadge\(/);
  });

  it("uses SectionStatusIcon in JSX", () => {
    expect(src).toContain("<SectionStatusIcon");
  });
});

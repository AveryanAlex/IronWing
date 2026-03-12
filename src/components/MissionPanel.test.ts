import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("MissionPanel shell wiring", () => {
  const src = readFileSync(resolve(__dirname, "MissionPanel.tsx"), "utf-8");

  it("imports MissionWorkspace (map-first desktop shell)", () => {
    expect(src).toContain('import { MissionWorkspace }');
    expect(src).toContain("./mission/MissionWorkspace");
  });

  it("imports MissionMobileDrawer for mobile layout", () => {
    expect(src).toContain('import { MissionMobileDrawer }');
    expect(src).toContain("./mission/MissionMobileDrawer");
  });

  it("does not import MissionTable", () => {
    expect(src).not.toContain("MissionTable");
  });

  it("does not import PlannerToolbar", () => {
    expect(src).not.toContain("PlannerToolbar");
  });

  it("renders MissionWorkspace for desktop (non-mobile)", () => {
    expect(src).toContain("<MissionWorkspace");
  });

  it("renders MissionMobileDrawer for mobile", () => {
    expect(src).toContain("<MissionMobileDrawer");
  });

  it("branches on isMobile prop", () => {
    expect(src).toMatch(/isMobile/);
  });
});

describe("MissionWorkspace desktop layout", () => {
  const src = readFileSync(
    resolve(__dirname, "mission", "MissionWorkspace.tsx"),
    "utf-8",
  );

  it("uses data-mission-workspace attribute", () => {
    expect(src).toContain("data-mission-workspace");
  });

  it("uses data-mission-map-region attribute", () => {
    expect(src).toContain("data-mission-map-region");
  });

  it("imports MissionDesktopShell for the side panel", () => {
    expect(src).toContain('import { MissionDesktopShell }');
  });

  it("imports MissionWorkspaceHeader", () => {
    expect(src).toContain('import { MissionWorkspaceHeader }');
  });

  it("uses react-resizable-panels for map/panel split", () => {
    expect(src).toContain('import { Group, Panel, Separator }');
    expect(src).toContain("react-resizable-panels");
  });

  it("renders MissionMap as the primary content area", () => {
    expect(src).toContain("<MissionMap");
  });

  it("does not import MissionTable", () => {
    expect(src).not.toContain("MissionTable");
  });

  it("does not import PlannerToolbar", () => {
    expect(src).not.toContain("PlannerToolbar");
  });

  it("uses string-based Panel sizes (v4 numeric = pixels, string = percentage)", () => {
    // react-resizable-panels v4: numeric values are PIXELS, strings are PERCENTAGES.
    // Using numeric sizes like defaultSize={35} means 35px, not 35%.
    expect(src).toMatch(/defaultSize="6[0-9]"/);
    expect(src).toMatch(/defaultSize="3[0-9]"/);
    expect(src).not.toMatch(/defaultSize=\{[0-9]/);
    expect(src).not.toMatch(/minSize=\{[0-9]/);
    expect(src).not.toMatch(/maxSize=\{[0-9]/);
  });

  it("side panel has minimum size of at least 25%", () => {
    const match = src.match(/Panel[^>]*defaultSize="3[0-9]"[^>]*minSize="(\d+)"/);
    expect(match).toBeTruthy();
    const minSize = parseInt(match![1], 10);
    expect(minSize).toBeGreaterThanOrEqual(25);
  });
});

describe("MissionDesktopShell side panel", () => {
  const src = readFileSync(
    resolve(__dirname, "mission", "MissionDesktopShell.tsx"),
    "utf-8",
  );

  it("uses data-mission-side-panel attribute", () => {
    expect(src).toContain("data-mission-side-panel");
  });

  it("imports MissionWaypointList (card-based, not table)", () => {
    expect(src).toContain('import { MissionWaypointList }');
  });

  it("imports MissionInspector for selected item editing", () => {
    expect(src).toContain('import { MissionInspector }');
  });

  it("imports MissionPlannerSummary", () => {
    expect(src).toContain('import { MissionPlannerSummary }');
  });

  it("does not import MissionTable", () => {
    expect(src).not.toContain("MissionTable");
  });

  it("does not import PlannerToolbar", () => {
    expect(src).not.toContain("PlannerToolbar");
  });
});

describe("MissionMobileDrawer layout", () => {
  const src = readFileSync(
    resolve(__dirname, "mission", "MissionMobileDrawer.tsx"),
    "utf-8",
  );

  it("uses data-mission-workspace attribute", () => {
    expect(src).toContain("data-mission-workspace");
  });

  it("uses data-mission-mobile-drawer attribute", () => {
    expect(src).toContain("data-mission-mobile-drawer");
  });

  it("uses data-mission-mobile-panel-toggle attribute", () => {
    expect(src).toContain("data-mission-mobile-panel-toggle");
  });

  it("imports MissionWorkspaceHeader", () => {
    expect(src).toContain('import { MissionWorkspaceHeader }');
  });

  it("imports MissionWaypointList", () => {
    expect(src).toContain('import { MissionWaypointList }');
  });

  it("imports MissionMap", () => {
    expect(src).toContain('import { MissionMap }');
  });

  it("does not import MissionTable", () => {
    expect(src).not.toContain("MissionTable");
  });

  it("does not import PlannerToolbar", () => {
    expect(src).not.toContain("PlannerToolbar");
  });
});

describe("MissionWorkspaceHeader toolbar", () => {
  const src = readFileSync(
    resolve(__dirname, "mission", "MissionWorkspaceHeader.tsx"),
    "utf-8",
  );

  it("uses data-mission-workspace-header attribute", () => {
    expect(src).toContain("data-mission-workspace-header");
  });

  it("has mission type selector", () => {
    expect(src).toContain("<select");
    expect(src).toContain("missionType");
  });

  it("has transfer action buttons (Write, Read, Verify, Clear)", () => {
    expect(src).toContain("upload");
    expect(src).toContain("download");
    expect(src).toContain("verify");
    expect(src).toContain("clear");
  });

  it("has item manipulation actions (add, insert, delete, move)", () => {
    expect(src).toContain("addWaypoint");
    expect(src).toContain("insertBefore");
    expect(src).toContain("insertAfter");
    expect(src).toContain("deleteAt");
    expect(src).toContain("moveUp");
    expect(src).toContain("moveDown");
  });

  it("has validate and setCurrent actions", () => {
    expect(src).toContain("validate");
    expect(src).toContain("setCurrent");
  });

  it("does not own a cancel transfer action (lives in MissionTransferStatus)", () => {
    expect(src).not.toMatch(/onClick=\{cancel\}/);
  });
});

describe("MissionTransferStatus dedicated component", () => {
  const src = readFileSync(
    resolve(__dirname, "mission", "MissionTransferStatus.tsx"),
    "utf-8",
  );

  it("uses data-mission-transfer-status attribute", () => {
    expect(src).toContain("data-mission-transfer-status");
  });

  it("has a cancel affordance via onCancel prop", () => {
    expect(src).toContain("onCancel");
    expect(src).toMatch(/onClick=\{onCancel\}/);
  });
});

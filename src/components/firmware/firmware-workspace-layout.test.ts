import { describe, expect, it } from "vitest";

import { resolveFirmwareWorkspaceLayout } from "./firmware-workspace-layout";

describe("resolveFirmwareWorkspaceLayout", () => {
  it("enables full install actions on settled desktop-wide shells", () => {
    const layout = resolveFirmwareWorkspaceLayout({
      width: 1440,
      height: 900,
      tier: "wide",
    });

    expect(layout).toMatchObject({
      mode: "desktop-wide",
      tier: "wide",
      width: 1440,
      height: 900,
      tierMismatch: false,
      panelColumns: "split",
      actionsEnabled: true,
      blockedReason: null,
    });
  });

  it("keeps radiomaster-sized or short layouts browse-only from real dimensions instead of trusting tier alone", () => {
    const layout = resolveFirmwareWorkspaceLayout({
      width: 1280,
      height: 680,
      tier: "wide",
    });

    expect(layout).toMatchObject({
      mode: "browse-radiomaster",
      tier: "wide",
      width: 1280,
      height: 680,
      tierMismatch: false,
      panelColumns: "stacked",
      actionsEnabled: false,
      blockedReason: "radiomaster_viewport",
    });
    expect(layout.blockedDetail).toMatch(/desktop-only/i);
  });

  it("keeps phone widths browse-only while preserving the visible workspace", () => {
    const layout = resolveFirmwareWorkspaceLayout({
      width: 390,
      height: 844,
      tier: "phone",
    });

    expect(layout).toMatchObject({
      mode: "browse-phone",
      tier: "phone",
      width: 390,
      height: 844,
      tierMismatch: false,
      panelColumns: "stacked",
      actionsEnabled: false,
      blockedReason: "phone_viewport",
    });
    expect(layout.blockedDetail).toMatch(/search targets/i);
  });

  it("fails closed when shell tier and viewport dimensions disagree", () => {
    const layout = resolveFirmwareWorkspaceLayout({
      width: 1440,
      height: 900,
      tier: "phone",
    });

    expect(layout).toMatchObject({
      mode: "browse-radiomaster",
      tier: "wide",
      width: 1440,
      height: 900,
      tierMismatch: true,
      actionsEnabled: false,
      blockedReason: "viewport_unsettled",
    });
    expect(layout.blockedTitle).toMatch(/viewport settles/i);
  });

  it("falls back to the desktop-safe viewport when dimensions are malformed", () => {
    const layout = resolveFirmwareWorkspaceLayout({
      width: Number.NaN,
      height: -12,
      tier: "bogus",
    });

    expect(layout).toMatchObject({
      mode: "desktop-wide",
      tier: "wide",
      width: 1440,
      height: 900,
      tierMismatch: false,
      panelColumns: "split",
      actionsEnabled: true,
      blockedReason: null,
    });
  });
});

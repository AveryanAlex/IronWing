import { expect, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable } from "../layout";

export class HudWorkspacePage {
  constructor(private readonly page: Page) {}

  async expectLiveHud(): Promise<void> {
    const hud = this.page.locator(".hud-panel");
    await expect(hud).toBeVisible({ timeout: 15_000 });
    await expect(hud.getByText("MODE", { exact: true })).toBeVisible();
    await expect(hud.getByText("GPS", { exact: true })).toBeVisible();
    await expect(hud.getByText("SAFE", { exact: true })).toBeVisible();
    await expect(hud.getByText("ALT", { exact: true })).toBeVisible();
  }

  async expectPrimarySurfacesReachable(label = "HUD"): Promise<void> {
    const hud = this.page.locator(".hud-panel");
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "HUD panel", locator: hud },
      { label: "mode strip", locator: hud.getByText("MODE", { exact: true }) },
      { label: "GPS tile", locator: hud.getByText("GPS", { exact: true }) },
      { label: "altitude tape", locator: hud.getByText("ALT", { exact: true }) },
    ]);
  }
}

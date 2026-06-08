import { expect, type Locator, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";

export class SettingsWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async expectOpen(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Telemetry & runtime" })).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByText("Telemetry update rate")).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Flight display" })).toBeVisible();
    await expect(this.page.getByText("Synthetic Vision System")).toBeVisible();
    await this.auditLayout("settings open");
  }

  async expectPrimaryControlsReachable(label = "settings"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "telemetry settings section", locator: this.page.getByRole("heading", { name: "Telemetry & runtime" }) },
      { label: "telemetry rate slider", locator: this.page.getByLabel("Telemetry update rate") },
      { label: "display settings section", locator: this.page.getByRole("heading", { name: "Flight display" }) },
      { label: "SVS setting", locator: this.page.getByText("Synthetic Vision System") },
    ]);
  }

  async changeTelemetryRateWithKeyboard(): Promise<{ before: number; after: number }> {
    const slider = this.telemetryRateSlider();
    await expect(slider).toBeVisible({ timeout: 10_000 });
    const before = await this.sliderValue(slider);
    const key = before < 20 ? "ArrowRight" : "ArrowLeft";

    await slider.focus();
    await slider.press(key);
    await expect.poll(() => this.sliderValue(slider), { timeout: 10_000 }).not.toBe(before);

    const after = await this.sliderValue(slider);
    await expect(this.page.getByText(`${after} Hz`).first()).toBeVisible();
    await this.auditLayout("settings telemetry rate changed");
    return { before, after };
  }

  async toggleSyntheticVisionPreference(): Promise<{ before: boolean; after: boolean }> {
    const toggle = this.syntheticVisionToggle();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    const before = await this.switchChecked(toggle);
    const after = !before;

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", String(after), { timeout: 10_000 });
    await expect(this.page.getByText(after ? "Enabled" : "Disabled").first()).toBeVisible();
    await expect
      .poll(() => this.page.evaluate(() => localStorage.getItem("ironwing.hud.svs_enabled")), { timeout: 10_000 })
      .toBe(String(after));
    await this.auditLayout("settings synthetic vision toggled");

    return { before, after };
  }

  async disableSyntheticVisionPreference(): Promise<{ before: boolean; after: boolean }> {
    const toggle = this.syntheticVisionToggle();
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    const before = await this.switchChecked(toggle);
    if (before) {
      await toggle.click();
    }

    await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
    await expect(this.page.getByText("Disabled").first()).toBeVisible();
    await expect
      .poll(() => this.page.evaluate(() => localStorage.getItem("ironwing.hud.svs_enabled")), { timeout: 10_000 })
      .toBe("false");
    await this.auditLayout("settings synthetic vision disabled");

    return { before, after: false };
  }

  private telemetryRateSlider(): Locator {
    return this.page.getByRole("slider").first();
  }

  private syntheticVisionToggle(): Locator {
    return this.page.getByRole("switch").first();
  }

  private async sliderValue(slider: Locator): Promise<number> {
    const raw = await slider.getAttribute("aria-valuenow");
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`Telemetry rate slider has invalid aria-valuenow: ${raw}`);
    }
    return value;
  }

  private async switchChecked(toggle: Locator): Promise<boolean> {
    return (await toggle.getAttribute("aria-checked")) === "true";
  }
}

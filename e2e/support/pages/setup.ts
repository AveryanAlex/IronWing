import { expect, type Locator, type Page } from "@playwright/test";

import { safeParameterEditCandidates, setupSections, type ParameterEdit, type SetupSection } from "../data/setup";
import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";
import { fillAndBlur, isVisible } from "./utils";

const ids = {
  advancedPanel: "parameter-workspace-advanced-panel",
  inputPrefix: "parameter-workspace-input",
  itemPrefix: "parameter-workspace-item",
  metadata: "parameter-domain-metadata",
  overviewBanner: "setup-workspace-overview-banner",
  overviewSection: "setup-workspace-overview-section",
  progress: "parameter-domain-progress",
  root: "parameter-workspace",
  scope: "parameter-domain-scope",
  search: "parameter-expert-search",
  state: "parameter-workspace-state",
  reviewApply: "app-shell-parameter-review-apply",
  reviewCount: "app-shell-parameter-review-count",
  reviewRowPrefix: "app-shell-parameter-review-row",
  reviewSurface: "app-shell-parameter-review-surface",
  reviewToggle: "app-shell-parameter-review-toggle",
  reviewTray: "app-shell-parameter-review-tray",
  sectionDrawer: "setup-workspace-section-drawer",
  sectionDrawerToggle: "setup-workspace-section-drawer-toggle",
} as const;

export class SetupWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async ensureParametersDownloaded(): Promise<void> {
    await this.downloadParametersIfNeeded();
    await this.expectOverview();
  }

  async expectOverview(): Promise<void> {
    await expect(this.page.getByTestId(ids.overviewSection)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.overviewBanner)).toBeVisible();
    await this.auditLayout("setup overview");
  }

  async expectSectionsOpen(sections: readonly SetupSection[] = setupSections): Promise<void> {
    for (const section of sections) {
      await this.openSection(section);
    }
  }

  async stageFirstAvailableSafeParameterEdit(
    candidates: readonly string[] = safeParameterEditCandidates,
  ): Promise<ParameterEdit> {
    await this.openFullParameters();

    for (const name of candidates) {
      const input = await this.findParameterInput(name);
      if (!input) {
        continue;
      }

      const current = Number(await input.inputValue());
      if (!Number.isFinite(current)) {
        continue;
      }

      const next = Number((current + 1).toFixed(2));
      await input.fill(String(next));
      await input.blur();
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(1, { timeout: 10_000 });
      await this.auditLayout(`setup staged ${name}`);
      return { name, current, next };
    }

    throw new Error("No safe editable numeric demo parameter was found");
  }

  async stageRtlReturnAltitudeEdit(): Promise<ParameterEdit> {
    await this.openSectionById("rtl_return");
    const name = "RTL_ALTITUDE";
    const input = this.page.getByTestId("setup-workspace-rtl-return-input-RTL_ALTITUDE");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toBeEnabled();

    const current = Number(await input.inputValue());
    if (!Number.isFinite(current)) {
      throw new Error(`RTL_ALT input has non-numeric value: ${await input.inputValue()}`);
    }

    const next = Number((current + 1).toFixed(2));
    await fillAndBlur(input, String(next));
    await expect(this.page.getByTestId("setup-workspace-rtl-return-staged-RTL_ALTITUDE")).toBeVisible({
      timeout: 10_000,
    });
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(1, { timeout: 10_000 });
    await this.auditLayout("setup staged RTL_ALTITUDE");
    return { name, current, next };
  }

  async expectReviewContains(names: string[]): Promise<void> {
    await expect(this.page.getByTestId(ids.reviewTray)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(ids.reviewCount)).toContainText(/parameter/i);
    await this.ensureReviewSurfaceVisible();

    for (const name of names) {
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toBeVisible();
    }
    await this.auditLayout("setup parameter review");
  }

  async applyStagedParameters(names: string[]): Promise<void> {
    await this.ensureReviewSurfaceVisible();
    await this.page.getByTestId(ids.reviewApply).click();
    for (const name of names) {
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(0, { timeout: 45_000 });
    }
    await expect(this.page.getByTestId(ids.reviewTray)).toHaveCount(0, { timeout: 10_000 });
    await this.auditLayout("setup parameters applied");
  }

  async reloadParametersFromVehicle(): Promise<void> {
    await this.openSection(setupSections[0]);
    await this.expectOverview();
    const refresh = this.page.getByRole("button", { name: "Refresh all" });
    await expect(refresh).toBeEnabled({ timeout: 10_000 });
    await refresh.click();
    await expect(this.page.getByRole("button", { name: "Refresh all" })).toBeVisible({ timeout: 45_000 });
    await this.auditLayout("setup parameters reloaded");
  }

  async expectParameterValue(name: string, expected: number): Promise<void> {
    await this.openFullParameters();
    const input = await this.findParameterInput(name);
    if (!input) {
      throw new Error(`Parameter ${name} disappeared after reload`);
    }

    await expect.poll(async () => Number(await input.inputValue()), { timeout: 10_000 }).toBeCloseTo(expected, 2);
    await this.auditLayout(`setup parameter ${name} value`);
  }

  async expectPrimaryActionsReachable(label = "setup"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "overview section", locator: this.page.getByTestId(ids.overviewSection) },
      { label: "setup banner", locator: this.page.getByTestId(ids.overviewBanner) },
      {
        label: "refresh parameters",
        locator: this.page.getByRole("button", { name: "Refresh all" }),
        requireEnabled: true,
      },
    ]);
  }

  async openSection(section: SetupSection): Promise<void> {
    const navLink = this.page.getByTestId(`setup-workspace-nav-${section.id}`);
    if (!(await isVisible(navLink))) {
      await this.page.getByTestId(ids.sectionDrawerToggle).click();
      await expect(this.page.getByTestId(ids.sectionDrawer)).toHaveAttribute("data-open", "true", { timeout: 10_000 });
      await this.auditLayout("setup section drawer open");
    }

    await navLink.click();
    await expect(this.page.getByTestId(section.testId), `${section.label} should open`).toBeVisible({
      timeout: 15_000,
    });
    await this.auditLayout(`setup section ${section.id}`);
  }

  private async openSectionById(sectionId: SetupSection["id"]): Promise<void> {
    const section = setupSections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      throw new Error(`Setup section ${sectionId} is not defined`);
    }
    await this.openSection(section);
  }

  private async ensureReviewSurfaceVisible(): Promise<void> {
    const surface = this.page.getByTestId(ids.reviewSurface);
    if (!(await isVisible(surface))) {
      await this.page.getByTestId(ids.reviewToggle).click();
    }
    await expect(surface).toBeVisible();
    await this.auditLayout("setup review surface visible");
  }

  private async downloadParametersIfNeeded(): Promise<void> {
    const overview = this.page.getByTestId(ids.overviewSection);
    if (await isVisible(overview)) {
      return;
    }

    const downloadButton = this.page.getByRole("button", { name: "Download parameters" });
    if (!(await isVisible(downloadButton))) {
      return;
    }

    await downloadButton.click();
    await expect(overview).toBeVisible({ timeout: 45_000 });
  }

  private async openFullParameters(): Promise<void> {
    const fullParameters = setupSections.find((section) => section.id === "full_parameters");
    if (!fullParameters) {
      throw new Error("Full Parameters setup section is not defined");
    }

    await this.openSection(fullParameters);
    await expect(this.page.getByTestId(ids.root)).toBeVisible();
    await expect(this.page.getByTestId(ids.state)).toBeVisible();
    await expect(this.page.getByTestId(ids.scope)).toContainText(/live|session|vehicle|none/i);
    await expect(this.page.getByTestId(ids.progress)).toBeVisible();
    await expect(this.page.getByTestId(ids.metadata)).toBeVisible();
    await expect(this.page.getByTestId(ids.advancedPanel)).toBeVisible();
  }

  private async findParameterInput(name: string): Promise<Locator | null> {
    const search = this.page.getByTestId(ids.search);
    await search.fill(name);
    const row = this.page.getByTestId(`${ids.itemPrefix}-${name}`);
    if (!(await isVisible(row))) {
      return null;
    }

    const input = this.page.getByTestId(`${ids.inputPrefix}-${name}`);
    if (!(await isVisible(input)) || !(await input.isEnabled())) {
      return null;
    }
    return input;
  }
}

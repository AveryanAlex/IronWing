import { expect, type Locator, type Page } from "@playwright/test";

import { safeParameterEditCandidates, setupSections, type ParameterEdit, type SetupSection } from "../data/setup";
import {
  expectLayoutTargetReachable,
  expectLayoutTargetsReachable,
  noopLayoutAudit,
  type LayoutAudit,
} from "../layout";
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
  osdEmpty: "setup-workspace-osd-empty",
  osdGrid: "setup-workspace-osd-grid",
  osdGridItemPrefix: "setup-workspace-osd-grid-item",
  osdLibrary: "setup-workspace-osd-library",
  osdLibraryItemPrefix: "setup-workspace-osd-library-item",
  osdPlacedCardPrefix: "setup-workspace-osd-placed-card",
  osdPlacedList: "setup-workspace-osd-placed-list",
  osdPlacePrefix: "setup-workspace-osd-place",
  osdRemovePrefix: "setup-workspace-osd-remove",
  osdScreenSelect: "setup-workspace-osd-screen-select",
  osdSection: "setup-workspace-osd-section",
  osdSummary: "setup-workspace-osd-summary",
} as const;

const osdDemoParamFixture: Array<[string, number]> = [
  ["OSD1_ENABLE", 1],
  ["OSD1_TXT_RES", 0],
  ["OSD1_ALTITUDE_EN", 1],
  ["OSD1_ALTITUDE_X", 3],
  ["OSD1_ALTITUDE_Y", 4],
  ["OSD1_BAT_VOLT_EN", 0],
  ["OSD1_BAT_VOLT_X", 10],
  ["OSD1_BAT_VOLT_Y", 2],
  ["OSD1_GSPEED_EN", 1],
  ["OSD1_GSPEED_X", 7],
  ["OSD1_GSPEED_Y", 9],
];

type OsdCardIdentity = {
  enableParam: string;
  gridItemTestId: string;
  libraryTestId: string;
  placeTestId: string;
  placedTestId: string;
  removeTestId: string;
  xParam: string | null;
  yParam: string | null;
};

export class SetupWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async installOsdDemoParamFixture(): Promise<void> {
    await this.page.addInitScript((entries) => {
      const globalKey = "__ironwingOsdDemoParamFixtureInstalled";
      const globalState = globalThis as typeof globalThis & Record<string, boolean | undefined>;
      if (globalState[globalKey]) {
        return;
      }
      globalState[globalKey] = true;

      const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = function dispatchEventWithOsdFixture(event: Event): boolean {
        if (event instanceof CustomEvent && event.type === "param://store") {
          const detail = augmentParamStoreEvent(event.detail, entries);
          if (detail !== event.detail) {
            return originalDispatchEvent.call(
              this,
              new CustomEvent(event.type, {
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                composed: event.composed,
                detail,
              }),
            );
          }
        }

        return originalDispatchEvent.call(this, event);
      };

      function augmentParamStoreEvent(detail: unknown, fixture: Array<[string, number]>): unknown {
        if (!detail || typeof detail !== "object" || !("value" in detail)) {
          return detail;
        }

        const store = (detail as { value?: unknown }).value;
        if (!store || typeof store !== "object" || !("params" in store) || !("expected_count" in store)) {
          return detail;
        }

        const paramStore = store as {
          params: Record<string, { name: string; value: number; param_type: string; index: number }>;
          expected_count: number;
        };
        if (fixture.every(([name]) => paramStore.params[name])) {
          return detail;
        }

        const params = { ...paramStore.params };
        let index = Object.keys(params).reduce((max, name) => Math.max(max, params[name]?.index ?? -1), -1) + 1;
        for (const [name, value] of fixture) {
          if (!params[name]) {
            params[name] = { name, value, param_type: "int16", index };
            index += 1;
          }
        }

        return {
          ...detail,
          value: {
            ...paramStore,
            params,
            expected_count: Math.max(paramStore.expected_count, Object.keys(params).length),
          },
        };
      }
    }, osdDemoParamFixture);
  }

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

  async expectOsdEditorState(): Promise<{ hasBuilder: boolean }> {
    await this.openSectionById("osd");
    await expect(this.page.getByTestId(ids.osdSection)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.osdSummary)).toBeVisible();

    if (await isVisible(this.page.getByTestId(ids.osdEmpty))) {
      await expect(this.page.getByText(/No OSD parameters detected/i)).toBeVisible();
      await this.auditLayout("setup OSD empty state");
      return { hasBuilder: false };
    }

    await expect(this.page.getByTestId(ids.osdScreenSelect)).toBeVisible();
    await expect(this.page.getByTestId(ids.osdGrid)).toBeVisible();
    await expect(this.page.getByTestId(ids.osdPlacedList)).toBeVisible();
    await expect(this.page.getByTestId(ids.osdLibrary)).toBeVisible();
    await this.expectOsdDemoCards();
    await this.expectOsdLayoutReachable("setup OSD editor");
    await this.expectOsdGridItemsUsable("setup OSD editor");
    return { hasBuilder: true };
  }

  async exerciseOsdPlacementIfAvailable(): Promise<boolean> {
    await this.openSectionById("osd");
    if (await isVisible(this.page.getByTestId(ids.osdEmpty))) {
      await this.auditLayout("setup OSD placement skipped empty state");
      return false;
    }

    const firstLibraryCard = this.page
      .locator(`[data-testid^="${ids.osdLibraryItemPrefix}-"][data-enable-param][draggable="true"]`)
      .first();
    if (await isVisible(firstLibraryCard)) {
      const identity = await osdCardIdentity(firstLibraryCard, ids.osdLibraryItemPrefix);
      await this.dragOsdCard(identity.libraryTestId, ids.osdGrid, { x: 96, y: 80 });
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${identity.enableParam}`)).toHaveCount(1, {
        timeout: 10_000,
      });
      await expect(this.page.getByTestId(identity.gridItemTestId)).toBeVisible({ timeout: 10_000 });
      await this.expectOsdLayoutReachable(`setup OSD placed ${identity.enableParam}`);
      await this.expectOsdGridItemsUsable(`setup OSD placed ${identity.enableParam}`);

      const placedCard = this.page.getByTestId(identity.placedTestId);
      await expect(placedCard).toBeVisible();
      await this.dragOsdCard(identity.placedTestId, ids.osdLibrary);
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${identity.enableParam}`)).toHaveCount(0, {
        timeout: 10_000,
      });
      await this.expectOsdCoordinateReviewRowsCleared(identity);
      await expect(this.page.getByTestId(identity.libraryTestId)).toBeVisible({ timeout: 10_000 });
      await this.auditLayout(`setup OSD reverted ${identity.enableParam}`);
      return true;
    }

    const firstPlacedCard = this.page
      .locator(`[data-testid^="${ids.osdPlacedCardPrefix}-"][data-enable-param][draggable="true"]`)
      .first();
    if (!(await isVisible(firstPlacedCard))) {
      await this.auditLayout("setup OSD placement unavailable");
      return false;
    }

    const identity = await osdCardIdentity(firstPlacedCard, ids.osdPlacedCardPrefix);
    await this.dragOsdCard(identity.placedTestId, ids.osdLibrary);
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${identity.enableParam}`)).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(this.page.getByTestId(identity.libraryTestId)).toBeVisible({ timeout: 10_000 });
    await this.expectOsdLayoutReachable(`setup OSD removed ${identity.enableParam}`);
    await this.expectOsdGridItemsUsable(`setup OSD removed ${identity.enableParam}`);

    await this.page.getByTestId(identity.libraryTestId).getByTestId(identity.placeTestId).click();
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${identity.enableParam}`)).toHaveCount(0, {
      timeout: 10_000,
    });
    await this.expectOsdCoordinateReviewRowsCleared(identity);
    await expect(this.page.getByTestId(identity.placedTestId)).toBeVisible({ timeout: 10_000 });
    await this.auditLayout(`setup OSD restored ${identity.enableParam}`);
    return true;
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

  private async expectOsdLayoutReachable(label: string): Promise<void> {
    await this.auditLayout(label);
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "screen selector", locator: this.page.getByTestId(ids.osdScreenSelect), requireEnabled: true },
      { label: "preview grid", locator: this.page.getByTestId(ids.osdGrid) },
      { label: "placed item list", locator: this.page.getByTestId(ids.osdPlacedList) },
      { label: "item library", locator: this.page.getByTestId(ids.osdLibrary) },
    ]);

    const placeButton = this.page.locator(`button[data-testid^="${ids.osdPlacePrefix}-"]:not([disabled])`).first();
    if (await isVisible(placeButton)) {
      await expectLayoutTargetReachable(this.page, `${label}: first place control`, {
        label: "first place control",
        locator: placeButton,
        requireEnabled: true,
        requireUncovered: true,
      });
    }

    const removeButton = this.page.locator(`button[data-testid^="${ids.osdRemovePrefix}-"]:not([disabled])`).first();
    if (await isVisible(removeButton)) {
      await expectLayoutTargetReachable(this.page, `${label}: first remove control`, {
        label: "first remove control",
        locator: removeButton,
        requireEnabled: true,
        requireUncovered: true,
      });
    }

    const gridItems = this.page.locator(`[data-testid^="${ids.osdGridItemPrefix}-"]`);
    const gridItemCount = Math.min(await gridItems.count(), 8);
    for (let index = 0; index < gridItemCount; index += 1) {
      await expectLayoutTargetReachable(this.page, `${label}: grid item ${index + 1}`, {
        label: `grid item ${index + 1}`,
        locator: gridItems.nth(index),
      });
    }
  }

  private async expectOsdGridItemsUsable(label: string): Promise<void> {
    const snapshot = await this.page.getByTestId(ids.osdGrid).evaluate((grid) => {
      const columns = Number((grid as HTMLElement).dataset.gridColumns);
      const rows = Number((grid as HTMLElement).dataset.gridRows);
      const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-testid^="setup-workspace-osd-grid-item-"]'))
        .filter((item) => {
          const style = getComputedStyle(item);
          const rect = item.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((item) => {
          const x = Number(item.dataset.gridX);
          const y = Number(item.dataset.gridY);
          return {
            testId: item.dataset.testid ?? "unknown",
            x,
            y,
          };
        });

      const invalidCells = items.filter(
        (item) =>
          !Number.isInteger(item.x) ||
          !Number.isInteger(item.y) ||
          !Number.isFinite(columns) ||
          !Number.isFinite(rows) ||
          item.x < 0 ||
          item.y < 0 ||
          item.x >= columns ||
          item.y >= rows,
      );

      const seenCells = new Map<string, string>();
      const duplicateCells: { cell: string; left: string; right: string }[] = [];
      for (const item of items) {
        const cell = `${item.x},${item.y}`;
        const existing = seenCells.get(cell);
        if (existing) {
          duplicateCells.push({ cell, left: existing, right: item.testId });
        } else {
          seenCells.set(cell, item.testId);
        }
      }

      return {
        duplicateCells,
        invalidCells: invalidCells.map((item) => item.testId),
      };
    });

    expect(snapshot.invalidCells, `${label} OSD grid items should declare in-range grid cells`).toEqual([]);
    expect(snapshot.duplicateCells, `${label} OSD grid items should not occupy identical cells`).toEqual([]);
  }

  private async dragOsdCard(
    sourceTestId: string,
    targetTestId: string,
    targetPosition?: { x: number; y: number },
  ): Promise<void> {
    await this.page.evaluate(
      ({ sourceTestId, targetTestId, targetPosition }) => {
        const source = document.querySelector<HTMLElement>(`[data-testid="${sourceTestId}"]`);
        const target = document.querySelector<HTMLElement>(`[data-testid="${targetTestId}"]`);
        if (!source || !target) {
          throw new Error(`Unable to find OSD drag source ${sourceTestId} or target ${targetTestId}`);
        }

        const dataTransfer = new DataTransfer();
        const sourceBounds = source.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        const clientX = targetBounds.left + (targetPosition?.x ?? targetBounds.width / 2);
        const clientY = targetBounds.top + (targetPosition?.y ?? targetBounds.height / 2);

        source.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            clientX: sourceBounds.left + sourceBounds.width / 2,
            clientY: sourceBounds.top + sourceBounds.height / 2,
            dataTransfer,
          }),
        );
        target.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            dataTransfer,
          }),
        );
        target.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            dataTransfer,
          }),
        );
        source.dispatchEvent(
          new DragEvent("dragend", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            dataTransfer,
          }),
        );
      },
      { sourceTestId, targetTestId, targetPosition },
    );
  }

  private async expectOsdDemoCards(): Promise<void> {
    await expect(this.page.locator(`[data-testid^="${ids.osdLibraryItemPrefix}-"][data-enable-param]`)).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(this.page.locator(`[data-testid^="${ids.osdPlacedCardPrefix}-"][data-enable-param]`)).toHaveCount(2, {
      timeout: 10_000,
    });
  }

  private async expectOsdCoordinateReviewRowsCleared(identity: OsdCardIdentity): Promise<void> {
    for (const paramName of [identity.xParam, identity.yParam]) {
      if (paramName) {
        await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${paramName}`)).toHaveCount(0, { timeout: 10_000 });
      }
    }
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

async function requiredAttribute(locator: Locator, name: string): Promise<string> {
  const value = await locator.getAttribute(name);
  if (!value) {
    throw new Error(`Expected ${name} attribute on ${await locator.evaluate((element) => element.outerHTML)}`);
  }
  return value;
}

async function osdCardIdentity(locator: Locator, currentPrefix: string): Promise<OsdCardIdentity> {
  const enableParam = await requiredAttribute(locator, "data-enable-param");
  const currentTestId = await requiredAttribute(locator, "data-testid");
  const suffix = currentTestId.startsWith(currentPrefix) ? currentTestId.slice(currentPrefix.length) : null;
  if (!suffix) {
    throw new Error(`Unexpected OSD card test id ${currentTestId}`);
  }

  return {
    enableParam,
    gridItemTestId: `${ids.osdGridItemPrefix}${suffix}`,
    libraryTestId: `${ids.osdLibraryItemPrefix}${suffix}`,
    placeTestId: `${ids.osdPlacePrefix}${suffix}`,
    placedTestId: `${ids.osdPlacedCardPrefix}${suffix}`,
    removeTestId: `${ids.osdRemovePrefix}${suffix}`,
    xParam: await locator.getAttribute("data-x-param"),
    yParam: await locator.getAttribute("data-y-param"),
  };
}

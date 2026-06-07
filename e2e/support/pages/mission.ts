import { expect, type Locator, type Page } from "@playwright/test";

import type { MissionItemDraft } from "../data/mission";
import { expectLayoutTargetsReachable } from "../layout";
import { expectNumberInputClose, fillAndBlur, isVisible } from "./utils";

const ids = {
  addWaypoint: "mission-draft-list-add",
  addSurveyGrid: "mission-draft-list-add-survey-grid",
  commandHelp: "mission-command-help",
  commandPicker: "mission-command-picker",
  commandSelect: "mission-command-select",
  fieldPrefix: "mission-inspector-field",
  fenceAddInclusionCircle: "mission-fence-add-inclusion-circle",
  fenceList: "mission-fence-list",
  inspectorAltitude: "mission-inspector-altitude",
  inspectorEmpty: "mission-inspector-empty",
  inspectorLatitude: "mission-inspector-latitude",
  inspectorLongitude: "mission-inspector-longitude",
  listEmpty: "mission-draft-list-empty",
  modeFence: "mission-mode-fence",
  modeMission: "mission-mode-mission",
  modeRally: "mission-mode-rally",
  planningStats: "mission-planning-stats",
  prompt: "mission-replace-prompt",
  promptConfirm: "mission-replace-prompt-confirm",
  rallyAdd: "mission-rally-add",
  rallyList: "mission-rally-list",
  ready: "mission-workspace-ready",
  root: "mission-workspace",
  toolbarRedo: "mission-redo",
  toolbarUndo: "mission-undo",
  toolbarMore: "mission-toolbar-more",
  toolbarNew: "mission-toolbar-new",
  toolbarRead: "mission-toolbar-read",
  toolbarUpload: "mission-toolbar-upload",
} as const;

export class MissionWorkspacePage {
  constructor(private readonly page: Page) {}

  async expectOpen(): Promise<void> {
    await expect(this.page.getByTestId(ids.root)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.ready)).toBeVisible();
    await expect(this.page.getByTestId(ids.planningStats)).toBeVisible();
  }

  async clearDraft(): Promise<void> {
    if ((await this.missionItemRows().count()) === 0) {
      return;
    }

    await this.clickToolbarAction(ids.toolbarNew);
    const prompt = this.page.getByTestId(ids.prompt);
    if (await isVisible(prompt)) {
      await this.page.getByTestId(ids.promptConfirm).click();
    }
    await this.expectDraftEmpty();
  }

  async expectDraftEmpty(): Promise<void> {
    await expect(this.page.getByTestId(ids.listEmpty)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(ids.inspectorEmpty)).toBeVisible();
  }

  async authorItems(items: MissionItemDraft[]): Promise<void> {
    for (const [index, item] of items.entries()) {
      await this.addItem(index, item);
    }
    await this.expectDraftItemCount(items.length);
  }

  async expectDraftItemCount(count: number, timeout = 10_000): Promise<void> {
    await expect(this.missionItemRows()).toHaveCount(count, { timeout });
  }

  async uploadToVehicle(): Promise<void> {
    const upload = this.page.getByTestId(ids.toolbarUpload);
    await expect(upload).toBeEnabled({ timeout: 10_000 });
    await upload.click();
    await expect(upload).toContainText(/Uploaded/i, { timeout: 30_000 });
  }

  async readFromVehicle(expectedItems: number): Promise<void> {
    await this.clickToolbarAction(ids.toolbarRead);
    await this.expectDraftItemCount(expectedItems, 30_000);
  }

  async expectItems(items: MissionItemDraft[]): Promise<void> {
    for (const [index, item] of items.entries()) {
      await this.expectItem(index, item);
    }
  }

  async expectPrimaryActionsReachable(label = "mission"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "mission workspace", locator: this.page.getByTestId(ids.root) },
      { label: "planning stats", locator: this.page.getByTestId(ids.planningStats) },
      { label: "add waypoint", locator: this.page.getByTestId(ids.addWaypoint), requireEnabled: true },
      { label: "upload action", locator: this.page.getByTestId(ids.toolbarUpload) },
      { label: "more actions", locator: this.page.getByTestId(ids.toolbarMore) },
    ]);
  }

  async expectUndoRedoForWaypointAuthoring(): Promise<void> {
    await this.clearDraft();
    await this.page.getByTestId(ids.addWaypoint).click();
    await this.expectDraftItemCount(1);

    await this.page.getByTestId(ids.toolbarUndo).click();
    await this.expectDraftEmpty();

    await this.page.getByTestId(ids.toolbarRedo).click();
    await this.expectDraftItemCount(1);
    await this.clearDraft();
  }

  async expectSurveyFenceAndRallyToolsCreateDraftContent(): Promise<void> {
    await this.clearDraft();
    await this.switchMode("mission");
    await this.page.getByTestId(ids.addSurveyGrid).click();
    await this.expectAtLeastOne(this.surveyBlocks(), "survey block");

    await this.switchMode("fence");
    await this.page.getByTestId(ids.fenceAddInclusionCircle).click();
    await this.expectAtLeastOne(this.fenceRegions(), "fence region");

    await this.switchMode("rally");
    await this.page.getByTestId(ids.rallyAdd).click();
    await this.expectAtLeastOne(this.rallyPoints(), "rally point");
  }

  private async addItem(index: number, item: MissionItemDraft): Promise<void> {
    await this.page.getByTestId(ids.addWaypoint).click();
    await this.expectDraftItemCount(index + 1);
    await this.selectItem(index);
    await this.setSelectedItem(item);
  }

  private async setSelectedItem(item: MissionItemDraft): Promise<void> {
    await expect(this.page.getByTestId(ids.commandPicker)).toBeVisible({ timeout: 10_000 });
    await this.page.getByTestId(ids.commandSelect).selectOption(item.command);
    await expect(this.page.getByTestId(ids.commandHelp)).toBeVisible();
    await fillAndBlur(this.page.getByTestId(ids.inspectorLatitude), item.latitude.toFixed(7));
    await fillAndBlur(this.page.getByTestId(ids.inspectorLongitude), item.longitude.toFixed(7));

    const altitude = this.page.getByTestId(ids.inspectorAltitude);
    if (item.altitude !== undefined && await isVisible(altitude)) {
      await fillAndBlur(altitude, String(item.altitude));
    }

    for (const [field, value] of Object.entries(item.fields ?? {})) {
      const fieldInput = this.page.getByTestId(`${ids.fieldPrefix}-${field}`);
      await expect(fieldInput, `mission field ${field} should be editable`).toBeVisible({ timeout: 10_000 });
      await fillAndBlur(fieldInput, value);
    }
  }

  private async expectItem(index: number, item: MissionItemDraft): Promise<void> {
    await this.selectItem(index);
    await expect(this.page.getByTestId(ids.commandSelect)).toHaveValue(item.command, { timeout: 10_000 });
    await expectNumberInputClose(this.page.getByTestId(ids.inspectorLatitude), item.latitude);
    await expectNumberInputClose(this.page.getByTestId(ids.inspectorLongitude), item.longitude);
    if (item.altitude !== undefined) {
      await expectNumberInputClose(this.page.getByTestId(ids.inspectorAltitude), item.altitude);
    }

    for (const [field, value] of Object.entries(item.fields ?? {})) {
      await expectNumberInputClose(this.page.getByTestId(`${ids.fieldPrefix}-${field}`), Number(value));
    }
  }

  private async selectItem(index: number): Promise<void> {
    await this.missionItemRows().nth(index).click();
    await expect(this.page.getByTestId(ids.commandPicker)).toBeVisible({ timeout: 10_000 });
  }

  private async clickToolbarAction(testId: string): Promise<void> {
    const direct = this.page.getByTestId(testId);
    if (await isVisible(direct)) {
      await direct.click();
      return;
    }

    await this.page.getByTestId(ids.toolbarMore).click();
    const menuAction = this.page.getByTestId(testId);
    await expect(menuAction).toBeVisible({ timeout: 10_000 });
    await menuAction.click();
  }

  private async switchMode(mode: "mission" | "fence" | "rally"): Promise<void> {
    const modeTestIds = {
      mission: ids.modeMission,
      fence: ids.modeFence,
      rally: ids.modeRally,
    } as const;
    const modeRoots = {
      mission: this.page.getByTestId(ids.ready),
      fence: this.page.getByTestId(ids.fenceList),
      rally: this.page.getByTestId(ids.rallyList),
    } as const;

    await this.page.getByRole("button", { name: "Select mission editing mode" }).click();
    const targetMode = this.page.getByTestId(modeTestIds[mode]);
    if (await targetMode.isEnabled()) {
      await targetMode.click();
    } else {
      await this.page.keyboard.press("Escape");
    }
    await expect(modeRoots[mode]).toBeVisible({ timeout: 10_000 });
  }

  private missionItemRows(): Locator {
    return this.page.locator("[data-mission-waypoint-card]");
  }

  private surveyBlocks(): Locator {
    return this.page.locator('[data-testid^="mission-survey-block-"]');
  }

  private fenceRegions(): Locator {
    return this.page.locator('[data-testid^="mission-fence-region-"]');
  }

  private rallyPoints(): Locator {
    return this.page.locator('[data-testid^="mission-rally-point-"]');
  }

  private async expectAtLeastOne(locator: Locator, label: string): Promise<void> {
    await expect.poll(() => locator.count(), { message: `${label} should be created`, timeout: 10_000 }).toBeGreaterThan(0);
    await expect(locator.first()).toBeVisible();
  }
}

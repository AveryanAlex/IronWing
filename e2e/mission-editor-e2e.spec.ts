import { test, expect } from "./fixtures/mock-platform";
import {
  bootstrapDesktopMissionEditor,
  clickMapAtRatio,
  drawPentagonOnMissionMap,
  expectHistoryTooltip,
  missionCard,
  waitForMissionPathDebugState,
  waitForTerrainReady,
} from "./helpers/mission-flow";

test("desktop workflow proves inspector metadata, history, terrain, render features, and auto-grid", async ({
  page,
  mockPlatform,
}) => {
  await bootstrapDesktopMissionEditor(page, mockPlatform);

  const cards = page.locator("[data-mission-waypoint-card]");
  const undoButton = page.locator('[data-testid="mission-undo"]');
  const redoButton = page.locator('[data-testid="mission-redo"]');

  await expect(cards).toHaveCount(6);
  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();

  await missionCard(page, 0).click();
  await expect(page.locator("[data-mission-inspector]")).toBeVisible();
  await expect(page.locator("[data-mission-command-picker]")).toContainText("Waypoint");

  await page.locator("[data-mission-command-picker]").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Loiter Turns" }).click();

  await expect(page.locator("[data-mission-command-picker]")).toContainText("Loiter Turns");
  await expect(page.locator('[data-command-field="turns"]')).toBeVisible();
  await expect(page.locator('[data-command-field="radius_m"]')).toBeVisible();
  await expect(page.locator('[data-command-field="hold_time_s"]')).toHaveCount(0);
  await expect(page.locator("[data-mission-command-help]")).toContainText(
    "Circle a location for a specified number of turns.",
  );
  await expect(page.locator("[data-mission-command-raw-readonly]")).toHaveCount(0);

  await missionCard(page, 4).click();
  await missionCard(page, 5).click({ modifiers: ["Control"] });
  await expect(page.locator("[data-mission-bulk-edit-panel]")).toContainText("2 selected");

  await page.locator("[data-mission-bulk-altitude]").fill("90");
  await page.locator("[data-mission-bulk-altitude]").press("Enter");
  await expect(missionCard(page, 4)).toContainText("90m");
  await expect(missionCard(page, 5)).toContainText("90m");

  await page.locator("[data-mission-bulk-delete]").click();
  await expect(cards).toHaveCount(4);
  await expectHistoryTooltip(page, "mission-undo", "Undo (4 available)");
  await expect(redoButton).toBeDisabled();

  await undoButton.click();
  await expect(cards).toHaveCount(6);
  await expectHistoryTooltip(page, "mission-undo", "Undo (3 available)");
  await expectHistoryTooltip(page, "mission-redo", "Redo (1 available)");

  await undoButton.click();
  await expect(missionCard(page, 4)).toContainText("35m");
  await expect(missionCard(page, 5)).toContainText("12m");
  await expectHistoryTooltip(page, "mission-redo", "Redo (2 available)");

  await missionCard(page, 0).click();
  await undoButton.click();
  await expect(page.locator("[data-mission-command-picker]")).toContainText("Waypoint");
  await expect(page.locator('[data-command-field="hold_time_s"]')).toBeVisible();
  await expect(page.locator('[data-command-field="turns"]')).toHaveCount(0);
  await expectHistoryTooltip(page, "mission-undo", "Undo (1 available)");

  await undoButton.click();
  await expect(cards).toHaveCount(0);
  await expect(undoButton).toBeDisabled();
  await expectHistoryTooltip(page, "mission-redo", "Redo (4 available)");

  await redoButton.click();
  await expect(cards).toHaveCount(6);

  await redoButton.click();
  await missionCard(page, 0).click();
  await expect(page.locator("[data-mission-command-picker]")).toContainText("Loiter Turns");

  await redoButton.click();
  await expect(missionCard(page, 4)).toContainText("90m");
  await expect(missionCard(page, 5)).toContainText("90m");

  await redoButton.click();
  await expect(cards).toHaveCount(4);
  await expect(redoButton).toBeDisabled();

  const chainModeButton = page.locator('[data-testid="mission-chain-mode"]');
  await chainModeButton.click();
  await expect(chainModeButton).toHaveAttribute("aria-pressed", "true");

  await clickMapAtRatio(page, 0.84, 0.22);
  await expect(cards).toHaveCount(5);
  await expect(missionCard(page, 4)).toBeVisible();

  await chainModeButton.click();
  await expect(chainModeButton).toHaveAttribute("aria-pressed", "false");

  const missionPathDebug = await waitForMissionPathDebugState(page);
  const featureKinds = missionPathDebug.missionPathFeatureKinds;
  const presentKinds = new Set(
    missionPathDebug.missionPathGeoJson.features
      .map((feature) => feature.properties?.kind)
      .filter((kind): kind is string => Boolean(kind)),
  );

  expect(presentKinds).toEqual(
    expect.objectContaining ? presentKinds : presentKinds,
  );
  expect(presentKinds.has("straight")).toBe(true);
  expect(presentKinds.has("spline")).toBe(true);
  expect(presentKinds.has("arc")).toBe(true);
  expect(presentKinds.has("loiter")).toBe(true);
  expect(presentKinds.has("label")).toBe(true);
  expect(featureKinds.straight).toBeGreaterThan(0);
  expect(featureKinds.spline).toBeGreaterThan(0);
  expect(featureKinds.arc).toBeGreaterThan(0);
  expect(featureKinds.loiter).toBeGreaterThan(0);
  expect(featureKinds.label).toBeGreaterThan(0);

  await page.locator("[data-mission-auto-grid-open]").click();
  await expect(page.locator("[data-mission-auto-grid-dialog]")).toBeVisible();

  await page.locator("[data-mission-grid-draw-toggle]").click();
  await expect(page.locator("[data-mission-grid-draw-toggle]")).toContainText("Stop Drawing");

  await drawPentagonOnMissionMap(page);
  await page.locator("[data-mission-grid-draw-toggle]").click();
  await expect(page.locator("[data-mission-grid-draw-toggle]")).toContainText("Draw Area");

  await page.locator("[data-mission-grid-spacing]").fill("80");
  await page.locator("[data-mission-grid-angle]").fill("15");
  await page.locator("[data-mission-grid-insert-after]").click();
  await expect(page.locator("[data-mission-grid-generate]")).toBeEnabled();

  const beforeAutoGridCount = await cards.count();
  await page.locator("[data-mission-grid-generate]").click();

  await expect(page.locator("[data-mission-auto-grid-dialog]")).toHaveCount(0);
  await expect.poll(async () => await cards.count()).toBeGreaterThan(beforeAutoGridCount);
  await waitForTerrainReady(page);

  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await expect(page.locator('[data-testid="mission-stats-distance"]')).toBeVisible();
  await expect.poll(async () => await page.locator('[data-testid="terrain-waypoint-marker"]').count()).toBeGreaterThan(0);
});

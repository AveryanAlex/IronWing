import { test, expect } from "./fixtures/mock-platform";
import {
  bootstrapDesktopMissionEditor,
  bootstrapMissionEditor,
  clickMapAtRatio,
  closeMissionMobileDrawer,
  drawPentagonOnMissionMap,
  expectHistoryTooltip,
  expectMissionDesktopShellVisible,
  expectMissionDrawerClosed,
  expectMissionDrawerOpen,
  missionCard,
  openMissionMobileDrawer,
  waitForMissionPathDebugState,
  waitForSurveyDebugState,
  waitForTerrainReady,
} from "./helpers/mission-flow";

test("desktop seed hydrates the mixed mission proof through Read", async ({
  page,
  mockPlatform,
}) => {
  const preset = await bootstrapMissionEditor(page, mockPlatform, "desktop");

  expect(preset).toMatchObject({ width: 1440, height: 900, isMobile: false });
  await expectMissionDesktopShellVisible(page);
  await expect(page.locator("[data-mission-waypoint-card]")).toHaveCount(6);
  await expect(missionCard(page, 0)).toBeVisible();
  await waitForTerrainReady(page);
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await expect(page.locator('[data-testid="mission-stats-distance"]')).toBeVisible();
});

test("desktop workflow proves inspector metadata, history, terrain, render features, and survey planning", async ({
  page,
  mockPlatform,
}) => {
  await bootstrapDesktopMissionEditor(page, mockPlatform);
  await expectMissionDesktopShellVisible(page);

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
  const surveyPanel = page.locator("[data-survey-planner-panel]");
  await expect(surveyPanel).toBeVisible();
  await expect(page.locator("[data-mission-side-panel]")).toHaveAttribute("data-survey-mode", "open");

  const drawButton = surveyPanel.locator("button").filter({ hasText: /draw area|stop drawing/i }).first();
  await drawButton.click();
  await expect(drawButton).toContainText("Stop drawing");
  await expect(chainModeButton).toHaveAttribute("aria-pressed", "false");

  await drawPentagonOnMissionMap(page);
  await clickMapAtRatio(page, 0.32, 0.24);
  await expect(surveyPanel).toContainText("Region 1");
  await expect(surveyPanel).toContainText(/5 vertices in the active region/i);

  const generateButton = page.locator("[data-survey-generate]");
  await expect(generateButton).toBeDisabled();

  await page.getByLabel("Search cameras").fill("DJI Mavic 3E");
  await surveyPanel.getByRole("button", { name: /DJI Mavic 3E/i }).click();
  await expect(surveyPanel).toContainText("Selected camera");
  await expect(surveyPanel).toContainText("DJI Mavic 3E");
  await expect(generateButton).toBeEnabled();

  await page.getByLabel("Front overlap").fill("82");
  await page.getByLabel("Side overlap").fill("74");
  await page.getByLabel("Track angle").fill("15");
  await page.getByLabel("Turnaround distance").fill("20");

  await generateButton.click();

  await expect(surveyPanel).toContainText("Survey stats");
  await expect(surveyPanel).toContainText(/Flight time/i);
  await expect(surveyPanel).toContainText(/Lanes/i);

  const surveyDebug = await waitForSurveyDebugState(page);
  expect(surveyDebug.polygonGeoJson.features).toHaveLength(1);
  expect(surveyDebug.coverageGeoJson.features.length).toBeGreaterThan(0);
  expect(surveyDebug.transectsGeoJson.features.length).toBeGreaterThan(0);
  expect(surveyDebug.coverageGeoJson.features[0]?.properties?.crosshatch).toBe(false);
  expect(surveyDebug.coverageGeoJson.features[0]?.properties?.laneSpacing_m ?? 0).toBeGreaterThan(0);

  await page.getByRole("button", { name: /close survey planner/i }).click();
  await expect(page.locator("[data-mission-side-panel]")).toHaveAttribute("data-survey-mode", "closed");
  await expect(page.locator("[data-survey-region-card]")).toHaveCount(1);
  await expect(page.locator("[data-survey-region-card]")).toContainText(/photos/i);

  await waitForTerrainReady(page);
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await expect(page.locator('[data-testid="mission-stats-distance"]')).toBeVisible();
  await expect(cards).toHaveCount(5);
});

test("Radiomaster viewport keeps desktop mission controls reachable at 1280x720", async ({
  page,
  mockPlatform,
}) => {
  const preset = await bootstrapMissionEditor(page, mockPlatform, "radiomaster");

  expect(preset).toMatchObject({ width: 1280, height: 720, isMobile: false });
  await expectMissionDesktopShellVisible(page);

  const cards = page.locator("[data-mission-waypoint-card]");
  const undoButton = page.locator('[data-testid="mission-undo"]');
  const redoButton = page.locator('[data-testid="mission-redo"]');

  await expect(cards).toHaveCount(6);
  await expect(undoButton).toBeVisible();
  await expect(redoButton).toBeVisible();
  await expect(undoButton).toHaveAttribute("aria-label", /Undo \([0-9]+ available\)/);
  await expect(redoButton).toHaveAttribute("aria-label", "Redo (0 available)");
  await waitForTerrainReady(page);
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await expect(page.locator('[data-testid="mission-stats-distance"]')).toBeVisible();

  await missionCard(page, 0).click();
  await expect(missionCard(page, 0)).toBeVisible();
  await expect(page.locator("[data-mission-inspector]")).toBeVisible();
  await expect(page.locator("[data-mission-command-picker]")).toContainText("Waypoint");

  await undoButton.click();
  await expect(cards).toHaveCount(0);
  await expect(redoButton).toBeEnabled();

  await redoButton.click();
  await expect(cards).toHaveCount(6);
  await waitForTerrainReady(page);
  await expect(missionCard(page, 0)).toBeVisible();
});

test("phone viewport reaches mission list and inspector through the mobile drawer", async ({
  page,
  mockPlatform,
}) => {
  const preset = await bootstrapMissionEditor(page, mockPlatform, "phone");

  expect(preset).toMatchObject({ width: 390, height: 844, isMobile: true });
  await expect(page.locator("[data-mission-side-panel]")).toHaveCount(0);
  await expectMissionDrawerClosed(page);

  await openMissionMobileDrawer(page);
  await expectMissionDrawerOpen(page);
  await expect(missionCard(page, 0)).toBeVisible();
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await expect(page.locator('[data-testid="mission-stats-distance"]')).toBeVisible();

  await missionCard(page, 0).click();
  await expect(page.locator("[data-mission-inspector]")).toBeVisible();
  await expect(page.locator("[data-mission-command-picker]")).toContainText("Waypoint");

  await closeMissionMobileDrawer(page);

  const chainModeButton = page.locator('[data-testid="mission-chain-mode"]');
  await chainModeButton.click();
  await expect(chainModeButton).toHaveAttribute("aria-pressed", "true");
  await clickMapAtRatio(page, 0.72, 0.24);

  await openMissionMobileDrawer(page);
  await expect(page.locator("[data-mission-waypoint-card]")).toHaveCount(7);
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");
  await waitForTerrainReady(page);
});

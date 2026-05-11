import type { Locator, Page } from "@playwright/test";

import {
  applyShellViewport,
  connectionSelectors,
  expect,
  liveSurfaceSelectors,
  missionWorkspaceLocator,
  missionWorkspaceSelectors,
  openMissionWorkspace,
  test,
  type MockPlatformFixture,
} from "./fixtures/mock-platform";

test.skip(process.env.VITE_IRONWING_MOCK_PROFILE !== "demo", "Requires VITE_IRONWING_MOCK_PROFILE=demo");

const AUTO_MISSION_PLAN = JSON.stringify(
  {
    fileType: "Plan",
    version: 1,
    groundStation: "QGroundControl",
    mission: {
      version: 2,
      firmwareType: 12,
      vehicleType: 2,
      cruiseSpeed: 15,
      hoverSpeed: 5,
      plannedHomePosition: [47.397742, 8.545594, 488],
      items: [
        {
          type: "SimpleItem",
          command: 22,
          frame: 3,
          autoContinue: true,
          params: [0, 0, 0, 0, 47.397742, 8.545594, 4],
        },
        {
          type: "SimpleItem",
          command: 16,
          frame: 3,
          autoContinue: true,
          params: [0, 1, 0, 0, 47.397762, 8.545614, 4],
        },
        {
          type: "SimpleItem",
          command: 21,
          frame: 3,
          autoContinue: true,
          params: [0, 0, 0, 0, 47.397762, 8.545614, 0],
        },
      ],
    },
  },
  null,
  2,
);

async function connectDemo(page: Page, mockPlatform: MockPlatformFixture, preset = "quadcopter") {
  await applyShellViewport(page, "desktop");
  await page.goto("/");
  await mockPlatform.reset();
  await mockPlatform.waitForOperatorWorkspace();
  await expect(page.locator(connectionSelectors.transportSelect)).toHaveValue("demo");
  await page.locator(connectionSelectors.demoPreset).selectOption(preset);
  await page.locator(connectionSelectors.connectButton).click();
  await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", { timeout: 10_000 });
}

async function readMetricValue(locator: Locator): Promise<number> {
  const text = await locator.innerText();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    throw new Error(`Could not parse numeric metric from ${JSON.stringify(text)}`);
  }
  return Number(match[0]);
}

const sidebarTelemetrySelectors = {
  state: '[data-testid="sidebar-telemetry-state"] dd',
  mode: '[data-testid="sidebar-telemetry-mode"] dd',
  altitude: '[data-testid="sidebar-telemetry-altitude"] dd',
  speed: '[data-testid="sidebar-telemetry-speed"] dd',
} as const;

function sidebarMetric(page: Page, selector: keyof typeof sidebarTelemetrySelectors): Locator {
  return page.locator(sidebarTelemetrySelectors[selector]);
}

async function openTelemetryWorkspace(page: Page) {
  await page.getByRole("button", { name: "Telemetry" }).click();
  await expect(page.locator(liveSurfaceSelectors.altitudeValue)).toBeVisible();
}

function liveMetric(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
  return page.locator(liveSurfaceSelectors[selector]).locator("dd, .telemetry-card__value");
}

function angularDeltaDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

async function importUploadAndReadAutoMission(page: Page, mockPlatform: MockPlatformFixture) {
  await openMissionWorkspace(page);
  await mockPlatform.setOpenFile(AUTO_MISSION_PLAN, "demo-auto.plan", "application/json");
  await missionWorkspaceLocator(page, "toolbarImport").click();
  await missionWorkspaceLocator(page, "importReview").waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await missionWorkspaceLocator(page, "importReview").isVisible().catch(() => false)) {
    await missionWorkspaceLocator(page, "importReviewConfirm").click();
  }
  await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
  await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("3");

  await missionWorkspaceLocator(page, "toolbarUpload").click();
  await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Uploading planning state");
  await expect(missionWorkspaceLocator(page, "inlineStatus")).toHaveCount(0, { timeout: 10_000 });

  await missionWorkspaceLocator(page, "toolbarRead").click();
  await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Reading planning state");
  await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
  await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("3");
}

async function currentMissionMarkerTestId(page: Page): Promise<string> {
  const currentMarker = page.locator(`${missionWorkspaceSelectors.missionMarker}.is-current`).first();
  await expect(currentMarker).toBeVisible({ timeout: 10_000 });
  const testId = await currentMarker.getAttribute("data-testid");
  if (!testId) {
    throw new Error("Current mission marker did not expose a data-testid");
  }
  return testId;
}

test("demo copter stays parked while disarmed, then takeoff changes altitude", async ({ page, mockPlatform }) => {
  await connectDemo(page, mockPlatform, "quadcopter");
  await openTelemetryWorkspace(page);

  const altitude = liveMetric(page, "altitudeValue");
  const altitudeBefore = await readMetricValue(altitude);
  await page.waitForTimeout(1500);
  expect(await readMetricValue(altitude)).toBeCloseTo(altitudeBefore, 1);

  await page.getByRole("button", { name: "Arm", exact: true }).click();
  await page.locator("#flight-mode-select").selectOption({ label: "Guided" });
  await page.getByRole("button", { name: "Takeoff" }).click();

  await expect.poll(async () => readMetricValue(altitude), { timeout: 8_000 }).toBeGreaterThan(altitudeBefore + 1);
});

test("demo AUTO mission upload/read progresses current item and lands", async ({ page, mockPlatform }) => {
  await connectDemo(page, mockPlatform, "quadcopter");
  await importUploadAndReadAutoMission(page, mockPlatform);
  const initialCurrent = await currentMissionMarkerTestId(page);

  await page.getByRole("button", { name: "Arm", exact: true }).click();
  await page.locator("#flight-mode-select").selectOption({ label: "Auto" });

  await expect(sidebarMetric(page, "mode")).toContainText(/auto/i, { timeout: 5_000 });
  await expect.poll(async () => currentMissionMarkerTestId(page), { timeout: 20_000 }).not.toBe(initialCurrent);
  await expect.poll(async () => readMetricValue(sidebarMetric(page, "altitude")), { timeout: 30_000 }).toBeLessThanOrEqual(0.6);
  await expect.poll(async () => sidebarMetric(page, "state").innerText(), { timeout: 15_000 }).toMatch(/disarmed/i);
});

test("demo airplane connects parked, then after arming + AUTO it gains forward speed and heading changes", async ({
  page,
  mockPlatform,
  }) => {
  await connectDemo(page, mockPlatform, "airplane");

  await expect(sidebarMetric(page, "state")).toContainText(/disarmed/i);
  await expect(sidebarMetric(page, "mode")).not.toContainText(/auto/i);
  expect(await readMetricValue(sidebarMetric(page, "speed"))).toBe(0);

  await openTelemetryWorkspace(page);
  const initialHeading = await readMetricValue(liveMetric(page, "headingValue"));
  await importUploadAndReadAutoMission(page, mockPlatform);
  await page.getByRole("button", { name: "Arm", exact: true }).click();
  await page.locator("#flight-mode-select").selectOption({ label: "Auto" });

  await expect(sidebarMetric(page, "mode")).toContainText(/auto/i, { timeout: 5_000 });
  await expect.poll(async () => readMetricValue(sidebarMetric(page, "speed")), { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  await openTelemetryWorkspace(page);
  await expect.poll(
    async () => angularDeltaDeg(await readMetricValue(liveMetric(page, "headingValue")), initialHeading),
    { timeout: 20_000 },
  ).toBeGreaterThan(2);
});

test("demo setup RTL section is backed by generated params", async ({ page, mockPlatform }) => {
  await connectDemo(page, mockPlatform, "quadcopter");
  await page.getByRole("button", { name: "Setup" }).click();

  await page.getByTestId("setup-workspace-nav-rtl_return").click();

  await expect(page.getByText("RTL_ALT is absent from the active parameter set.")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("setup-workspace-rtl-return-current-RTL_ALT")).toContainText(/Current · \d+(?:\.\d)? m/, {
    timeout: 15_000,
  });
});

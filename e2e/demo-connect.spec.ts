import {
  applyShellViewport,
  connectionSelectors,
  expect,
  expectDockedVehiclePanel,
  expectOperatorWorkspace,
  expectRuntimeDiagnostics,
  liveSurfaceValueLocator,
  test,
} from "./fixtures/mock-platform";

test.skip(process.env.VITE_IRONWING_MOCK_PROFILE !== "demo", "Requires VITE_IRONWING_MOCK_PROFILE=demo");

test("demo profile connects from the public SPA and surfaces seeded telemetry", async ({ page, mockPlatform }) => {
  await applyShellViewport(page, "desktop");
  await page.goto("/");
  await mockPlatform.waitForOperatorWorkspace();

  const transportSelect = page.locator(connectionSelectors.transportSelect);
  const demoPresetSelect = page.locator(connectionSelectors.demoPreset);
  const connectButton = page.locator(connectionSelectors.connectButton);
  const statusText = page.locator(connectionSelectors.statusText);
  const modeValue = liveSurfaceValueLocator(page, "modeValue");
  const gpsValue = liveSurfaceValueLocator(page, "gpsText");

  await expectRuntimeDiagnostics(page);
  await expectOperatorWorkspace(page);
  await expectDockedVehiclePanel(page, "desktop");
  await expect(transportSelect).toHaveValue("demo");
  await expect(demoPresetSelect).toHaveValue("quadcopter");
  await expect(gpsValue).toHaveText("--");

  await connectButton.click();

  await expect(statusText).toContainText("Connected", { timeout: 10_000 });
  await expect(modeValue).not.toContainText("--", { timeout: 10_000 });
  await expect(gpsValue).toHaveText("3D fix · 17 sats", { timeout: 10_000 });
});

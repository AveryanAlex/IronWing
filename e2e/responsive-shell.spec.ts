import {
  applyShellViewport,
  closeVehiclePanelDrawer,
  connectionSelectors,
  expect,
  expectDockedVehiclePanel,
  expectShellChrome,
  liveSurfaceLocator,
  openVehiclePanelDrawer,
  runtimeSelectors,
  type ShellViewportPresetName,
  test,
} from "./fixtures/mock-platform";

test.describe("responsive shell chrome", () => {
  test("desktop preset keeps the live vehicle panel docked in the main shell", async ({ page, mockPlatform }) => {
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.waitForRuntimeSurface();

    await expectShellChrome(page, "desktop");
    await expect(page.locator(runtimeSelectors.shell)).toHaveAttribute("data-shell-tier", "wide");
    await expectDockedVehiclePanel(page, "desktop");
    await expect(liveSurfaceLocator(page, "stateValue")).toBeVisible();
    await expect(liveSurfaceLocator(page, "altitudeValue")).toBeVisible();
  });

  test("Radiomaster width keeps the live vehicle panel docked in the main shell", async ({ page, mockPlatform }) => {
    await applyShellViewport(page, "radiomaster");
    await page.goto("/");
    await mockPlatform.waitForRuntimeSurface();

    await expectShellChrome(page, "radiomaster");
    await expectDockedVehiclePanel(page, "radiomaster");
    await expect(liveSurfaceLocator(page, "stateValue")).toBeVisible();
    await expect(liveSurfaceLocator(page, "altitudeValue")).toBeVisible();
  });

  test("phone width exposes the Vehicle panel drawer and keeps the connection surface reachable through it", async ({
    page,
    mockPlatform,
  }) => {
    await applyShellViewport(page, "phone");
    await page.goto("/");
    await mockPlatform.waitForRuntimeSurface();

    await expectShellChrome(page, "phone");
    await expect(page.locator(runtimeSelectors.vehiclePanelButton)).toBeVisible();
    await expect(liveSurfaceLocator(page, "stateValue")).toBeVisible();
    await expect(liveSurfaceLocator(page, "altitudeValue")).toBeVisible();
    await expect(page.locator(connectionSelectors.connectButton)).toHaveCount(0);

    await openVehiclePanelDrawer(page);
    await closeVehiclePanelDrawer(page);
  });

  test("unsupported viewport presets fail with an actionable message", async ({ page }) => {
    await expect(applyShellViewport(page, "tablet" as ShellViewportPresetName)).rejects.toThrow(
      "Unsupported shell viewport preset: tablet. Use one of: desktop, radiomaster, phone.",
    );
  });
});

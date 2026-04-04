import {
  applyShellViewport,
  connectionSelectors,
  expect,
  expectDockedVehiclePanel,
  expectRuntimeDiagnostics,
  expectShellChrome,
  runtimeSelectors,
  test,
} from "./fixtures/mock-platform";

test("active Svelte shell boots with runtime diagnostics in browser-only mode", async ({ page, mockPlatform }) => {
  await applyShellViewport(page, "desktop");
  await page.goto("/");
  await mockPlatform.waitForRuntimeSurface();

  await expect(page).toHaveTitle(/IronWing/);
  await expectRuntimeDiagnostics(page);
  await expectShellChrome(page, "desktop");
  await expectDockedVehiclePanel(page, "desktop");
  await expect(page.locator(connectionSelectors.connectButton)).toBeVisible();
  await expect(page.locator(runtimeSelectors.bootstrapFailure)).toHaveCount(0);
});

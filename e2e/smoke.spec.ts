import { test, expect, runtimeSelectors } from "./fixtures/mock-platform";

test("active Svelte shell boots with runtime diagnostics in browser-only mode", async ({ page, mockPlatform }) => {
  await page.goto("/");
  await mockPlatform.waitForRuntimeSurface();

  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator(runtimeSelectors.shell)).toHaveAttribute("data-runtime-phase", "ready");
  await expect(page.locator(runtimeSelectors.runtimeMarker)).toContainText("IronWing active runtime");
  await expect(page.locator(runtimeSelectors.heading)).toContainText("Svelte runtime online");
  await expect(page.locator(runtimeSelectors.framework)).toContainText("Svelte 5");
  await expect(page.locator(runtimeSelectors.bootstrapState)).toContainText("ready");
  await expect(page.locator(runtimeSelectors.bootedAt)).not.toContainText("Awaiting bootstrap completion");
  await expect(page.locator(runtimeSelectors.entrypoint)).toContainText("src/app/App.svelte");
  await expect(page.locator(runtimeSelectors.quarantineBoundary)).toContainText("src-old/runtime");
  await expect(page.locator(runtimeSelectors.bootstrapFailure)).toHaveCount(0);
});

import { test, expect } from "@playwright/test";

test("app loads in idle browser-only mode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Idle");
  await expect(page.locator('[data-testid="connection-connect-btn"]')).toBeVisible();
});

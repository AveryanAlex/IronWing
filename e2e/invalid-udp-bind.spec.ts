import { test, expect } from "@playwright/test";

test.describe("Negative path: invalid UDP bind address", () => {
  test("invalid UDP bind shows error and returns to idle controls", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator('[data-testid="connection-connect-btn"]');
    const cancelBtn = page.locator('[data-testid="connection-cancel-btn"]');
    const disconnectBtn = page.locator(
      '[data-testid="connection-disconnect-btn"]',
    );
    const statusText = page.locator('[data-testid="connection-status-text"]');
    const transportSelect = page.locator(
      '[data-testid="connection-transport-select"]',
    );
    const udpBind = page.locator('[data-testid="connection-udp-bind"]');
    const errorMessage = page.locator(
      '[data-testid="connection-error-message"]',
    );

    await page.waitForLoadState("networkidle");
    if (await disconnectBtn.isVisible()) {
      await disconnectBtn.click();
      await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    } else if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    }

    await expect(connectBtn).toBeVisible({ timeout: 15_000 });
    await expect(statusText).toContainText("Idle");

    await transportSelect.selectOption("udp");
    await udpBind.fill("not-a-socket");

    await connectBtn.click();

    await expect(statusText).toContainText("Error", { timeout: 10_000 });
    await expect(errorMessage).toContainText(/invalid socket address/i);
    await expect(connectBtn).toBeVisible();
    await expect(cancelBtn).not.toBeVisible();
    await expect(disconnectBtn).not.toBeVisible();
    await expect(udpBind).toBeEnabled();
    await expect(udpBind).toHaveValue("not-a-socket");
  });
});

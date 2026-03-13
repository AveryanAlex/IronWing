import { test, expect } from "@playwright/test";

test.describe("Negative path: wrong-port connect then cancel", () => {
  test("connecting to wrong port shows Connecting, cancel returns to idle", async ({
    page,
  }) => {
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
    await udpBind.fill("0.0.0.0:14551");

    await connectBtn.click();

    await expect(statusText).toContainText("Connecting", { timeout: 5_000 });
    await expect(cancelBtn).toBeVisible();
    await expect(udpBind).toBeDisabled();

    await cancelBtn.click();

    await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    await expect(connectBtn).toBeVisible();
    await expect(cancelBtn).not.toBeVisible();

    await expect(udpBind).toBeEnabled();
    await udpBind.fill("0.0.0.0:14550");
    await expect(udpBind).toHaveValue("0.0.0.0:14550");
  });
});

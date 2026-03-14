import { test, expect } from "./fixtures/mock-platform";

test.describe("Negative path: invalid UDP bind address", () => {
  test("invalid UDP bind shows error and returns to idle controls", async ({ page, mockPlatform }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("connect_link", {
      type: "reject",
      error: "invalid socket address",
    });

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

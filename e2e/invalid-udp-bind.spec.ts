import { connectionSelectors, expect, expectConnectionIdle, test } from "./fixtures/mock-platform";

test.describe("Negative path: invalid UDP bind address", () => {
  test("invalid UDP bind shows error and returns to idle controls", async ({ page, mockPlatform }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("connect_link", {
      type: "reject",
      error: "invalid socket address",
    });

    const connectBtn = page.locator(connectionSelectors.connectButton);
    const transportSelect = page.locator(connectionSelectors.transportSelect);
    const udpBind = page.locator('[data-testid="connection-udp-bind"]');
    const errorMessage = page.locator(connectionSelectors.errorMessage);

    await expectConnectionIdle(page, 15_000);

    await transportSelect.selectOption("udp");
    await udpBind.fill("not-a-socket");

    await connectBtn.click();

    await expect(errorMessage).toContainText(/invalid socket address/i);
    await expectConnectionIdle(page);
    await expect(udpBind).toBeEnabled();
    await expect(udpBind).toHaveValue("not-a-socket");
  });
});

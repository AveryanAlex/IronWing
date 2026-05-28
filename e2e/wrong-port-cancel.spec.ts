import { connectionSelectors, expect, expectConnectionConnecting, expectConnectionIdle, test } from "./fixtures/mock-platform";

test.describe("Negative path: wrong-port connect then cancel", () => {
  test("connecting to wrong port shows Connecting, cancel returns to idle", async ({
    page,
    mockPlatform,
  }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

    const connectBtn = page.locator(connectionSelectors.connectButton);
    const cancelBtn = page.locator(connectionSelectors.cancelButton);
    const transportSelect = page.locator(connectionSelectors.transportSelect);
    const udpBind = page.locator('[data-testid="connection-udp-bind"]');

    await expectConnectionIdle(page, 15_000);

    await transportSelect.selectOption("udp");
    await udpBind.fill("0.0.0.0:14551");

    await connectBtn.click();

    await expectConnectionConnecting(page, 5_000);
    await expect(cancelBtn).toBeVisible();
    await expect(udpBind).toBeDisabled();

    await cancelBtn.click();

    await expectConnectionIdle(page);
    await expect(connectBtn).toBeVisible();
    await expect(cancelBtn).not.toBeVisible();

    await expect(udpBind).toBeEnabled();

    const invocations = await mockPlatform.getInvocations();
    expect(
      invocations
        .map((entry) => entry.cmd)
        .filter((cmd) => cmd === "connect_link" || cmd === "disconnect_link"),
    ).toEqual(["connect_link", "disconnect_link"]);

    expect(await mockPlatform.rejectDeferred("connect_link", "cancelled")).toBe(true);
  });
});

import assert from "node:assert/strict";

describe("native smoke", () => {
  it("connects to SITL through the native Tauri app", async () => {
    const expectedTcpAddress = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(expectedTcpAddress, "IRONWING_WDIO_TCP_ADDRESS is required for the native smoke test.");

    const statusText = await $('[data-testid="connection-status-text"]');
    await statusText.waitForDisplayed({ timeout: 60_000 });

    await browser.waitUntil(async () => (await browser.getTitle()).includes("IronWing"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the IronWing window title.",
    });

    const transportSelect = await $('[data-testid="connection-transport-select"]');
    const tcpAddressInput = await $('[data-testid="connection-tcp-address"]');

    await browser.waitUntil(async () => (await transportSelect.getValue()) === "tcp", {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the TCP transport to be preselected.",
    });
    await browser.waitUntil(async () => (await tcpAddressInput.getValue()) === expectedTcpAddress, {
      timeout: 30_000,
      timeoutMsg: `Timed out waiting for the TCP address ${expectedTcpAddress}.`,
    });

    assert.match(await statusText.getText(), /Idle/i);

    const connectButton = await $('[data-testid="connection-connect-btn"]');
    await connectButton.waitForClickable({ timeout: 30_000 });
    await connectButton.click();

    await browser.waitUntil(async () => /Connected/i.test(await statusText.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native app to connect to SITL.",
    });

    const telemetryAltValue = await $('[data-testid="telemetry-alt-value"]');
    await browser.waitUntil(async () => !(await telemetryAltValue.getText()).includes("-- m"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for live telemetry after connect.",
    });

    const disconnectButton = await $('[data-testid="connection-disconnect-btn"]');
    await disconnectButton.waitForClickable({ timeout: 30_000 });
    await disconnectButton.click();

    await browser.waitUntil(async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native app to return to Idle after disconnect.",
    });
  });
});

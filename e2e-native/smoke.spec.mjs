import assert from "node:assert/strict";

async function waitForCheckpoint(label, predicate, { timeout = 60_000, timeoutMsg }) {
  await browser.waitUntil(predicate, {
    timeout,
    timeoutMsg,
  });
  console.log(`[native smoke] ${label}`);
}

describe("native smoke", () => {
  it("boots the active shell, connects to SITL, shows live telemetry, and disconnects cleanly", async () => {
    const expectedTcpAddress = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(expectedTcpAddress, "IRONWING_WDIO_TCP_ADDRESS is required for the native smoke test.");

    const statusText = await $('[data-testid="connection-status-text"]');
    const transportSelect = await $('[data-testid="connection-transport-select"]');
    const tcpAddressInput = await $('[data-testid="connection-tcp-address"]');
    const connectButton = await $('[data-testid="connection-connect-btn"]');
    const disconnectButton = await $('[data-testid="connection-disconnect-btn"]');
    const telemetryAltValue = await $('[data-testid="telemetry-alt-value"]');
    const telemetryModeValue = await $('[data-testid="telemetry-mode-value"]');

    await statusText.waitForDisplayed({ timeout: 60_000 });
    await browser.waitUntil(async () => (await browser.getTitle()).includes("IronWing"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native IronWing window title.",
    });

    await waitForCheckpoint("idle shell visible", async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to report Idle before connect.",
    });
    await waitForCheckpoint("tcp transport preselected", async () => (await transportSelect.getValue()) === "tcp", {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to preselect TCP from the SITL env contract.",
    });
    await waitForCheckpoint(
      `tcp address seeded as ${expectedTcpAddress}`,
      async () => (await tcpAddressInput.getValue()) === expectedTcpAddress,
      {
        timeout: 30_000,
        timeoutMsg: `Timed out waiting for the active shell to seed TCP address ${expectedTcpAddress}.`,
      },
    );

    await connectButton.waitForClickable({ timeout: 30_000 });
    await connectButton.click();

    await waitForCheckpoint("connected status reached", async () => /Connected/i.test(await statusText.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native app to connect to SITL.",
    });
    await waitForCheckpoint("live telemetry altitude rendered", async () => !(await telemetryAltValue.getText()).includes("-- m"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for live telemetry altitude after connect.",
    });
    await waitForCheckpoint("live telemetry mode rendered", async () => !(await telemetryModeValue.getText()).includes("--"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for live telemetry mode after connect.",
    });

    await disconnectButton.waitForClickable({ timeout: 30_000 });
    await disconnectButton.click();

    await waitForCheckpoint("idle status restored after disconnect", async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native app to return to Idle after disconnect.",
    });
    await waitForCheckpoint("connect control restored after disconnect", async () => await connectButton.isDisplayed(), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to restore the Connect action after disconnect.",
    });
  });
});

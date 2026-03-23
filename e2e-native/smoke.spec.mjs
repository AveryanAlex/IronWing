import assert from "node:assert/strict";

function parseAltitudeMeters(text) {
  const value = Number.parseFloat(text);
  assert.ok(Number.isFinite(value), `Expected a numeric altitude value, got: ${text}`);
  return value;
}

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

    const takeoffButton = await $('[data-testid="controls-takeoff-btn"]');
    const flightModeSelect = await $('[data-testid="controls-flight-mode-select"]');
    const armButton = await $('[data-testid="controls-arm-btn"]');
    const takeoffHint = await $('[data-testid="controls-takeoff-hint"]');
    const modeValue = await $('[data-testid="telemetry-mode-value"]');
    const stateValue = await $('[data-testid="telemetry-state-value"]');

    await browser.waitUntil(async () => !(await takeoffButton.isEnabled()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for takeoff to stay disabled before the app reaches a GUIDED-capable state.",
    });

    await flightModeSelect.waitForEnabled({ timeout: 30_000 });
    await flightModeSelect.selectByVisibleText("GUIDED");

    await browser.waitUntil(async () => /GUIDED/i.test(await modeValue.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the vehicle mode to reach GUIDED in the native app.",
    });
    await browser.waitUntil(async () => !(await takeoffButton.isEnabled()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for takeoff to remain disabled after mode changed to GUIDED but before arming.",
    });
    await browser.waitUntil(async () => /Arm vehicle/i.test(await takeoffHint.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the pre-arm takeoff hint after GUIDED mode was selected.",
    });

    await armButton.waitForEnabled({ timeout: 60_000 });
    await armButton.click();

    await browser.waitUntil(async () => /ARMED/i.test(await stateValue.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the vehicle to arm in the native app.",
    });
    await browser.waitUntil(async () => await takeoffButton.isEnabled(), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for takeoff to enable after the app reached a GUIDED-capable state.",
    });
    await browser.waitUntil(async () => !(await takeoffHint.isExisting()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the takeoff hint to disappear after the app reached a GUIDED-capable state.",
    });

    const initialAltitudeM = parseAltitudeMeters(await telemetryAltValue.getText());
    await takeoffButton.click();

    await browser.waitUntil(async () => {
      const currentAltitudeM = parseAltitudeMeters(await telemetryAltValue.getText());
      return currentAltitudeM > initialAltitudeM + 1;
    }, {
      timeout: 90_000,
      timeoutMsg: `Timed out waiting for altitude to increase after takeoff from ${initialAltitudeM.toFixed(1)} m.`,
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

import { test, expect } from "@playwright/test";
import { resolveE2ERuntime } from "../src/lib/e2e-runtime";

const e2eRuntime = resolveE2ERuntime(process.env as Record<string, string | undefined>);

test.describe("SITL connect happy path", () => {
  test("connects to SITL over TCP and receives live telemetry", async ({ page }) => {
    await page.goto("/");

    const connectBtn = page.locator('[data-testid="connection-connect-btn"]');
    const disconnectBtn = page.locator('[data-testid="connection-disconnect-btn"]');
    const cancelBtn = page.locator('[data-testid="connection-cancel-btn"]');
    const statusText = page.locator('[data-testid="connection-status-text"]');

    // Ensure idle state — disconnect if a prior session left the app connected
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

    const transportSelect = page.locator('[data-testid="connection-transport-select"]');
    await transportSelect.selectOption("tcp");

    const tcpAddress = page.locator('[data-testid="connection-tcp-address"]');
    await tcpAddress.fill(e2eRuntime.tcpAddress);

    await connectBtn.click();

    // SITL heartbeat can take up to ~30s after a cold start
    await expect(statusText).toContainText("Connected", { timeout: 30_000 });
    await expect(disconnectBtn).toBeVisible();

    const telemetryState = page.locator('[data-testid="telemetry-state-value"]');
    const telemetryMode = page.locator('[data-testid="telemetry-mode-value"]');
    const telemetryAlt = page.locator('[data-testid="telemetry-alt-value"]');
    const telemetryBattery = page.locator('[data-testid="telemetry-battery-value"]');
    const telemetryHeading = page.locator('[data-testid="telemetry-heading-value"]');
    const telemetryGps = page.locator('[data-testid="telemetry-gps-text"]');

    // Numeric telemetry can lag ~15s behind state/mode after cold connect
    await expect(telemetryState).not.toContainText("--", { timeout: 20_000 });
    await expect(telemetryMode).not.toContainText("--", { timeout: 15_000 });
    await expect(telemetryAlt).not.toContainText("-- m", { timeout: 20_000 });
    await expect(telemetryBattery).not.toContainText("--%", { timeout: 20_000 });
    await expect(telemetryHeading).not.toContainText("--°", { timeout: 20_000 });
    await expect(telemetryGps).not.toContainText("GPS: --", { timeout: 20_000 });

    await expect(telemetryState).toHaveText(/ARMED|DISARMED/);

    const modeText = await telemetryMode.textContent();
    expect(modeText).toBeTruthy();
    expect(modeText).not.toBe("--");

    await disconnectBtn.click();
    await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    await expect(connectBtn).toBeVisible();
  });
});

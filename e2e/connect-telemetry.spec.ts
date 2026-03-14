import { test, expect } from "./fixtures/mock-platform";

const connectedVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "LOITER",
  system_status: "STANDBY",
  vehicle_type: "copter",
  autopilot: "ardupilot",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
};

const telemetry = {
  altitude_m: 12.4,
  speed_mps: 4.8,
  heading_deg: 182.1,
  latitude_deg: 42.3898,
  longitude_deg: -71.1476,
  battery_pct: 87.2,
  gps_fix_type: "3D Fix",
};

test.describe("Happy path: mocked connect and telemetry", () => {
  test("connects over TCP, shows telemetry, and disconnects", async ({ page, mockPlatform }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("connect_link", {
      type: "resolve",
      emit: [
        { event: "link://state", payload: "connected" },
        { event: "vehicle://state", payload: connectedVehicleState },
        { event: "telemetry://tick", payload: telemetry },
        {
          event: "home://position",
          payload: {
            latitude_deg: 42.3898,
            longitude_deg: -71.1476,
            altitude_m: 14,
          },
        },
      ],
    });
    await mockPlatform.setCommandBehavior("disconnect_link", {
      type: "resolve",
      emit: [{ event: "link://state", payload: "disconnected" }],
    });

    const connectBtn = page.locator('[data-testid="connection-connect-btn"]');
    const disconnectBtn = page.locator('[data-testid="connection-disconnect-btn"]');
    const statusText = page.locator('[data-testid="connection-status-text"]');

    await expect(connectBtn).toBeVisible({ timeout: 15_000 });
    await expect(statusText).toContainText("Idle");

    const transportSelect = page.locator('[data-testid="connection-transport-select"]');
    await transportSelect.selectOption("tcp");

    const tcpAddress = page.locator('[data-testid="connection-tcp-address"]');
    await tcpAddress.fill("127.0.0.1:5760");

    await connectBtn.click();

    await expect(statusText).toContainText("Connected", { timeout: 10_000 });
    await expect(disconnectBtn).toBeVisible();

    await expect(page.locator('[data-testid="telemetry-state-value"]')).toContainText("DISARMED");
    await expect(page.locator('[data-testid="telemetry-mode-value"]')).toContainText("LOITER");
    await expect(page.locator('[data-testid="telemetry-alt-value"]')).not.toContainText("-- m");
    await expect(page.locator('[data-testid="telemetry-speed-value"]')).not.toContainText("-- m/s");
    await expect(page.locator('[data-testid="telemetry-battery-value"]')).not.toContainText("--%");
    await expect(page.locator('[data-testid="telemetry-heading-value"]')).not.toContainText("--°");
    await expect(page.locator('[data-testid="telemetry-gps-text"]')).not.toContainText("GPS: --");

    await disconnectBtn.click();

    await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    await expect(connectBtn).toBeVisible();
  });
});

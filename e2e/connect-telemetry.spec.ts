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
  available: true,
  complete: true,
  provenance: "stream",
  value: {
    flight: {
      altitude_m: 12.4,
      speed_mps: 4.8,
    },
    navigation: {
      heading_deg: 182.1,
      latitude_deg: 42.3898,
      longitude_deg: -71.1476,
    },
    power: {
      battery_pct: 87.2,
    },
    gps: {
      fix_type: "fix_3d",
    },
    radio: {
      rc_channels: [1500, 1500, 1100, 1500],
      rc_rssi: 92,
    },
  },
};

const support = {
  available: true,
  complete: true,
  provenance: "stream",
  value: {
    can_arm: true,
    reasons: [],
    readiness: "ready",
  },
};

const statusTextDomain = {
  available: true,
  complete: true,
  provenance: "stream",
  value: {
    entries: [
      { text: "Ready", severity: "notice", timestamp_usec: 1000 },
    ],
  },
};

test.describe("Happy path: mocked connect and telemetry", () => {
  test("connects over TCP, shows telemetry, and disconnects", async ({ page, mockPlatform }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
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

    await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

    await mockPlatform.resolveDeferredConnectLink({
      vehicleState: connectedVehicleState,
      guidedState: {
        status: "blocked",
        session: null,
        entered_at_unix_msec: null,
        blocking_reason: "vehicle_disarmed",
        termination: null,
        last_command: null,
        actions: {
          start: { allowed: false, blocking_reason: "vehicle_disarmed" },
          update: { allowed: false, blocking_reason: "vehicle_disarmed" },
          stop: { allowed: false, blocking_reason: "live_session_required" },
        },
      },
    });

    const liveEnvelope = await mockPlatform.getLiveEnvelope();
    expect(liveEnvelope).not.toBeNull();

    await mockPlatform.emit("telemetry://state", {
      envelope: liveEnvelope,
      value: telemetry,
    });
    await mockPlatform.emit("support://state", {
      envelope: liveEnvelope,
      value: support,
    });
    await mockPlatform.emit("status_text://state", {
      envelope: liveEnvelope,
      value: statusTextDomain,
    });
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

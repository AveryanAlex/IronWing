import {
  connectionSelectors,
  expect,
  runtimeSelectors,
  test,
} from "./fixtures/mock-platform";

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
      satellites: 14,
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
  test("drives the Svelte shell through idle, connecting, connected, and back to idle with visible diagnostics", async ({
    page,
    mockPlatform,
  }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

    const shell = page.locator(runtimeSelectors.shell);
    const heading = page.locator(runtimeSelectors.heading);
    const statusText = page.locator(connectionSelectors.statusText);
    const connectBtn = page.locator(connectionSelectors.connectButton);
    const cancelBtn = page.locator(connectionSelectors.cancelButton);
    const disconnectBtn = page.locator(connectionSelectors.disconnectButton);
    const transportSelect = page.locator(connectionSelectors.transportSelect);
    const tcpAddress = page.locator(connectionSelectors.tcpAddress);
    const bootstrapDiagnostics = page.locator(connectionSelectors.diagnosticsBootstrap);
    const lastPhaseDiagnostics = page.locator(connectionSelectors.diagnosticsLastPhase);
    const activeSourceDiagnostics = page.locator(connectionSelectors.diagnosticsActiveSource);
    const envelopeDiagnostics = page.locator(connectionSelectors.diagnosticsEnvelope);
    const errorMessage = page.locator(connectionSelectors.errorMessage);

    await expect(shell).toBeVisible();
    await expect(heading).toContainText("Svelte runtime online");
    await expect(connectBtn).toBeVisible({ timeout: 15_000 });
    await expect(statusText).toContainText("Idle");
    await expect(bootstrapDiagnostics).toContainText("ready");
    await expect(lastPhaseDiagnostics).toContainText("ready");
    await expect(activeSourceDiagnostics).toContainText("live");
    await expect(envelopeDiagnostics).toContainText(/session-/);
    await expect(errorMessage).toHaveCount(0);

    await transportSelect.selectOption("tcp");
    await tcpAddress.fill("127.0.0.1:5760");
    await connectBtn.click();

    await expect(statusText).toContainText("Connecting", { timeout: 10_000 });
    await expect(cancelBtn).toBeVisible();
    await expect(tcpAddress).toBeDisabled();
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
    await expect(cancelBtn).toHaveCount(0);
    await expect(lastPhaseDiagnostics).toContainText("ready");
    await expect(activeSourceDiagnostics).toContainText("live");
    await expect(envelopeDiagnostics).toContainText(liveEnvelope?.session_id ?? "session-");
    await expect(errorMessage).toHaveCount(0);

    await expect(page.locator('[data-testid="telemetry-state-value"]')).toContainText("DISARMED");
    await expect(page.locator('[data-testid="telemetry-mode-value"]')).toContainText("LOITER");
    await expect(page.locator('[data-testid="telemetry-alt-value"]')).toContainText("12.4 m");
    await expect(page.locator('[data-testid="telemetry-speed-value"]')).toContainText("4.8 m/s");
    await expect(page.locator('[data-testid="telemetry-battery-value"]')).toContainText("87.2%");
    await expect(page.locator('[data-testid="telemetry-heading-value"]')).toContainText("182°");
    await expect(page.locator('[data-testid="telemetry-gps-text"]')).toContainText("GPS: fix_3d · 14 sats");

    await disconnectBtn.click();

    await expect(statusText).toContainText("Idle", { timeout: 10_000 });
    await expect(connectBtn).toBeVisible();
    await expect(tcpAddress).toBeEnabled();
    await expect(lastPhaseDiagnostics).toContainText("ready");
    await expect(activeSourceDiagnostics).toContainText("live");
    await expect(envelopeDiagnostics).toContainText(/session-/);
    await expect(errorMessage).toHaveCount(0);
  });
});

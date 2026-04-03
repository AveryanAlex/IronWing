import { test, expect } from "./fixtures/mock-platform";

test("takeoff affordance follows guided domain instead of mode text", async ({ page, mockPlatform }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Idle");
  await mockPlatform.reset();

  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
  await mockPlatform.setCommandBehavior("disconnect_link", { type: "resolve" });

  await page.locator('[data-testid="connection-transport-select"]').selectOption("tcp");
  await page.locator('[data-testid="connection-tcp-address"]').fill("127.0.0.1:5760");
  await page.locator('[data-testid="connection-connect-btn"]').click();

  await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState: {
      armed: false,
      custom_mode: 4,
      mode_name: "GUIDED",
      system_status: "ACTIVE",
      vehicle_type: "copter",
      autopilot: "ardupilot",
      system_id: 1,
      component_id: 1,
      heartbeat_received: true,
    },
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

  await expect(page.locator('[data-testid="telemetry-mode-value"]')).toContainText("GUIDED");
  await expect(page.locator('[data-testid="controls-takeoff-btn"]')).toBeDisabled();
  await expect(page.locator('[data-testid="controls-takeoff-hint"]')).toContainText("Arm vehicle");
  await expect.poll(() => mockPlatform.getInvocations()).not.toContainEqual(
    expect.objectContaining({ cmd: "vehicle_takeoff" }),
  );

  await page.reload();
  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Idle");
  await mockPlatform.reset();
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
  await page.locator('[data-testid="connection-transport-select"]').selectOption("tcp");
  await page.locator('[data-testid="connection-tcp-address"]').fill("127.0.0.1:5760");
  await page.locator('[data-testid="connection-connect-btn"]').click();

  await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState: {
      armed: true,
      custom_mode: 4,
      mode_name: "GUIDED",
      system_status: "ACTIVE",
      vehicle_type: "copter",
      autopilot: "ardupilot",
      system_id: 1,
      component_id: 1,
      heartbeat_received: true,
    },
    guidedState: {
      status: "idle",
      session: null,
      entered_at_unix_msec: null,
      blocking_reason: null,
      termination: null,
      last_command: null,
      actions: {
        start: { allowed: true, blocking_reason: null },
        update: { allowed: false, blocking_reason: "live_session_required" },
        stop: { allowed: false, blocking_reason: "live_session_required" },
      },
    },
  });

  await expect(page.locator('[data-testid="telemetry-mode-value"]')).toContainText("GUIDED");
  await expect(page.locator('[data-testid="controls-takeoff-btn"]')).toBeEnabled();
  await expect(page.locator('[data-testid="controls-takeoff-hint"]')).toHaveCount(0);

  await page.locator('[data-testid="controls-takeoff-btn"]').click();
  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({ cmd: "vehicle_takeoff", args: { altitudeM: 10 } }),
  );
});

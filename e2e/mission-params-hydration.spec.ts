import { test, expect } from "./fixtures/mock-platform";

test("mission and params hydrate without legacy vehicle snapshot fallback", async ({ page, mockPlatform }) => {
  await page.goto("/");
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
      armed: false,
      custom_mode: 5,
      mode_name: "LOITER",
      system_status: "STANDBY",
      vehicle_type: "copter",
      autopilot: "ardupilot",
      system_id: 1,
      component_id: 1,
      heartbeat_received: true,
    },
    missionState: {
      plan: null,
      current_index: 2,
      sync: "current",
      active_op: null,
    },
    paramStore: {
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      },
    },
    paramProgress: "completed",
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

  await mockPlatform.emitMissionState({ plan: null, current_index: 2, sync: "current", active_op: null });
  await mockPlatform.emitParamStore({
    expected_count: 2,
    params: {
      ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
    },
  });
  await mockPlatform.emitParamProgress("completed");

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
  await expect.poll(() => mockPlatform.getInvocations()).not.toContainEqual(
    expect.objectContaining({ cmd: "get_vehicle_snapshot" }),
  );

  await page.getByRole("button", { name: "Mission" }).click();
  await expect(page.locator("[data-mission-vehicle-card]")).toContainText("Vehicle Items");
  await expect(page.locator("[data-mission-vehicle-card]")).toContainText("—");
  await expect(page.locator("[data-mission-vehicle-card]")).not.toContainText("5");
  await expect(page.locator("[data-mission-vehicle-card]")).toContainText("#3");

  await page.getByRole("button", { name: "Setup" }).click();
  await expect(page.getByText("Parameters downloaded — 2 parameters")).toBeVisible();
});

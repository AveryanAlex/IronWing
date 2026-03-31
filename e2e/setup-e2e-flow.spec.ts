import { test, expect } from "./fixtures/mock-platform";
import type { Page } from "@playwright/test";
import {
  connectAndOpenSetup,
  emitSensorHealth,
  emitStatusText,
  emitSupportState,
  navigateSection,
  openFirmware,
  openSetup,
  seedCopterMetadata,
  standardVehicleState,
} from "./helpers/setup-flow";
import type { MockPlatformController } from "./helpers/setup-flow";
import type { SensorHealth } from "../src/sensor-health";
import type { SupportState } from "../src/support";

function streamTelemetry(radio: { rc_channels?: number[]; rc_rssi?: number; servo_outputs?: number[] }) {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: { radio },
  };
}

const HEALTHY_SENSOR_HEALTH: SensorHealth = {
  gyro: "healthy",
  accel: "healthy",
  mag: "healthy",
  baro: "healthy",
  gps: "healthy",
  airspeed: "not_present",
  rc_receiver: "healthy",
  battery: "healthy",
  terrain: "not_present",
  geofence: "disabled",
};

const SETUP_SUPPORT: SupportState = {
  can_request_prearm_checks: true,
  can_calibrate_accel: true,
  can_calibrate_compass: true,
  can_calibrate_radio: true,
};

type FlowMockPlatform = MockPlatformController & {
  emitLiveSessionState: (vehicleState: ReturnType<typeof standardVehicleState>) => Promise<void>;
  getInvocations: () => Promise<Array<{ cmd: string; args: Record<string, unknown> | undefined }>>;
};

async function runCompleteSetupFlow(
  page: Page,
  mockPlatform: FlowMockPlatform,
) {
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await seedCopterMetadata(page);
  await connectAndOpenSetup(page, mockPlatform);

  await openFirmware(page);
  await expect(page.locator('[data-testid="firmware-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="firmware-serial-panel"]')).toBeVisible();
  await expect(page.locator('[data-testid="firmware-catalog-target-chooser"]')).toBeVisible();
  await page.locator('[data-testid="firmware-mode-recover"]').click();
  await expect(page.locator('[data-testid="firmware-dfu-recovery-panel"]')).toBeVisible();

  await openSetup(page);
  await expect(page.getByText("Quick Actions")).toBeVisible();

  await navigateSection(page, "Frame & Orientation");
  await expect(page.locator('[data-setup-param="FRAME_CLASS"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="AHRS_ORIENTATION"]')).toBeVisible();

  await navigateSection(page, "Calibration");
  await page.getByRole("button", { name: /Gyroscope/i }).click();
  await expect(page.getByRole("button", { name: "Calibrate", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "calibrate_gyro",
      args: undefined,
    }),
  );
  await emitStatusText(mockPlatform, "Gyroscope calibration started", "notice");
  await expect(page.getByText("Gyroscope calibration started")).toBeVisible();

  await navigateSection(page, "RC / Receiver");
  await expect(page.getByText("Waiting for live RC channel data.")).toBeVisible();

  const liveEnvelope = await mockPlatform.getLiveEnvelope();
  expect(liveEnvelope).not.toBeNull();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900, 1300],
      rc_rssi: 84,
    }),
  });

  await expect(page.getByText("4 live")).toBeVisible();
  await expect(page.getByText("RSSI 84%")).toBeVisible();
  await expect(page.getByLabel("Roll mapped to channel 1")).toBeVisible();
  await expect(page.getByLabel("Pitch mapped to channel 2")).toBeVisible();
  await expect(page.getByLabel("Throttle mapped to channel 3")).toBeVisible();
  await expect(page.getByLabel("Yaw mapped to channel 4")).toBeVisible();

  await navigateSection(page, "Servo Outputs");
  await expect(page.getByText("Waiting for live servo output telemetry before readback can confirm the command.")).toBeVisible();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900, 1300],
      rc_rssi: 84,
      servo_outputs: [1550, 1450, 1700],
    }),
  });

  await expect(page.getByText("1550 µs", { exact: true })).toBeVisible();
  await expect(page.getByText("Readback comes from telemetry.servo_outputs[0] when the vehicle publishes it.")).toBeVisible();

  const pwmInput = page.getByLabel("Raw PWM input for SERVO1");
  await pwmInput.fill("2500");
  await expect(pwmInput).toHaveValue("2000");
  await page.getByRole("button", { name: "Send PWM" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "set_servo",
      args: { instance: 1, pwmUs: 2000 },
    }),
  );
  await expect(page.getByText("Last command 2000 µs. Live readback is 1550 µs.")).toBeVisible();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900, 1300],
      rc_rssi: 84,
      servo_outputs: [2000, 1450, 1700],
    }),
  });

  await expect(page.getByText("Last command 2000 µs. Live readback is 2000 µs.")).toBeVisible();

  await navigateSection(page, "Motors & ESC");
  await expect(page.getByRole("heading", { name: "Motor Test" })).toBeVisible();
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Props Removed" }).click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Test motor 1" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "motor_test",
      args: { motorInstance: 1, throttlePct: 3, durationS: 2 },
    }),
  );
  await expect(page.getByText("Observed direction")).toBeVisible();
  await page.getByRole("button", { name: "Correct" }).click();
  await expect(page.getByText("1/4 verified")).toBeVisible();

  await navigateSection(page, "Arming");
  await emitSupportState(mockPlatform, SETUP_SUPPORT);
  await emitSensorHealth(mockPlatform, HEALTHY_SENSOR_HEALTH);
  await expect(page.getByRole("heading", { name: "Ready to Arm", exact: true })).toBeVisible();
  const sectionArmButton = page.getByRole("main").getByRole("button", { name: "Arm", exact: true });
  await expect(sectionArmButton).toBeEnabled();
  await sectionArmButton.click();
  await expect(page.getByRole("button", { name: "Confirm Arm" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm Arm" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "arm_vehicle",
      args: { force: false },
    }),
  );

  await mockPlatform.emitLiveSessionState({
    ...standardVehicleState(),
    armed: true,
  });
  await expect(page.getByRole("main").getByRole("button", { name: "Disarm", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: "ARMED", exact: true })).toBeVisible();

  expect(metadataRequests).toEqual([]);
}

test("complete setup flow at desktop viewport", async ({ page, mockPlatform }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await runCompleteSetupFlow(page, mockPlatform);
});

test("setup flow usable at Radiomaster 1280x720", async ({ page, mockPlatform }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await runCompleteSetupFlow(page, mockPlatform);
});

test("setup flow usable at phone width", async ({ page, mockPlatform }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await runCompleteSetupFlow(page, mockPlatform);
});

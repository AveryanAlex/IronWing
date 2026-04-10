import type { SensorHealthState } from "../src/sensor-health";
import { setupWorkspaceTestIds } from "../src/components/setup/setup-workspace-test-ids";
import {
  applyShellViewport,
  connectionSelectors,
  expect,
  setupWorkspaceSelectors,
  test,
} from "./fixtures/mock-platform";
import {
  openSetupWizard,
  wizardBannerLocator,
  wizardStepBodyLocator,
} from "./helpers/setup-wizard";
import {
  connectSetupSession,
  createFullExpertSetupParamStore,
  createSetupCalibrationDomain,
  createSetupConfigurationFactsDomain,
  createSetupStatusTextDomain,
  createSetupSupportDomain,
  createSetupTelemetryDomain,
  openConnectedSetupWorkspace,
  primeSetupMetadata,
  setupConnectedVehicleState,
  simulateSetupReconnectSameScope,
} from "./helpers/setup-workspace";

// All sensors healthy so the setup store derives arming.status === "complete".
const healthySensorHealth: SensorHealthState = {
  gyro: "healthy",
  accel: "healthy",
  mag: "healthy",
  baro: "healthy",
  gps: "healthy",
  airspeed: "not_present",
  rc_receiver: "healthy",
  battery: "healthy",
  terrain: "not_present",
  geofence: "not_present",
};

type HealthySensorHealthEmitter = {
  emit: (event: string, payload: unknown) => Promise<void>;
  getLiveEnvelope: () => Promise<
    | {
        session_id: string;
        source_kind: "live" | "playback";
        seek_epoch: number;
        reset_revision: number;
      }
    | null
  >;
};

async function emitHealthySensorHealth(
  mockPlatform: HealthySensorHealthEmitter,
): Promise<void> {
  const envelope = await mockPlatform.getLiveEnvelope();
  if (!envelope) {
    throw new Error("Cannot emit sensor_health before the live envelope exists.");
  }
  await mockPlatform.emit("sensor_health://state", {
    envelope,
    value: {
      available: true,
      complete: true,
      provenance: "stream",
      value: healthySensorHealth,
    },
  });
}

test.describe("setup wizard proof", () => {
  test("runs the required path and handoff through the mocked browser", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      paramStore: createFullExpertSetupParamStore(),
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
      }),
      support: createSetupSupportDomain({
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: true,
      }),
      configurationFacts: createSetupConfigurationFactsDomain({
        frame: { configured: true },
        gps: { configured: true },
        battery_monitor: { configured: true },
        motors_esc: { configured: true },
      }),
      calibration: createSetupCalibrationDomain({
        accel: { lifecycle: "complete", progress: null, report: null },
        compass: { lifecycle: "complete", progress: null, report: null },
        radio: { lifecycle: "complete", progress: null, report: null },
      }),
      statusText: createSetupStatusTextDomain([]),
    });

    // Sensor health is only bootstrapped as a null domain after connect, so
    // arming would stay "unknown" without this live emit. Wiring it through
    // the envelope-aware raw emit keeps the arming gate truthful.
    await emitHealthySensorHealth(mockPlatform);

    await openConnectedSetupWorkspace(page);
    await openSetupWizard(page);

    // Frame: seeded fixture already matches, so apply falls through to advance.
    await page.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply).click();
    await expect(wizardStepBodyLocator(page, "calibration")).toBeVisible();

    // Calibration: all three lifecycles were seeded "complete" so Continue is
    // enabled on mount.
    await page.getByTestId(setupWorkspaceTestIds.wizardStepCalibContinue).click();
    await expect(wizardStepBodyLocator(page, "rc_receiver")).toBeVisible();

    // RC: live signal was seeded, so continue should be enabled.
    await page.getByTestId(setupWorkspaceTestIds.wizardStepRcContinue).click();
    await expect(wizardStepBodyLocator(page, "arming")).toBeVisible();

    // Arming: healthy sensor_health produces sectionStatuses.arming === "complete".
    await page
      .getByTestId(setupWorkspaceTestIds.wizardStepArmingContinue)
      .click();
    await expect(wizardStepBodyLocator(page, "gps")).toBeVisible();

    // Skip every recommended step through the shell's Skip button.
    const recommendedSteps = [
      "gps",
      "battery_monitor",
      "failsafe",
      "flight_modes",
      "initial_params",
    ] as const;
    for (let index = 0; index < recommendedSteps.length - 1; index += 1) {
      const current = recommendedSteps[index];
      const next = recommendedSteps[index + 1];
      await expect(wizardStepBodyLocator(page, current)).toBeVisible();
      await page.getByTestId(setupWorkspaceTestIds.wizardStepSkip).click();
      await expect(wizardStepBodyLocator(page, next)).toBeVisible();
    }
    // Final skip transitions the wizard into the handoff summary.
    await page.getByTestId(setupWorkspaceTestIds.wizardStepSkip).click();
    await expect(page.getByTestId(setupWorkspaceTestIds.wizardHandoff)).toBeVisible();

    // Handoff: four required steps configured, five recommended steps skipped.
    for (const stepId of ["frame_orientation", "calibration", "rc_receiver", "arming"]) {
      await expect(
        page.getByTestId(`${setupWorkspaceTestIds.wizardHandoffRowPrefix}-${stepId}`),
      ).toBeVisible();
    }
    for (const stepId of recommendedSteps) {
      await expect(
        page.getByTestId(`${setupWorkspaceTestIds.wizardHandoffRowPrefix}-${stepId}`),
      ).toBeVisible();
    }

    await page.getByTestId(setupWorkspaceTestIds.wizardHandoffAcknowledge).click();
    await expect(page.getByTestId(setupWorkspaceTestIds.wizardRoot)).toHaveCount(0);
    await expect(page.locator(setupWorkspaceSelectors.overviewSection)).toBeVisible();
  });

  test("routes a frame-step reboot through the wizard's paused-checkpoint banner", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      paramStore: createFullExpertSetupParamStore(),
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([]),
    });

    await openConnectedSetupWorkspace(page);
    await openSetupWizard(page);

    // Change FRAME_CLASS to Hexa (code 2). FRAME_CLASS is flagged
    // rebootRequired in our metadata fixture, so Apply stages a reboot edit.
    await page
      .locator(
        `[data-testid="${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class"]`,
      )
      .selectOption("2");
    await page.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply).click();

    // The workspace store materializes the reboot checkpoint, which drives the
    // wizard store into the paused_checkpoint phase.
    await expect(wizardBannerLocator(page, "checkpoint")).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.checkpoint)).toBeVisible();

    // Same-scope reconnect bumps reset_revision; the checkpoint clears and the
    // wizard shell returns to the frame step body.
    await simulateSetupReconnectSameScope(mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      paramStore: createFullExpertSetupParamStore({ FRAME_CLASS: 2 }),
      paramProgress: "completed",
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([]),
    });

    await expect(wizardBannerLocator(page, "checkpoint")).toHaveCount(0);
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toBeVisible();
  });

  test("pauses into the scope-change banner and restarts for a new vehicle", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      paramStore: createFullExpertSetupParamStore(),
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([]),
    });

    await openConnectedSetupWorkspace(page);
    await openSetupWizard(page);
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toBeVisible();

    // Cycle the link through disconnect + reconnect so the mock backend mints
    // a new session_id. The session store's shouldDropEvent gate rejects
    // cross-session scoped emits, so the only truthful e2e path into the
    // wizard's scope_change banner is a genuine reconnect flow.
    await page.locator(connectionSelectors.disconnectButton).click();
    await expect(page.locator(connectionSelectors.connectButton)).toBeVisible();

    await expect(wizardBannerLocator(page, "scope")).toBeVisible();
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toHaveCount(0);

    await page.getByTestId(setupWorkspaceTestIds.wizardRestart).click();

    // Restart clears the wizard store back to idle. The beginner wizard
    // section stays selected, so the workspace shell's auto-start effect
    // immediately kicks the wizard back into the active phase for the new
    // vehicle scope and lands the operator on the frame step body without
    // re-surfacing the idle start button.
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toBeVisible();
  });

  test("detour round-trip pauses, navigates away, and resumes from overview", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      paramStore: createFullExpertSetupParamStore(),
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
      }),
      support: createSetupSupportDomain(),
      // Leave the frame section unconfigured so resume() keeps the current
      // step on frame_orientation instead of auto-advancing via the detour
      // completion path.
      configurationFacts: createSetupConfigurationFactsDomain({
        frame: { configured: false },
      }),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([]),
    });

    await openConnectedSetupWorkspace(page);
    await openSetupWizard(page);
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toBeVisible();

    // Detour hides the wizard AND navigates the workspace to the expert
    // section. The wizard store transitions to paused_detour in the process.
    await page.getByTestId(setupWorkspaceTestIds.wizardStepDetour).click();
    await expect(page.getByTestId(setupWorkspaceTestIds.wizardRoot)).toHaveCount(0);
    await expect(page.locator(setupWorkspaceSelectors.frameSection)).toBeVisible();

    // Navigate back to overview so we can reach the wizard launch button, then
    // re-open the wizard. Launch is a no-op on wizardStore.start() because the
    // phase is already paused_detour, so the banner should appear on mount.
    await page
      .locator(`[data-testid="${setupWorkspaceTestIds.navPrefix}-overview"]`)
      .click();
    await expect(page.locator(setupWorkspaceSelectors.overviewSection)).toBeVisible();

    await page.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch).click();
    await expect(page.getByTestId(setupWorkspaceTestIds.wizardRoot)).toBeVisible();
    await expect(wizardBannerLocator(page, "detour")).toBeVisible();

    await page.getByTestId(setupWorkspaceTestIds.wizardResume).click();
    await expect(wizardStepBodyLocator(page, "frame_orientation")).toBeVisible();
    await expect(wizardBannerLocator(page, "detour")).toHaveCount(0);
  });
});

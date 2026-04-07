import {
  applyShellViewport,
  expect,
  parameterWorkspaceSelectors,
  test,
} from "./fixtures/mock-platform";
import {
  connectSetupSession,
  createSetupCalibrationDomain,
  createSetupConfigurationFactsDomain,
  createSetupStatusTextDomain,
  createSetupSupportDomain,
  createSetupTelemetryDomain,
  expectQueuedRcReviewRows,
  openConnectedSetupWorkspace,
  parameterReviewRowLocator,
  primeSetupMetadata,
  setupCalibrationActionLocator,
  setupCalibrationCardLocator,
  setupConnectedVehicleState,
  setupMetadataUnavailableVehicleState,
  setupNavLocator,
  setupRcBarLocator,
  setupRcPresetLocator,
  setupWorkspaceSelectors,
  simulateSetupReconnectSameScope,
} from "./helpers/setup-workspace";

test.describe("setup workspace proof", () => {
  test("keeps metadata-degraded recovery truthful and reachable on Radiomaster width", async ({
    page,
    mockPlatform,
  }) => {
    await applyShellViewport(page, "radiomaster");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupMetadataUnavailableVehicleState,
      telemetry: createSetupTelemetryDomain(null),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([
        { sequence: 1, text: "Setup metadata unavailable", severity: "warning", timestamp_usec: 100 },
      ]),
    });

    await openConnectedSetupWorkspace(page);

    await expect(page.locator(setupWorkspaceSelectors.notice)).toContainText("Parameter metadata is unavailable");
    await expect(page.locator(setupWorkspaceSelectors.overviewBanner)).toContainText(
      "Metadata missing — recovery mode is active",
    );
    await expect(setupNavLocator(page, "frame_orientation")).toBeDisabled();
    await expect(setupNavLocator(page, "rc_receiver")).toBeDisabled();
    await expect(setupNavLocator(page, "calibration")).toBeDisabled();
    await expect(page.locator(setupWorkspaceSelectors.detailRecovery)).toContainText(
      "Full Parameters stays separate",
    );

    await setupNavLocator(page, "full_parameters").click();

    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("full_parameters");
    await expect(page.locator(setupWorkspaceSelectors.fullParameters)).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.root)).toBeVisible();
  });

  test("surfaces retained RC mapping failures instead of bluffing a successful setup apply", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      telemetry: createSetupTelemetryDomain(null),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
    });

    await openConnectedSetupWorkspace(page);
    await setupNavLocator(page, "rc_receiver").click();

    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("rc_receiver");
    await expect(page.locator(setupWorkspaceSelectors.rcSignal)).toContainText("Waiting for RC signal");

    await setupRcPresetLocator(page, "taer").click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("3 queued");
    await expectQueuedRcReviewRows(page, ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE"]);

    await mockPlatform.setCommandBehavior("param_write_batch", {
      type: "resolve",
      result: [
        { name: "RCMAP_ROLL", requested_value: 2, confirmed_value: 1, success: false },
        { name: "RCMAP_PITCH", requested_value: 3, confirmed_value: 3, success: true },
        { name: "RCMAP_THROTTLE", requested_value: 1, confirmed_value: 1, success: true },
      ],
    });

    await page.locator(parameterWorkspaceSelectors.reviewApply).click();

    await expect(page.locator(setupWorkspaceSelectors.rcFailure)).toContainText(
      "The shared review tray is still retaining RC mapping failures.",
    );
    await expect(page.locator(setupWorkspaceSelectors.rcFailure)).toContainText("RCMAP_ROLL");
    await expect(parameterReviewRowLocator(page, "RCMAP_ROLL")).toContainText("RCMAP_ROLL");
    await expect(parameterReviewRowLocator(page, "RCMAP_PITCH")).toHaveCount(0);
    await expect(parameterReviewRowLocator(page, "RCMAP_THROTTLE")).toHaveCount(0);
  });

  test("covers RC live bars, shared-tray reboot checkpoint resume, and compass lifecycle truth on desktop", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1200, 1300, 1400],
        rc_rssi: 72,
      }),
      support: createSetupSupportDomain({ can_calibrate_radio: false }),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([
        { sequence: 1, text: "Rotate vehicle to calibrate compass", severity: "notice", timestamp_usec: 100 },
      ]),
    });

    await openConnectedSetupWorkspace(page);
    await expect(page.locator(setupWorkspaceSelectors.metadata)).toContainText("Metadata ready");
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("overview");

    await setupNavLocator(page, "rc_receiver").click();
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("rc_receiver");
    await expect(page.locator(setupWorkspaceSelectors.rcSignal)).toContainText("4 live");
    await expect(page.locator(setupWorkspaceSelectors.rcRssi)).toContainText("72");
    await expect(setupRcBarLocator(page, 1)).toContainText("1100");
    await expect(setupRcBarLocator(page, 4)).toContainText("1400");

    await setupRcPresetLocator(page, "taer").click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("3 queued");
    await expectQueuedRcReviewRows(page, ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE"]);

    await page.locator(parameterWorkspaceSelectors.reviewApply).click();

    await expect(page.locator(setupWorkspaceSelectors.checkpoint)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.checkpointTitle)).toContainText("Reconnect required");
    await expect(page.locator(setupWorkspaceSelectors.checkpointDetail)).toContainText(
      "Reboot-required setup changes were confirmed through the shared review tray",
    );
    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toHaveCount(0);
    await expect(setupRcPresetLocator(page, "aetr")).toBeDisabled();

    const resumedEnvelope = await simulateSetupReconnectSameScope(mockPlatform, {
      vehicleState: setupConnectedVehicleState,
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1110, 1210, 1310, 1410],
        rc_rssi: 74,
      }),
      support: createSetupSupportDomain({ can_calibrate_radio: false }),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([
        { sequence: 2, text: "Compass calibration ready", severity: "notice", timestamp_usec: 200 },
      ]),
    });

    await expect(page.locator(setupWorkspaceSelectors.checkpointTitle)).toContainText("Setup resumed");
    await expect(page.locator(setupWorkspaceSelectors.checkpointDetail)).toContainText("Resumed RC receiver");
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("rc_receiver");

    await page.locator(setupWorkspaceSelectors.checkpointDismiss).click();
    await expect(page.locator(setupWorkspaceSelectors.checkpoint)).toHaveCount(0);

    await setupNavLocator(page, "calibration").click();
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("calibration");
    await expect(page.locator(setupWorkspaceSelectors.calibrationNotices)).toContainText(
      "Compass calibration ready",
    );
    await expect(setupCalibrationCardLocator(page, "radio")).toContainText("Unavailable");

    await mockPlatform.setCommandBehavior("calibrate_compass_start", {
      type: "resolve",
      emit: [
        {
          event: "calibration://state",
          payload: {
            envelope: resumedEnvelope,
            value: createSetupCalibrationDomain({
              compass: { lifecycle: "running", progress: null, report: null },
            }),
          },
        },
        {
          event: "status_text://state",
          payload: {
            envelope: resumedEnvelope,
            value: createSetupStatusTextDomain([
              { sequence: 3, text: "Compass calibration running", severity: "notice", timestamp_usec: 300 },
            ]),
          },
        },
      ],
    });

    await setupCalibrationActionLocator(page, "compass").click();
    await expect(setupCalibrationCardLocator(page, "compass")).toContainText("Running");
    await expect(setupCalibrationActionLocator(page, "compass")).toContainText("Cancel compass calibration");
    await expect(page.locator(setupWorkspaceSelectors.calibrationNotices)).toContainText(
      "Compass calibration running",
    );
  });
});

import { setupWorkspaceTestIds } from "../src/components/setup/setup-workspace-test-ids";
import {
  applyShellViewport,
  expect,
  parameterWorkspaceSelectors,
  test,
} from "./fixtures/mock-platform";
import {
  connectSetupSession,
  createDodecahexaMotorSetupParamStore,
  createFullExpertSetupParamStore,
  createPlainPlaneSetupParamStore,
  createQuadPlaneSetupParamStore,
  createSetupCalibrationDomain,
  createSetupConfigurationFactsDomain,
  createSetupStatusTextDomain,
  createSetupSupportDomain,
  createSetupTelemetryDomain,
  createTailsitterServoSetupParamStore,
  openConnectedSetupWorkspace,
  parameterReviewRowLocator,
  primeSetupMetadata,
  setupConnectedVehicleState,
  setupFrameBannerLocator,
  setupFrameInputLocator,
  setupFrameStageButtonLocator,
  setupMetadataUnavailableVehicleState,
  setupMotorsEscBannerLocator,
  setupMotorsEscRowAvailabilityLocator,
  setupMotorsEscRowLocator,
  setupMotorsEscRowResultLocator,
  setupMotorsEscRowReverseLocator,
  setupMotorsEscRowReversedLocator,
  setupMotorsEscRowTestLocator,
  setupNavLocator,
  setupOverviewCardLocator,
  setupOverviewDocLinkLocator,
  setupOverviewGroupCountLocator,
  setupOverviewMetricLocator,
  setupOverviewQuickActionLocator,
  setupPlaneVehicleState,
  setupServoOutputsBannerLocator,
  setupServoOutputsFunctionGroupLocator,
  setupServoOutputsRawAvailabilityLocator,
  setupServoOutputsRawInputLocator,
  setupServoOutputsRawReadbackLocator,
  setupServoOutputsRawSendLocator,
  setupServoOutputsRowMinLocator,
  setupServoOutputsRowResultLocator,
  setupServoOutputsRowReverseLocator,
  setupServoOutputsRowReversedLocator,
  setupWorkspaceSelectors,
  simulateSetupReconnectSameScope,
} from "./helpers/setup-workspace";

async function expectLatestInvocation(
  mockPlatform: { getInvocations: () => Promise<Array<{ cmd: string; args: Record<string, unknown> | undefined }>> },
  cmd: string,
  args: Record<string, unknown>,
): Promise<void> {
  await expect.poll(async () => {
    const invocations = (await mockPlatform.getInvocations()).filter((invocation) => invocation.cmd === cmd);
    return invocations[invocations.length - 1]?.args ?? null;
  }).toEqual(args);
}

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
    await expect(setupNavLocator(page, "frame_orientation")).toHaveAttribute("data-availability", "blocked");
    await expect(setupNavLocator(page, "rc_receiver")).toHaveAttribute("data-availability", "blocked");
    await expect(setupNavLocator(page, "calibration")).toHaveAttribute("data-availability", "blocked");
    await expect(page.locator(setupWorkspaceSelectors.detailRecovery)).toContainText(
      "Full Parameters stays separate",
    );

    await setupNavLocator(page, "full_parameters").click();

    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("full_parameters");
    await expect(page.locator(setupWorkspaceSelectors.fullParameters)).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.root)).toBeVisible();
  });

  test("keeps grouped overview/status readable and proves representative hardware, safety, and tuning flows", async ({
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
      paramStore: createFullExpertSetupParamStore({
        SIMPLE: 0b000001,
        SUPER_SIMPLE: 0b001000,
      }),
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
        servo_outputs: [1500, 1600, 1700, 1800],
      }, {
        value: {
          gps: {
            fix_type: "fix_3d",
            satellites: 16,
            hdop: 0.7,
          },
          navigation: {
            latitude_deg: 47.1234567,
            longitude_deg: 8.7654321,
          },
          power: {
            battery_voltage_v: 15.2,
            battery_current_a: 18.4,
            battery_pct: 63,
            battery_voltage_cells: [3.8, 3.8, 3.8, 3.8],
          },
        },
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([
        { sequence: 1, text: "Compass not calibrated", severity: "warning", timestamp_usec: 100 },
        { sequence: 2, text: "PreArm: GPS 3D fix required", severity: "warning", timestamp_usec: 200 },
      ]),
    });

    await openConnectedSetupWorkspace(page);

    await expect(setupOverviewMetricLocator(page, "inventory")).toContainText("18 sections");
    await expect(setupOverviewMetricLocator(page, "progress")).toContainText(/\/14 confirmed/);
    await expect(setupOverviewDocLinkLocator(page, "hardware")).toHaveAttribute(
      "href",
      /common-positioning-landing-page/,
    );
    await expect(setupOverviewGroupCountLocator(page, "hardware")).toContainText("7 sections · 7 purpose-built editors");

    await setupOverviewQuickActionLocator(page, "flight_modes").click();
    await expect(page.locator(setupWorkspaceSelectors.flightModesSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.flightModesAvailabilityState)).toContainText("Live");
    await expect(page.locator(setupWorkspaceSelectors.flightModesCurrentMode)).toContainText("LOITER");
    await expect(page.locator(setupWorkspaceSelectors.flightModesDocsLink)).toHaveAttribute(
      "href",
      /flight-mode-configuration/,
    );

    await page.locator(`[data-testid="${setupWorkspaceTestIds.flightModesInputPrefix}-FLTMODE1"]`).selectOption("6");
    await page.locator(`[data-testid="${setupWorkspaceTestIds.flightModesStageButtonPrefix}-FLTMODE1"]`).click();
    if (!await page.locator(parameterWorkspaceSelectors.reviewSurface).isVisible()) {
      await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    }
    await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
    await expect(parameterReviewRowLocator(page, "FLTMODE1")).toContainText("FLTMODE1");

    await setupNavLocator(page, "gps").click();
    await expect(page.locator(setupWorkspaceSelectors.gpsSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.gpsLiveState)).toContainText("Live");
    await expect(page.locator(setupWorkspaceSelectors.gpsPortState)).toContainText("SERIAL3");
    await expect(page.locator(setupWorkspaceSelectors.gpsDocsLink)).toHaveAttribute(
      "href",
      /common-positioning-landing-page/,
    );

    await setupNavLocator(page, "arming").click();
    await expect(page.locator(setupWorkspaceSelectors.armingSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.armingReadiness)).toContainText(/blocker|Needs explicit re-check/i);
    await expect(page.locator(setupWorkspaceSelectors.armingBlockers)).toContainText("GPS 3D fix required");
    await expect(page.locator(setupWorkspaceSelectors.prearmDocsLink)).toHaveAttribute(
      "href",
      /common-prearm-safety-checks/,
    );

    await setupNavLocator(page, "initial_params").click();
    await expect(page.locator(setupWorkspaceSelectors.initialParamsSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.initialParamsFamilyState)).toContainText("Multirotor starter baseline");
    await expect(page.locator(setupWorkspaceSelectors.initialParamsDocsLink)).toHaveAttribute("href", /common-tuning/);
    await page
      .locator(`[data-testid="${setupWorkspaceTestIds.initialParamsPreviewPrefix}-control_baseline"]`)
      .getByRole("button", { name: "Stage in review tray" })
      .click();
    await expect(parameterReviewRowLocator(page, "MOT_THST_EXPO")).toContainText("MOT_THST_EXPO");

    await setupNavLocator(page, "peripherals").click();
    await expect(page.locator(setupWorkspaceSelectors.peripheralsSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.peripheralsDocsLink)).toHaveAttribute("href", /optional-hardware/);
    await page.locator(setupWorkspaceSelectors.peripheralsFilter).click();
    await expect(page.locator(`[data-testid="${setupWorkspaceTestIds.peripheralsGroupPrefix}-rangefinder"]`)).toBeVisible();

    await applyShellViewport(page, "radiomaster");
    await setupNavLocator(page, "overview").click();
    await expect(setupOverviewMetricLocator(page, "inventory")).toContainText("18 sections");
    await expect(setupOverviewGroupCountLocator(page, "hardware")).toContainText("7 sections");
    await expect(setupOverviewDocLinkLocator(page, "hardware")).toBeVisible();
  });

  test("keeps flight-mode proof fail-closed when get_available_modes returns only malformed rows", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      paramStore: createFullExpertSetupParamStore({
        FLTMODE1: 99,
      }),
      availableModes: [
        { custom_mode: "oops", name: "Broken" },
        { custom_mode: 6, name: "   " },
      ] as unknown,
      telemetry: createSetupTelemetryDomain({
        rc_channels: [1100, 1500, 1900, 1300, 1450],
        rc_rssi: 84,
        servo_outputs: undefined,
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
    });

    await openConnectedSetupWorkspace(page);
    await setupNavLocator(page, "flight_modes").click();

    await expect(page.locator(setupWorkspaceSelectors.flightModesSection)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.flightModesAvailabilityState)).toContainText("Mode list unavailable");
    await expect(page.locator(setupWorkspaceSelectors.flightModesAvailabilityDetail)).toContainText(
      "Available flight modes have not been confirmed",
    );
    await expect(page.locator(`[data-testid="${setupWorkspaceTestIds.flightModesBannerPrefix}-recovery"]`)).toContainText(
      "fail-closed",
    );
    await expect(page.locator(`[data-testid="${setupWorkspaceTestIds.flightModesStageButtonPrefix}-FLTMODE1"]`)).toBeDisabled();

    await setupNavLocator(page, "overview").click();
    await expect(setupOverviewCardLocator(page, "flight_modes")).toContainText("Flight modes");
    await expect(setupOverviewMetricLocator(page, "status")).toContainText("unconfirmed");
  });

  test("seeds ArduPlane metadata, stages QuadPlane enable through the shared tray, and resumes on refreshed VTOL truth", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await expect.poll(() => page.evaluate(() => ({
      arducopter: Boolean(window.localStorage.getItem("param_meta_ArduCopter")),
      arduplane: Boolean(window.localStorage.getItem("param_meta_ArduPlane")),
    }))).toEqual({ arducopter: true, arduplane: true });

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupPlaneVehicleState,
      paramStore: createPlainPlaneSetupParamStore(),
      telemetry: createSetupTelemetryDomain(null),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
    });

    await openConnectedSetupWorkspace(page);
    await expect(page.locator(setupWorkspaceSelectors.metadata)).toContainText("Metadata ready");

    await setupNavLocator(page, "frame_orientation").click();
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("frame_orientation");
    await expect(page.locator(setupWorkspaceSelectors.frameVehicleState)).toContainText("Plain Plane");
    await expect(page.locator(setupWorkspaceSelectors.frameLayoutState)).toContainText("Preview blocked");
    await expect(setupFrameBannerLocator(page, "plain-plane")).toContainText("Enable Q_ENABLE");
    await expect(page.locator(setupWorkspaceSelectors.frameDocsLink)).toHaveAttribute(
      "href",
      "https://ardupilot.org/plane/docs/quadplane-frame-setup.html",
    );
    await expect(setupFrameInputLocator(page, "Q_ENABLE")).toBeVisible();

    await setupFrameInputLocator(page, "Q_ENABLE").selectOption("1");
    await setupFrameStageButtonLocator(page, "Q_ENABLE").click();

    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
    await expect(parameterReviewRowLocator(page, "Q_ENABLE")).toContainText("Q_ENABLE");

    await page.locator(parameterWorkspaceSelectors.reviewApply).click();

    await expect(page.locator(setupWorkspaceSelectors.checkpoint)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.checkpointTitle)).toContainText("Reconnect required");
    await expect(page.locator(setupWorkspaceSelectors.checkpointDetail)).toContainText(
      "Reboot-required setup changes were confirmed through the shared review tray",
    );

    await setupNavLocator(page, "motors_esc").click();
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("motors_esc");
    await expect(page.locator(setupWorkspaceSelectors.motorsEscSafetyState)).toContainText("Blocked by checkpoint");
    await expect(page.locator(setupWorkspaceSelectors.motorsEscUnlock)).toBeDisabled();

    await simulateSetupReconnectSameScope(mockPlatform, {
      vehicleState: setupPlaneVehicleState,
      paramStore: createQuadPlaneSetupParamStore(),
      paramProgress: "completed",
      telemetry: createSetupTelemetryDomain(null),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
      statusText: createSetupStatusTextDomain([
        { sequence: 2, text: "QuadPlane VTOL parameters refreshed", severity: "notice", timestamp_usec: 200 },
      ]),
    });

    await expect(page.locator(setupWorkspaceSelectors.checkpointTitle)).toContainText("Setup resumed");

    await setupNavLocator(page, "frame_orientation").click();
    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("frame_orientation");
    await expect(page.locator(setupWorkspaceSelectors.frameVehicleState)).toContainText("QuadPlane ready");
    await expect(page.locator(setupWorkspaceSelectors.frameLayoutState)).toContainText("Supported");
    await expect(setupFrameInputLocator(page, "Q_FRAME_CLASS")).toBeVisible();
    await expect(setupFrameInputLocator(page, "Q_FRAME_TYPE")).toBeVisible();
    await expect(setupFrameInputLocator(page, "Q_ENABLE")).toHaveCount(0);

    await page.locator(setupWorkspaceSelectors.checkpointDismiss).click();
    await expect(page.locator(setupWorkspaceSelectors.checkpoint)).toHaveCount(0);
  });

  test("proves one motor unlock, inline motor_test rejection, shared-tray reversal staging, and 1..=8 bridge-limit messaging", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      paramStore: createDodecahexaMotorSetupParamStore(),
      telemetry: createSetupTelemetryDomain(null),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
    });

    await openConnectedSetupWorkspace(page);
    await setupNavLocator(page, "motors_esc").click();

    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("motors_esc");
    await expect(page.locator(setupWorkspaceSelectors.motorsEscSummary)).toBeVisible();
    await expect(page.locator(setupWorkspaceSelectors.motorsEscSafetyState)).toContainText("Locked");
    await expect(setupMotorsEscBannerLocator(page, "bridge-limit")).toContainText("bridge window");
    await expect(setupMotorsEscRowAvailabilityLocator(page, 9)).toContainText("1..=8");
    await expect(setupMotorsEscRowTestLocator(page, 9)).toContainText("1..=8");
    await expect(setupMotorsEscRowTestLocator(page, 9)).toBeDisabled();

    await page.locator(setupWorkspaceSelectors.motorsEscUnlock).click();
    await expect(page.locator(setupWorkspaceSelectors.motorsEscSafetyState)).toContainText("Unlocked");

    await mockPlatform.setCommandBehavior("motor_test", {
      type: "reject",
      error: "bridge offline",
    });

    await setupMotorsEscRowTestLocator(page, 1).click();
    await expect(setupMotorsEscRowLocator(page, 1)).toContainText("bridge offline");
    await expect(page.locator(setupWorkspaceSelectors.motorsEscSafetyState)).toContainText("Unlocked");

    await mockPlatform.clearCommandBehavior("motor_test");
    await setupMotorsEscRowTestLocator(page, 1).click();

    await expect(setupMotorsEscRowResultLocator(page, 1)).toContainText("Awaiting confirmation");
    await expectLatestInvocation(mockPlatform, "motor_test", {
      motorInstance: 1,
      throttlePct: 5,
      durationS: 2,
    });

    await setupMotorsEscRowReversedLocator(page, 1).click();
    await setupMotorsEscRowReverseLocator(page, 1).click();

    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(parameterReviewRowLocator(page, "SERVO1_REVERSED")).toContainText("SERVO1_REVERSED");
    await expect(page.locator(setupWorkspaceSelectors.motorsEscReversalState)).toContainText("queued");
  });

  test("proves ArduPlane servo grouping, grouped and raw actuation, shared-tray reversal staging, and unsupported-output messaging", async ({
    page,
    mockPlatform,
  }) => {
    await primeSetupMetadata(page);
    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();

    await connectSetupSession(page, mockPlatform, {
      vehicleState: setupPlaneVehicleState,
      paramStore: createTailsitterServoSetupParamStore(),
      telemetry: createSetupTelemetryDomain(null, {
        value: {
          radio: {
            servo_outputs: [1502, 1608],
          },
        },
      }),
      support: createSetupSupportDomain(),
      configurationFacts: createSetupConfigurationFactsDomain(),
      calibration: createSetupCalibrationDomain(),
    });

    await openConnectedSetupWorkspace(page);
    await setupNavLocator(page, "servo_outputs").click();

    await expect(page.locator(setupWorkspaceSelectors.selectedSection)).toContainText("servo_outputs");
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsSummary)).toBeVisible();
    await expect(setupServoOutputsFunctionGroupLocator(page, 4)).toBeVisible();
    await expect(setupServoOutputsBannerLocator(page, "generic-fallback")).toContainText(
      "generic configured-output groups",
    );
    await expect(setupServoOutputsRawReadbackLocator(page, 2)).toContainText("live");
    await expect(setupServoOutputsRawAvailabilityLocator(page, 17)).toContainText("SERVO1–16");

    await page.locator(setupWorkspaceSelectors.servoOutputsUnlock).click();
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsSafetyState)).toContainText("Unlocked");

    await mockPlatform.setCommandBehavior("set_servo", {
      type: "reject",
      error: "link dropped",
    });

    await setupServoOutputsRawSendLocator(page, 2).click();
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsSection)).toContainText("link dropped");
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsSafetyState)).toContainText("Unlocked");

    await mockPlatform.clearCommandBehavior("set_servo");
    await setupServoOutputsRowMinLocator(page, 2).click();

    await expect(setupServoOutputsRowResultLocator(page, 2)).toContainText("Awaiting confirmation");
    await expectLatestInvocation(mockPlatform, "set_servo", {
      instance: 2,
      pwmUs: 1000,
    });

    await setupServoOutputsRawInputLocator(page, 2).fill("1200");
    await setupServoOutputsRawSendLocator(page, 2).click();

    await expectLatestInvocation(mockPlatform, "set_servo", {
      instance: 2,
      pwmUs: 1200,
    });
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsSelectedTarget)).toContainText("SERVO2");

    await setupServoOutputsRowReversedLocator(page, 2).click();
    await setupServoOutputsRowReverseLocator(page, 2).click();

    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(parameterReviewRowLocator(page, "SERVO2_REVERSED")).toContainText("SERVO2_REVERSED");
    await expect(page.locator(setupWorkspaceSelectors.servoOutputsReversalState)).toContainText("queued");
  });
});

import {
  applyShellViewport,
  connectionSelectors,
  expect,
  openParameterWorkspace,
  parameterReviewFailureLocator,
  parameterReviewRetryLocator,
  parameterReviewRowLocator,
  parameterWorkspaceSelectors,
  stageParameterValue,
  test,
} from "./fixtures/mock-platform";

const paramMetadataXml = `<?xml version="1.0"?>
<parameters>
  <param name="ArduCopter:ARMING_CHECK" humanName="Arming checks" documentation="Controls pre-arm validation.">
    <field name="RebootRequired">true</field>
  </param>
  <param name="ArduCopter:FS_THR_ENABLE" humanName="Throttle failsafe" documentation="Select the throttle failsafe behavior." />
</parameters>`;

const connectedVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "LOITER",
  system_status: "STANDBY",
  vehicle_type: "quadrotor",
  autopilot: "ardu_pilot_mega",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
};

const guidedState = {
  status: "blocked" as const,
  session: null,
  entered_at_unix_msec: null,
  blocking_reason: "vehicle_disarmed" as const,
  termination: null,
  last_command: null,
  actions: {
    start: { allowed: false, blocking_reason: "vehicle_disarmed" as const },
    update: { allowed: false, blocking_reason: "vehicle_disarmed" as const },
    stop: { allowed: false, blocking_reason: "live_session_required" as const },
  },
};

test.describe("parameter workspace batch apply", () => {
  test("proves staging, partial failure retention, and scope-reset clearing in the mocked browser lane", async ({
    page,
    mockPlatform,
  }) => {
    await page.addInitScript((xml) => {
      window.localStorage.setItem("param_meta_ArduCopter", xml);
      window.localStorage.setItem("param_meta_ArduCopter_ts", String(Date.now()));
    }, paramMetadataXml);

    await applyShellViewport(page, "desktop");
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForRuntimeSurface();
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

    await page.locator(connectionSelectors.connectButton).click();
    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connecting", { timeout: 10_000 });

    await mockPlatform.resolveDeferredConnectLink({
      vehicleState: connectedVehicleState,
      paramStore: {
        expected_count: 2,
        params: {
          ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
          FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
        },
      },
      paramProgress: "completed",
      guidedState,
    });
    await mockPlatform.emitParamStore({
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      },
    });
    await mockPlatform.emitParamProgress("completed");

    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", { timeout: 10_000 });
    await openParameterWorkspace(page);

    await expect(page.locator(parameterWorkspaceSelectors.state)).toContainText("Settings ready");
    await expect(page.locator(parameterWorkspaceSelectors.scope)).toContainText("live");
    await expect(page.locator(parameterWorkspaceSelectors.metadata)).toContainText("Info ready");

    await stageParameterValue(page, "ARMING_CHECK", "3");
    await stageParameterValue(page, "FS_THR_ENABLE", "4");

    await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("2 pending");
    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("2 queued");

    await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
    await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
    await expect(parameterReviewRowLocator(page, "ARMING_CHECK")).toContainText("ARMING_CHECK");
    await expect(parameterReviewRowLocator(page, "FS_THR_ENABLE")).toContainText("FS_THR_ENABLE");

    await mockPlatform.setCommandBehavior("param_write_batch", { type: "defer" });
    await page.locator(parameterWorkspaceSelectors.reviewApply).click();

    await expect(page.locator(parameterWorkspaceSelectors.reviewSummary)).toContainText("Applying 2 changes");
    await mockPlatform.emitParamProgress({ writing: { index: 1, total: 2, name: "ARMING_CHECK" } });
    await expect(page.locator(parameterWorkspaceSelectors.reviewProgress)).toContainText("Writing ARMING_CHECK · 1/2");
    await expect(parameterReviewRowLocator(page, "ARMING_CHECK")).toContainText("writing");

    await mockPlatform.resolveDeferred("param_write_batch", [
      { name: "ARMING_CHECK", requested_value: 3, confirmed_value: 3, success: true },
      { name: "FS_THR_ENABLE", requested_value: 4, confirmed_value: 2, success: false },
    ]);
    await mockPlatform.emitParamStore({
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 3, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      },
    });
    await mockPlatform.emitParamProgress("completed");

    await expect(parameterReviewRowLocator(page, "ARMING_CHECK")).toHaveCount(0);
    await expect(parameterReviewFailureLocator(page, "FS_THR_ENABLE")).toContainText("Vehicle kept 2 instead of 4.");
    await expect(parameterReviewRetryLocator(page, "FS_THR_ENABLE")).toBeVisible();
    await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("1 pending");
    await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("1 queued");
    await expect(page.locator(parameterWorkspaceSelectors.reviewSummary)).toContainText("still need attention");

    const invocations = await mockPlatform.getInvocations();
    const batchInvocation = [...invocations].reverse().find((entry) => entry.cmd === "param_write_batch");
    expect(batchInvocation?.args).toEqual({
      params: [["ARMING_CHECK", 3], ["FS_THR_ENABLE", 4]],
    });

    await page.locator(connectionSelectors.disconnectButton).click();

    await expect(page.locator(connectionSelectors.statusText)).toContainText("Idle", { timeout: 10_000 });
    await expect(page.locator(parameterWorkspaceSelectors.reviewTray)).toHaveCount(0);
    await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toHaveCount(0);
    await expect(page.locator(parameterWorkspaceSelectors.notice)).toContainText("Staged edits were cleared");
    await expect(page.locator(parameterWorkspaceSelectors.notice)).toContainText("restage against the active session");
    await expect(page.locator(parameterWorkspaceSelectors.state)).toContainText("Connect to load");
  });
});

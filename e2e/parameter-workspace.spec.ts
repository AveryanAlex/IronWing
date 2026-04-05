import type { Page } from "@playwright/test";

import {
    applyShellViewport,
    connectionSelectors,
    expect,
    openParameterWorkspace,
    parameterInputLocator,
    parameterReviewRowLocator,
    parameterWorkspaceSelectors,
    test,
} from "./fixtures/mock-platform";

const paramMetadataXml = `<?xml version="1.0"?>
<parameters>
  <param name="ArduCopter:ARMING_CHECK" humanName="Arming checks" documentation="Controls pre-arm validation." user="Standard">
    <field name="RebootRequired">true</field>
    <values>
      <value code="0">Disabled</value>
      <value code="1">All checks</value>
    </values>
  </param>
  <param name="ArduCopter:FS_THR_ENABLE" humanName="Throttle failsafe" documentation="Select the throttle failsafe behavior." user="Standard">
    <values>
      <value code="0">Disabled</value>
      <value code="1">Enabled always</value>
    </values>
  </param>
  <param name="ArduCopter:BATT_FS_LOW_ACT" humanName="Low battery action" documentation="Action taken on low battery." user="Standard">
    <values>
      <value code="0">None</value>
      <value code="2">RTL</value>
    </values>
  </param>
  <param name="ArduCopter:BATT_FS_CRT_ACT" humanName="Critical battery action" documentation="Action taken on critical battery." user="Standard">
    <values>
      <value code="0">None</value>
      <value code="1">Land</value>
    </values>
  </param>
  <param name="ArduCopter:BATT_ARM_VOLT" humanName="Arm voltage" documentation="Minimum voltage required to arm." user="Standard">
    <field name="UnitText">V</field>
  </param>
  <param name="ArduCopter:BATT_LOW_VOLT" humanName="Low voltage" documentation="Battery warning threshold." user="Standard">
    <field name="UnitText">V</field>
  </param>
  <param name="ArduCopter:BATT_CRT_VOLT" humanName="Critical voltage" documentation="Battery critical threshold." user="Standard">
    <field name="UnitText">V</field>
  </param>
  <param name="ArduCopter:MOT_BAT_VOLT_MAX" humanName="Motor battery max" documentation="Maximum battery voltage used by motor compensation." user="Standard">
    <field name="UnitText">V</field>
  </param>
  <param name="ArduCopter:MOT_BAT_VOLT_MIN" humanName="Motor battery min" documentation="Minimum battery voltage used by motor compensation." user="Standard">
    <field name="UnitText">V</field>
  </param>
  <param name="ArduCopter:MOT_THST_EXPO" humanName="Thrust expo" documentation="Throttle curve exponent." user="Standard" />
  <param name="ArduCopter:INS_GYRO_FILTER" humanName="Gyro filter" documentation="Primary gyro filter." user="Standard">
    <field name="UnitText">Hz</field>
  </param>
  <param name="ArduCopter:ATC_ACCEL_P_MAX" humanName="Pitch accel max" documentation="Pitch acceleration limit." user="Standard" />
  <param name="ArduCopter:ATC_ACCEL_R_MAX" humanName="Roll accel max" documentation="Roll acceleration limit." user="Standard" />
  <param name="ArduCopter:ATC_ACCEL_Y_MAX" humanName="Yaw accel max" documentation="Yaw acceleration limit." user="Standard" />
  <param name="ArduCopter:LOG_BITMASK" humanName="Log bitmask" documentation="Enabled log streams." user="Advanced">
    <bitmask>
      <bit code="0">Fast attitude</bit>
      <bit code="2">PID</bit>
    </bitmask>
  </param>
  <param name="ArduCopter:FORMAT_VERSION" humanName="Format version" documentation="Current parameter table format version." user="Advanced">
    <field name="ReadOnly">true</field>
  </param>
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

const metadataUnavailableVehicleState = {
    ...connectedVehicleState,
    vehicle_type: "submarine",
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

const parameterSnapshot = {
    expected_count: 16,
    params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8" as const, index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8" as const, index: 1 },
        BATT_FS_LOW_ACT: { name: "BATT_FS_LOW_ACT", value: 0, param_type: "uint8" as const, index: 2 },
        BATT_FS_CRT_ACT: { name: "BATT_FS_CRT_ACT", value: 0, param_type: "uint8" as const, index: 3 },
        BATT_ARM_VOLT: { name: "BATT_ARM_VOLT", value: 12.6, param_type: "real32" as const, index: 4 },
        BATT_LOW_VOLT: { name: "BATT_LOW_VOLT", value: 12.1, param_type: "real32" as const, index: 5 },
        BATT_CRT_VOLT: { name: "BATT_CRT_VOLT", value: 11.7, param_type: "real32" as const, index: 6 },
        MOT_BAT_VOLT_MAX: { name: "MOT_BAT_VOLT_MAX", value: 12.6, param_type: "real32" as const, index: 7 },
        MOT_BAT_VOLT_MIN: { name: "MOT_BAT_VOLT_MIN", value: 11.1, param_type: "real32" as const, index: 8 },
        MOT_THST_EXPO: { name: "MOT_THST_EXPO", value: 0.35, param_type: "real32" as const, index: 9 },
        INS_GYRO_FILTER: { name: "INS_GYRO_FILTER", value: 20, param_type: "uint16" as const, index: 10 },
        ATC_ACCEL_P_MAX: { name: "ATC_ACCEL_P_MAX", value: 10000, param_type: "uint32" as const, index: 11 },
        ATC_ACCEL_R_MAX: { name: "ATC_ACCEL_R_MAX", value: 10000, param_type: "uint32" as const, index: 12 },
        ATC_ACCEL_Y_MAX: { name: "ATC_ACCEL_Y_MAX", value: 8000, param_type: "uint32" as const, index: 13 },
        LOG_BITMASK: { name: "LOG_BITMASK", value: 5, param_type: "uint32" as const, index: 14 },
        FORMAT_VERSION: { name: "FORMAT_VERSION", value: 3, param_type: "uint32" as const, index: 15 },
    },
};

async function connectParameterSession(
    page: Page,
    mockPlatform: {
        setCommandBehavior: (cmd: string, behavior: { type: "defer" }) => Promise<void>;
        resolveDeferredConnectLink: (params: {
            vehicleState: typeof connectedVehicleState;
            paramStore: typeof parameterSnapshot;
            paramProgress: "completed";
            guidedState: typeof guidedState;
        }) => Promise<boolean>;
        emitParamStore: (paramStore: typeof parameterSnapshot) => Promise<void>;
        emitParamProgress: (paramProgress: "completed") => Promise<void>;
    },
    vehicleState = connectedVehicleState,
) {
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
    await page.locator(connectionSelectors.connectButton).click();
    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connecting", { timeout: 10_000 });

    await mockPlatform.resolveDeferredConnectLink({
        vehicleState,
        paramStore: parameterSnapshot,
        paramProgress: "completed",
        guidedState,
    });
    await mockPlatform.emitParamStore(parameterSnapshot);
    await mockPlatform.emitParamProgress("completed");

    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", { timeout: 10_000 });
}

test.describe("parameter workspace workflow/expert convergence", () => {
    test("converges workflow, expert, and file-driven edits in the shared review tray", async ({
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
        await mockPlatform.clearSavedFiles();
        await mockPlatform.setOpenFile(
            "INS_GYRO_FILTER,30\nBATT_LOW_VOLT,12.1\nUNKNOWN_PARAM,9\n",
            "expert-import.param",
        );
        await mockPlatform.setSaveFileName("vehicle-export.param");
        await mockPlatform.waitForRuntimeSurface();

        await connectParameterSession(page, mockPlatform);
        await openParameterWorkspace(page);

        await expect(page.locator(parameterWorkspaceSelectors.state)).toContainText("Settings ready");
        await expect(page.locator(parameterWorkspaceSelectors.scope)).toContainText("live");
        await expect(page.locator(parameterWorkspaceSelectors.metadata)).toContainText("Info ready");

        await page.locator('[data-testid="parameter-workflow-stage-btn-safety"]').click();
        await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("4 pending");

        await page.locator('[data-testid="parameter-workflow-advanced-btn-safety"]').click();
        await expect(page.locator(parameterWorkspaceSelectors.advancedPanel)).toBeVisible();
        await expect(page.locator(parameterWorkspaceSelectors.expertHighlightSummary)).toContainText(
            "highlighting 4 parameters",
        );

        await page.locator('[data-testid="parameter-expert-filter-all"]').click();
        await parameterInputLocator(page, "LOG_BITMASK").fill("1");
        await page.locator('[data-testid="parameter-workspace-stage-btn-LOG_BITMASK"]').click();
        await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("5 pending");

        await page.locator(parameterWorkspaceSelectors.expertFileImportButton).click();
        await expect(page.locator(parameterWorkspaceSelectors.expertFileMessage)).toContainText(
            "Staged 1 imported change",
        );
        await expect(page.locator(parameterWorkspaceSelectors.expertFileStatus)).toContainText("Skipped 2 rows");
        await expect(page.locator(parameterWorkspaceSelectors.expertFileStatus)).toHaveAttribute("data-staged-count", "1");
        await expect(page.locator(parameterWorkspaceSelectors.expertFileStatus)).toHaveAttribute("data-skipped-count", "2");
        await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("6 pending");

        await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
        await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
        await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("6 queued");
        await expect(parameterReviewRowLocator(page, "ARMING_CHECK")).toContainText("ARMING_CHECK");
        await expect(parameterReviewRowLocator(page, "LOG_BITMASK")).toContainText("LOG_BITMASK");
        await expect(parameterReviewRowLocator(page, "INS_GYRO_FILTER")).toContainText("INS_GYRO_FILTER");

        await page.locator(parameterWorkspaceSelectors.expertFileExportButton).click();
        await expect(page.locator(parameterWorkspaceSelectors.expertFileMessage)).toContainText(
            "Exported 16 current parameters",
        );

        const savedFiles = await mockPlatform.getSavedFiles();
        expect(savedFiles).toHaveLength(1);
        expect(savedFiles[0]?.name).toBe("vehicle-export.param");
        expect(savedFiles[0]?.contents).toContain("ARMING_CHECK,0\n");
        expect(savedFiles[0]?.contents).toContain("LOG_BITMASK,5\n");
        expect(savedFiles[0]?.contents).toContain("INS_GYRO_FILTER,20\n");

        const invocations = await mockPlatform.getInvocations();
        expect(invocations).toEqual(expect.arrayContaining([
            {
                cmd: "param_parse_file",
                args: {
                    contents: "INS_GYRO_FILTER,30\nBATT_LOW_VOLT,12.1\nUNKNOWN_PARAM,9\n",
                },
            },
            {
                cmd: "param_format_file",
                args: {
                    store: parameterSnapshot,
                },
            },
        ]));
    });

    test("keeps metadata-unavailable recovery in expert mode and stages imported raw changes", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.clearSavedFiles();
        await mockPlatform.setOpenFile("ARMING_CHECK,1\n", "metadata-fallback.param");
        await mockPlatform.waitForRuntimeSurface();

        await connectParameterSession(page, mockPlatform, metadataUnavailableVehicleState);
        await openParameterWorkspace(page);

        await expect(page.locator('[data-testid="parameter-workflow-disabled-battery"]')).toContainText(
            "Parameter info is unavailable",
        );
        await page.locator('[data-testid="parameter-workflow-advanced-btn-safety"]').click();
        await expect(page.locator(parameterWorkspaceSelectors.advancedPanel)).toBeVisible();
        await expect(page.locator(parameterWorkspaceSelectors.expertMetadataFallback)).toContainText(
            "falling back to raw parameter names",
        );
        await expect(page.locator(parameterWorkspaceSelectors.expertFileActions)).toBeVisible();

        await page.locator(parameterWorkspaceSelectors.expertFileImportButton).click();
        await expect(page.locator(parameterWorkspaceSelectors.expertFileMessage)).toContainText(
            "Staged 1 imported change",
        );
        await expect(page.locator(parameterWorkspaceSelectors.pendingCount)).toContainText("1 pending");

        await page.locator(parameterWorkspaceSelectors.reviewToggle).click();
        await expect(page.locator(parameterWorkspaceSelectors.reviewSurface)).toBeVisible();
        await expect(page.locator(parameterWorkspaceSelectors.reviewCount)).toContainText("1 queued");
        await expect(parameterReviewRowLocator(page, "ARMING_CHECK")).toContainText("ARMING_CHECK");
    });
});

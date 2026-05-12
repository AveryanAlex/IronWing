import type { Page } from "@playwright/test";
import {
    applyShellViewport,
    connectionSelectors,
    expect,
    expectDockedVehiclePanel,
    openTelemetrySettings,
    openVehiclePanelDrawer,
    telemetrySettingsRowErrorLocator,
    telemetrySettingsRowInputLocator,
    telemetrySettingsRowLocator,
    telemetrySettingsSelectors,
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

async function connectLiveSession(
    page: Page,
    mockPlatform: {
        setCommandBehavior: (cmd: string, behavior: { type: "defer" | "resolve" }) => Promise<void>;
        resolveDeferredConnectLink: (params: {
            vehicleState: typeof connectedVehicleState;
            guidedState: typeof guidedState;
        }) => Promise<boolean>;
    },
) {
    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
    await page.locator(connectionSelectors.transportSelect).selectOption("tcp");
    await page.locator(connectionSelectors.tcpAddress).fill("127.0.0.1:5760");
    await page.locator(connectionSelectors.connectButton).click();

    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connecting", {
        timeout: 10_000,
    });

    await mockPlatform.resolveDeferredConnectLink({
        vehicleState: connectedVehicleState,
        guidedState,
    });

    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected", {
        timeout: 10_000,
    });
}

test.describe("telemetry settings actions", () => {
    test("desktop proof retains rejected rows, shows pending apply, captures invocations, and persists confirmed overrides", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();
        await expectDockedVehiclePanel(page, "desktop");

        await connectLiveSession(page, mockPlatform);
        await openTelemetrySettings(page);

        await expect(page.locator(telemetrySettingsSelectors.dialog)).toHaveAttribute("data-surface-kind", "dialog");

        const globalPositionInput = telemetrySettingsRowInputLocator(page, 33);
        await expect(globalPositionInput).toBeEnabled();
        await globalPositionInput.fill("6");

        await mockPlatform.setCommandBehavior("set_message_rate", { type: "defer" });
        await page.locator(telemetrySettingsSelectors.apply).click();

        await expect(page.locator(telemetrySettingsSelectors.status)).toHaveAttribute("data-status-kind", "pending");
        await expect(page.locator(telemetrySettingsSelectors.status)).toContainText("Applying telemetry settings");
        await expect(telemetrySettingsRowLocator(page, 33)).toHaveAttribute("data-row-state", "pending");
        await expect.poll(async () => (await mockPlatform.getInvocations()).filter((entry) => entry.cmd === "set_message_rate").length).toBe(1);
        await expect.poll(async () => {
            const invocations = await mockPlatform.getInvocations();
            return invocations.filter((entry) => entry.cmd === "set_message_rate").at(-1)?.args ?? null;
        }).toEqual({ messageId: 33, rateHz: 6 });

        await mockPlatform.rejectDeferred("set_message_rate", "row rejected");

        await expect(page.locator(telemetrySettingsSelectors.status)).toHaveAttribute("data-status-kind", "error");
        await expect(telemetrySettingsRowErrorLocator(page, 33)).toContainText("row rejected");
        await expect(globalPositionInput).toHaveValue("6");
        await expect(page.locator(telemetrySettingsSelectors.status)).toContainText("attempted values stay visible");

        await mockPlatform.setCommandBehavior("set_message_rate", { type: "resolve" });
        await page.locator(telemetrySettingsSelectors.apply).click();

        await expect(page.locator(telemetrySettingsSelectors.status)).toHaveAttribute("data-status-kind", "success");
        await expect(telemetrySettingsRowLocator(page, 33)).toHaveAttribute("data-row-state", "success");
        await expect(page.locator(telemetrySettingsSelectors.status)).toContainText("1 message-rate override stored");
        await expect(globalPositionInput).toHaveValue("6");
        await expect.poll(async () => (await mockPlatform.getInvocations()).filter((entry) => entry.cmd === "set_message_rate").length).toBe(2);

        const persistedSettings = await page.evaluate(() => JSON.parse(window.localStorage.getItem("ironwing.settings") ?? "{}"));
        expect(persistedSettings).toMatchObject({
            telemetryRateHz: 5,
            messageRates: { 33: 6 },
        });
    });

    test("phone proof keeps the launcher behind the vehicle drawer and reuses the shared sheet dialog", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "phone");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForOperatorWorkspace();

        await expect(page.locator(telemetrySettingsSelectors.launcher)).toHaveCount(0);
        await openVehiclePanelDrawer(page);
        await openTelemetrySettings(page);

        await expect(page.locator(telemetrySettingsSelectors.dialog)).toHaveAttribute("data-surface-kind", "sheet");
        await expect(page.locator(telemetrySettingsSelectors.dialog)).toBeVisible();
    });
});

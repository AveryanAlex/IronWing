import type { OpenSessionSnapshot } from "../src/session";
import {
    applyShellViewport,
    closeVehiclePanelDrawer,
    connectionSelectors,
    expect,
    expectDockedVehiclePanel,
    expectOperatorWorkspace,
    expectShellChrome,
    liveSurfaceValueLocator,
    openVehiclePanelDrawer,
    runtimeSelectors,
    type ShellViewportPresetName,
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

const phoneBootstrapTelemetry: OpenSessionSnapshot["telemetry"] = {
    available: true,
    complete: false,
    provenance: "bootstrap",
    value: {
        flight: {
            altitude_m: 42,
        },
        gps: {},
    },
};

const bootstrapSupport: OpenSessionSnapshot["support"] = {
    available: true,
    complete: false,
    provenance: "bootstrap",
    value: null,
};

test.describe("responsive shell chrome", () => {
    test("desktop preset keeps the operator workspace visible with the vehicle panel docked", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.waitForOperatorWorkspace();

        await expectShellChrome(page, "desktop");
        await expectOperatorWorkspace(page);
        await expect(page.locator(runtimeSelectors.shell)).toHaveAttribute("data-shell-tier", "wide");
        await expectDockedVehiclePanel(page, "desktop");
        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("--");
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("-- m");
    });

    test("Radiomaster width keeps the operator workspace visible with the docked vehicle panel", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "radiomaster");
        await page.goto("/");
        await mockPlatform.waitForOperatorWorkspace();

        await expectShellChrome(page, "radiomaster");
        await expectOperatorWorkspace(page);
        await expectDockedVehiclePanel(page, "radiomaster");
        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("--");
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("-- m");
    });

    test("phone width requires explicitly opening the drawer before connection assertions and shows metrics after connect", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "phone");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForOperatorWorkspace();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

        const connectBtn = page.locator(connectionSelectors.connectButton);
        const disconnectBtn = page.locator(connectionSelectors.disconnectButton);
        const transportSelect = page.locator(connectionSelectors.transportSelect);
        const tcpAddress = page.locator(connectionSelectors.tcpAddress);

        await expectShellChrome(page, "phone");
        await expect(page.locator(runtimeSelectors.vehiclePanelButton)).toBeVisible();
        await expect(page.locator(runtimeSelectors.vehiclePanelDrawer)).toHaveAttribute("data-state", "closed");
        await expectOperatorWorkspace(page);
        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("--");
        await expect(connectBtn).toHaveCount(0);

        await openVehiclePanelDrawer(page);
        await transportSelect.selectOption("tcp");
        await tcpAddress.fill("127.0.0.1:5760");
        await connectBtn.click();

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

        await mockPlatform.emitLiveTelemetryDomain(phoneBootstrapTelemetry);
        await mockPlatform.emitLiveSupportDomain(bootstrapSupport);

        await expect(disconnectBtn).toBeVisible();
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("42.0 m");

        await closeVehiclePanelDrawer(page);
        await expect(page.locator(runtimeSelectors.vehiclePanelDrawer)).toHaveAttribute("data-state", "closed");
        await expect(connectBtn).toHaveCount(0);
        await expectOperatorWorkspace(page);
    });

    test("unsupported viewport presets fail with an actionable message", async ({ page }) => {
        await expect(applyShellViewport(page, "tablet" as ShellViewportPresetName)).rejects.toThrow(
            "Unsupported shell viewport preset: tablet. Use one of: desktop, radiomaster, phone.",
        );
    });
});

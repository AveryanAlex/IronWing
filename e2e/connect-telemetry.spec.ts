import type { OpenSessionSnapshot } from "../src/session";
import {
    applyShellViewport,
    connectionSelectors,
    expect,
    expectDockedVehiclePanel,
    expectOperatorWorkspace,
    expectRuntimeDiagnostics,
    liveSurfaceValueLocator,
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

const partialBootstrapTelemetry: OpenSessionSnapshot["telemetry"] = {
    available: true,
    complete: false,
    provenance: "bootstrap",
    value: {
        flight: {
            altitude_m: 55,
        },
        gps: {},
    },
};

const streamTelemetry: OpenSessionSnapshot["telemetry"] = {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
        flight: {
            altitude_m: 12.4,
            speed_mps: 4.8,
        },
        navigation: {
            heading_deg: 182.1,
            latitude_deg: 42.3898,
            longitude_deg: -71.1476,
        },
        power: {
            battery_pct: 87.2,
        },
        gps: {
            fix_type: "fix_3d",
            satellites: 14,
        },
        radio: {
            rc_channels: [1500, 1500, 1100, 1500],
            rc_rssi: 92,
        },
    },
};

const bootstrapSupport: OpenSessionSnapshot["support"] = {
    available: true,
    complete: false,
    provenance: "bootstrap",
    value: null,
};

const streamSupport: OpenSessionSnapshot["support"] = {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
    },
};

test.describe("mocked connect and operator telemetry workspace", () => {
    test("desktop flow shows bootstrap metrics, stream metrics after connect, and fallback after disconnect", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForOperatorWorkspace();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

        const statusText = page.locator(connectionSelectors.statusText);
        const connectBtn = page.locator(connectionSelectors.connectButton);
        const cancelBtn = page.locator(connectionSelectors.cancelButton);
        const disconnectBtn = page.locator(connectionSelectors.disconnectButton);
        const transportSelect = page.locator(connectionSelectors.transportSelect);
        const tcpAddress = page.locator(connectionSelectors.tcpAddress);
        const bootstrapDiagnostics = page.locator(connectionSelectors.diagnosticsBootstrap);
        const lastPhaseDiagnostics = page.locator(connectionSelectors.diagnosticsLastPhase);
        const activeSourceDiagnostics = page.locator(connectionSelectors.diagnosticsActiveSource);
        const envelopeDiagnostics = page.locator(connectionSelectors.diagnosticsEnvelope);
        const errorMessage = page.locator(connectionSelectors.errorMessage);

        await expectRuntimeDiagnostics(page);
        await expectOperatorWorkspace(page);
        await expectDockedVehiclePanel(page, "desktop");
        await expect(connectBtn).toBeVisible({ timeout: 15_000 });
        await expect(statusText).toContainText("Idle");
        await expect(bootstrapDiagnostics).toContainText("ready");
        await expect(lastPhaseDiagnostics).toContainText("ready");
        await expect(activeSourceDiagnostics).toContainText("live");
        await expect(envelopeDiagnostics).toContainText(/session-/);
        await expect(errorMessage).toHaveCount(0);
        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("--");
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("-- m");

        await transportSelect.selectOption("tcp");
        await tcpAddress.fill("127.0.0.1:5760");
        await connectBtn.click();

        await expect(statusText).toContainText("Connecting", { timeout: 10_000 });
        await expect(cancelBtn).toBeVisible();
        await expect(tcpAddress).toBeDisabled();
        await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

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

        await mockPlatform.emitLiveTelemetryDomain(partialBootstrapTelemetry);
        await mockPlatform.emitLiveSupportDomain(bootstrapSupport);

        await expect(statusText).toContainText("Connected", { timeout: 10_000 });
        await expect(disconnectBtn).toBeVisible();
        await expect(cancelBtn).toHaveCount(0);
        await expect(lastPhaseDiagnostics).toContainText("ready");
        await expect(activeSourceDiagnostics).toContainText("live");
        await expect(envelopeDiagnostics).toContainText(/session-/);
        await expect(errorMessage).toHaveCount(0);
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("55.0 m");
        await expect(liveSurfaceValueLocator(page, "speedValue")).toContainText("-- m/s");

        await mockPlatform.emitLiveTelemetryDomain(streamTelemetry);
        await mockPlatform.emitLiveSupportDomain(streamSupport);

        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("DISARMED");
        await expect(liveSurfaceValueLocator(page, "modeValue")).toContainText("LOITER");
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("12.4 m");
        await expect(liveSurfaceValueLocator(page, "speedValue")).toContainText("4.8 m/s");
        await expect(liveSurfaceValueLocator(page, "batteryValue")).toContainText("87.2%");
        await expect(liveSurfaceValueLocator(page, "headingValue")).toContainText("182°");
        await expect(liveSurfaceValueLocator(page, "gpsText")).toHaveText("3D fix · 14 sats");

        await disconnectBtn.click();

        await expect(statusText).toContainText("Idle", { timeout: 10_000 });
        await expect(connectBtn).toBeVisible();
        await expect(tcpAddress).toBeEnabled();
        await expect(lastPhaseDiagnostics).toContainText("ready");
        await expect(activeSourceDiagnostics).toContainText("live");
        await expect(envelopeDiagnostics).toContainText(/session-/);
        await expect(errorMessage).toHaveCount(0);
        await expect(liveSurfaceValueLocator(page, "stateValue")).toContainText("--");
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("-- m");
        await expect(liveSurfaceValueLocator(page, "batteryValue")).toContainText("--%");
    });

    test("Radiomaster width keeps the docked panel truthful during connected-but-incomplete operator telemetry", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "radiomaster");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForOperatorWorkspace();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

        const connectBtn = page.locator(connectionSelectors.connectButton);
        const disconnectBtn = page.locator(connectionSelectors.disconnectButton);
        const transportSelect = page.locator(connectionSelectors.transportSelect);
        const tcpAddress = page.locator(connectionSelectors.tcpAddress);

        await expectDockedVehiclePanel(page, "radiomaster");

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

        await mockPlatform.emitLiveTelemetryDomain(partialBootstrapTelemetry);
        await mockPlatform.emitLiveSupportDomain(bootstrapSupport);

        await expect(disconnectBtn).toBeVisible();
        await expect(liveSurfaceValueLocator(page, "altitudeValue")).toContainText("55.0 m");
        await expect(liveSurfaceValueLocator(page, "speedValue")).toContainText("-- m/s");
    });
});

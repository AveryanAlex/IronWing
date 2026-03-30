import { test, expect } from "./fixtures/mock-platform";
import type { Page } from "@playwright/test";
import type {
    MockGuidedStateValue,
    MockLiveVehicleState,
    MockParamProgressState,
    MockParamStoreState,
} from "../src/platform/mock/backend";

const ROVER_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="Rover:FS_ACTION" humanName="Failsafe Action" documentation="Combined radio and GCS failsafe action">
      <values>
        <value code="0">Disabled</value>
        <value code="1">RTL</value>
        <value code="2">Hold</value>
        <value code="3">SmartRTL → RTL</value>
        <value code="4">SmartRTL → Hold</value>
      </values>
    </param>
    <param name="Rover:FS_TIMEOUT" humanName="Failsafe Timeout" documentation="Timeout before the rover triggers failsafe">
      <field name="Units">s</field>
      <field name="UnitText">seconds</field>
    </param>
    <param name="Rover:BATT_FS_LOW_ACT" humanName="Low Battery Action" documentation="Action on low battery">
      <values>
        <value code="0">Warn Only</value>
        <value code="1">Hold</value>
        <value code="2">RTL</value>
      </values>
    </param>
    <param name="Rover:BATT_FS_CRT_ACT" humanName="Critical Battery Action" documentation="Action on critical battery">
      <values>
        <value code="0">Warn Only</value>
        <value code="1">Hold</value>
      </values>
    </param>
    <param name="Rover:RTL_SPEED" humanName="RTL Speed" documentation="Ground speed during return">
      <field name="Units">m/s</field>
    </param>
    <param name="Rover:WP_RADIUS" humanName="Waypoint Radius" documentation="Completion radius around home">
      <field name="Units">m</field>
    </param>
    <param name="Rover:FENCE_ENABLE" humanName="Fence Enable" documentation="Enable geofence" />
    <param name="Rover:FENCE_TYPE" humanName="Fence Type" documentation="Boundary types">
      <bitmask>
        <bit code="1">Circle</bit>
        <bit code="2">Polygon</bit>
      </bitmask>
    </param>
    <param name="Rover:FENCE_RADIUS" humanName="Fence Radius" documentation="Fence circle radius">
      <field name="Units">m</field>
    </param>
    <param name="Rover:FENCE_MARGIN" humanName="Fence Margin" documentation="Fence warning margin">
      <field name="Units">m</field>
    </param>
    <param name="Rover:FENCE_ACTION" humanName="Fence Action" documentation="Action on fence breach">
      <values>
        <value code="0">Report Only</value>
        <value code="1">RTL</value>
      </values>
    </param>
  </parameters>
</paramfile>`;

const roverVehicleState: MockLiveVehicleState = {
    armed: false,
    custom_mode: 0,
    mode_name: "MANUAL",
    system_status: "STANDBY",
    // Use ground_rover here because the frontend metadata cache maps that vehicle
    // type to the Rover parameter XML slug.
    vehicle_type: "ground_rover",
    autopilot: "ardupilot",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
};

const blockedGuidedState: MockGuidedStateValue = {
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
};

function paramEntry(
    name: string,
    value: number,
    index: number,
    param_type: MockParamStoreState["params"][string]["param_type"] = "real32",
) {
    return { name, value, param_type, index };
}

function roverParamStore(): MockParamStoreState {
    return {
        expected_count: 11,
        params: {
            FS_ACTION: paramEntry("FS_ACTION", 1, 0, "uint8"),
            FS_TIMEOUT: paramEntry("FS_TIMEOUT", 5, 1),
            BATT_FS_LOW_ACT: paramEntry("BATT_FS_LOW_ACT", 2, 2, "uint8"),
            BATT_FS_CRT_ACT: paramEntry("BATT_FS_CRT_ACT", 1, 3, "uint8"),
            RTL_SPEED: paramEntry("RTL_SPEED", 250, 4),
            WP_RADIUS: paramEntry("WP_RADIUS", 2, 5),
            FENCE_ENABLE: paramEntry("FENCE_ENABLE", 1, 6, "uint8"),
            FENCE_TYPE: paramEntry("FENCE_TYPE", 6, 7, "uint8"),
            FENCE_RADIUS: paramEntry("FENCE_RADIUS", 300, 8),
            FENCE_MARGIN: paramEntry("FENCE_MARGIN", 2, 9),
            FENCE_ACTION: paramEntry("FENCE_ACTION", 1, 10, "uint8"),
        },
    };
}

type MockPlatformController = {
    reset: () => Promise<void>;
    setCommandBehavior: (cmd: string, behavior: { type: "defer" }) => Promise<void>;
    resolveDeferredConnectLink: (params: {
        vehicleState: MockLiveVehicleState;
        paramStore?: MockParamStoreState;
        paramProgress?: MockParamProgressState;
        guidedState: MockGuidedStateValue;
    }) => Promise<boolean>;
    emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
    emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
    getLiveEnvelope: () => Promise<{
        session_id: string;
        source_kind: "live" | "playback";
        seek_epoch: number;
        reset_revision: number;
    } | null>;
};

async function seedRoverMetadata(page: Page) {
    await page.addInitScript(({ xml, ts }) => {
        window.localStorage.setItem("param_meta_Rover", xml);
        window.localStorage.setItem("param_meta_Rover_ts", String(ts));
    }, {
        xml: ROVER_METADATA_XML,
        ts: Date.now(),
    });
}

async function connectRoverAndOpenSetup(
    page: Page,
    mockPlatform: MockPlatformController,
) {
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
        vehicleState: roverVehicleState,
        guidedState: blockedGuidedState,
    });

    await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
    await page.getByRole("button", { name: "Setup" }).click();
}

test("setup proves a rover configuration path stays inside the audited setup sections", async ({
    page,
    mockPlatform,
}) => {
    const metadataRequests: string[] = [];

    await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
        metadataRequests.push(route.request().url());
        await route.abort();
    });

    await seedRoverMetadata(page);
    await connectRoverAndOpenSetup(page, mockPlatform);

    await expect.poll(() => page.evaluate(() => ({
        cache: window.localStorage.getItem("param_meta_Rover"),
        ts: window.localStorage.getItem("param_meta_Rover_ts"),
    }))).toMatchObject({
        cache: ROVER_METADATA_XML,
        ts: expect.any(String),
    });

    const sectionNav = page.locator("main nav").last();
    const failsafeButton = sectionNav.getByRole("button", { name: /Failsafe/ });
    const rtlButton = sectionNav.getByRole("button", { name: /RTL \/ Return/ });
    const geofenceButton = sectionNav.getByRole("button", { name: /Geofence/ });
    const initialParamsButton = sectionNav.getByRole("button", { name: /Initial Parameters/ });

    await expect(failsafeButton).toBeDisabled();
    await expect(rtlButton).toBeDisabled();
    await expect(geofenceButton).toBeDisabled();
    await expect(initialParamsButton).toBeDisabled();
    await expect(page.getByText("Parameters are read from your flight controller")).toBeVisible();

    await mockPlatform.emitParamStore(roverParamStore());
    await mockPlatform.emitParamProgress("completed");

    await expect(failsafeButton).toBeEnabled();
    await expect(rtlButton).toBeEnabled();
    await expect(geofenceButton).toBeEnabled();
    await expect(initialParamsButton).toBeEnabled();
    await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
    await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);

    await failsafeButton.click();
    await expect(page.getByText("Radio / GCS Failsafe")).toBeVisible();
    await expect(page.locator('[data-setup-param="FS_ACTION"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="FS_TIMEOUT"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="FS_THR_ENABLE"]')).toHaveCount(0);
    await expect(page.locator('[data-setup-param="FS_GCS_ENABLE"]')).toHaveCount(0);
    await expect(page.locator('[data-setup-param="FS_EKF_ACTION"]')).toHaveCount(0);

    await rtlButton.click();
    await expect(page.getByText("Rover RTL Configuration")).toBeVisible();
    await expect(page.locator('[data-setup-param="RTL_SPEED"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="WP_RADIUS"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="RTL_ALT"]')).toHaveCount(0);
    await expect(page.locator('[data-setup-param="RTL_ALT_FINAL"]')).toHaveCount(0);
    await expect(page.locator('[data-setup-param="RTL_CLIMB_MIN"]')).toHaveCount(0);

    await geofenceButton.click();
    await expect(page.getByRole("heading", { name: "Fence Parameters" })).toBeVisible();
    await expect(page.locator('[data-setup-param="FENCE_RADIUS"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="FENCE_MARGIN"]')).toBeVisible();
    await expect(page.locator('[data-setup-param="FENCE_ALT_MIN"]')).toHaveCount(0);
    await expect(page.locator('[data-setup-param="FENCE_ALT_MAX"]')).toHaveCount(0);

    await initialParamsButton.click();
    await expect(
        page.getByText(/Rover parameters are configured through their respective setup sections/i),
    ).toBeVisible();
    await expect(page.getByText(/Full Parameters tab for manual configuration/i)).toHaveCount(0);
    await expect(page.getByText("Vehicle Inputs")).toHaveCount(0);
    await expect(page.getByText(/Stage All Recommended/i)).toHaveCount(0);
    await expect(page.getByText(/Reference: 9" prop \+ 4S LiPo/i)).toHaveCount(0);

    expect(metadataRequests).toEqual([]);
});

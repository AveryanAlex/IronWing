import type { Page } from "@playwright/test";

import {
    applyShellViewport,
    closeVehiclePanelDrawer,
    connectionSelectors,
    expect,
    expectMissionLayoutState,
    expectMissionSupportPanels,
    expectRuntimeDiagnostics,
    missionSupportPanelSelectors,
    missionTerrainWarningActionLocator,
    missionWorkspaceLocator,
    mockTerrainNoData,
    openMissionWorkspace,
    openVehiclePanelDrawer,
    selectMissionPhoneSegment,
    test,
    type ShellViewportPresetName,
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

const blockedGuidedState = {
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
} as const;

const responsiveScenarios = [
    {
        preset: "desktop",
        layout: {
            mode: "wide",
            tier: "wide",
            detailColumns: "split",
            supportPlacement: "sidebar",
            showPhoneSegments: false,
            phoneSegmentState: "all-visible",
            mapVisible: true,
            planVisible: true,
        },
    },
    {
        preset: "radiomaster",
        layout: {
            mode: "compact-wide",
            tier: "wide",
            detailColumns: "stacked",
            supportPlacement: "below",
            showPhoneSegments: false,
            phoneSegmentState: "all-visible",
            mapVisible: true,
            planVisible: true,
        },
    },
    {
        preset: "phone",
        layout: {
            mode: "phone-segmented",
            tier: "phone",
            detailColumns: "stacked",
            supportPlacement: "below",
            showPhoneSegments: true,
            phoneSegmentState: "plan",
            mapVisible: false,
            planVisible: true,
        },
    },
] as const satisfies ReadonlyArray<{
    preset: ShellViewportPresetName;
    layout: {
        mode: "wide" | "compact-wide" | "desktop" | "phone-segmented" | "phone-stack";
        tier: "wide" | "desktop" | "tablet" | "phone";
        detailColumns: "split" | "stacked";
        supportPlacement: "sidebar" | "below";
        showPhoneSegments: boolean;
        phoneSegmentState: "map" | "plan" | "all-visible";
        mapVisible: boolean;
        planVisible: boolean;
    };
}>;

async function connectAndOpenMissionWorkspace(
    page: Page,
    mockPlatform: {
        reset: () => Promise<void>;
        waitForOperatorWorkspace: () => Promise<void>;
        setCommandBehavior: (cmd: string, behavior: any) => Promise<void>;
        resolveDeferredConnectLink: (params: {
            vehicleState: typeof connectedVehicleState;
            missionState: {
                plan: null;
                current_index: null;
                sync: "current";
                active_op: null;
            };
            guidedState: typeof blockedGuidedState;
        }) => Promise<boolean>;
    },
    preset: ShellViewportPresetName,
) {
    await mockTerrainNoData(page);
    await applyShellViewport(page, preset);
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.waitForOperatorWorkspace();
    await expectRuntimeDiagnostics(page);

    if (preset === "phone") {
        await openVehiclePanelDrawer(page);
    }

    await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
    await page.locator(connectionSelectors.transportSelect).selectOption("tcp");
    await page.locator(connectionSelectors.tcpAddress).fill("127.0.0.1:5760");
    await page.locator(connectionSelectors.connectButton).click();
    await mockPlatform.resolveDeferredConnectLink({
        vehicleState: connectedVehicleState,
        missionState: {
            plan: null,
            current_index: null,
            sync: "current",
            active_op: null,
        },
        guidedState: blockedGuidedState,
    });
    await expect(page.locator(connectionSelectors.statusText)).toContainText("Connected");

    if (preset === "phone") {
        await closeVehiclePanelDrawer(page);
    }

    await openMissionWorkspace(page);
}

async function addWaypoint(
    page: Page,
    point: { latitude: string; longitude: string; altitude: string },
) {
    await missionWorkspaceLocator(page, "listAdd").click();
    await missionWorkspaceLocator(page, "inspectorLatitude").fill(point.latitude);
    await missionWorkspaceLocator(page, "inspectorLongitude").click();
    await missionWorkspaceLocator(page, "inspectorLongitude").fill(point.longitude);
    await missionWorkspaceLocator(page, "inspectorAltitude").click();
    await missionWorkspaceLocator(page, "inspectorAltitude").fill(point.altitude);
    await missionWorkspaceLocator(page, "inspectorAltitude").press("Tab");
}

async function seedMissionSupportState(page: Page) {
    await missionWorkspaceLocator(page, "entryNew").click();
    await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();

    await missionWorkspaceLocator(page, "homeLatitude").fill("47.397742");
    await missionWorkspaceLocator(page, "homeLongitude").fill("8.545594");
    await missionWorkspaceLocator(page, "homeAltitude").fill("488");
    await missionWorkspaceLocator(page, "homeAltitude").press("Tab");
    await expect(missionWorkspaceLocator(page, "homeSummary")).toContainText("47.39774");

    await addWaypoint(page, {
        latitude: "47.5301",
        longitude: "8.6301",
        altitude: "120",
    });
    await addWaypoint(page, {
        latitude: "47.5312",
        longitude: "8.6312",
        altitude: "135",
    });

    await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("2 / 0");
    await expect(page.locator(missionSupportPanelSelectors.planningStatsMissionState)).toContainText("Finite estimate");
    await expect(page.locator(missionSupportPanelSelectors.planningStatsMissionDistance)).not.toContainText("—");

    const cruiseInput = page.locator(missionSupportPanelSelectors.planningStatsCruiseInput);
    await expect(cruiseInput).toBeVisible();
    await cruiseInput.fill("18.5");
    await cruiseInput.press("Tab");
    await expect(cruiseInput).toHaveValue("18.5");

    await expect
        .poll(async () => (await page.locator(missionSupportPanelSelectors.terrainStatus).textContent())?.trim() ?? "", {
            message: "Terrain panel never reached the deterministic no-data state for the mocked browser proof.",
        })
        .toBe("No data");
    await expect(page.locator(missionSupportPanelSelectors.terrainWarningCount)).toContainText("2 warnings");
}

async function expectSelectedWaypoint(
    page: Page,
    point: { latitude: number; longitude: number; altitude: number },
) {
    await expect(missionWorkspaceLocator(page, "inspectorSelectionKind")).toContainText("mission-item");
    await expect
        .poll(async () => Number.parseFloat(await missionWorkspaceLocator(page, "inspectorLatitude").inputValue()), {
            message: "Terrain warning action did not select the expected mission item latitude.",
        })
        .toBeCloseTo(point.latitude, 5);
    await expect
        .poll(async () => Number.parseFloat(await missionWorkspaceLocator(page, "inspectorLongitude").inputValue()), {
            message: "Terrain warning action did not select the expected mission item longitude.",
        })
        .toBeCloseTo(point.longitude, 5);
    await expect
        .poll(async () => Number.parseFloat(await missionWorkspaceLocator(page, "inspectorAltitude").inputValue()), {
            message: "Terrain warning action did not select the expected mission item altitude.",
        })
        .toBeCloseTo(point.altitude, 2);
}

test.describe("mocked mission responsive support panels", () => {
    for (const scenario of responsiveScenarios) {
        test(`proves responsive layout truth and reachable support panels on the ${scenario.preset} shell`, async ({
            page,
            mockPlatform,
        }) => {
            await connectAndOpenMissionWorkspace(page, mockPlatform, scenario.preset);

            await seedMissionSupportState(page);
            await expectMissionLayoutState(page, scenario.layout);
            await expectMissionSupportPanels(page, {
                planningStatsVisible: scenario.preset !== "phone" || scenario.layout.phoneSegmentState === "plan",
                terrainVisible: scenario.preset !== "phone" || scenario.layout.phoneSegmentState === "plan",
            });

            if (scenario.preset === "phone") {
                await selectMissionPhoneSegment(page, "map");
                await expectMissionLayoutState(page, {
                    mode: "phone-segmented",
                    tier: "phone",
                    detailColumns: "stacked",
                    supportPlacement: "below",
                    showPhoneSegments: true,
                    phoneSegmentState: "map",
                    mapVisible: true,
                    planVisible: false,
                });
                await expectMissionSupportPanels(page, {
                    planningStatsVisible: false,
                    terrainVisible: false,
                });
                await expect(
                    missionTerrainWarningActionLocator(page, 1),
                    "Terrain warning actions should stay mounted but hidden while the phone shell is on the map segment.",
                ).toBeHidden();

                await selectMissionPhoneSegment(page, "plan");
                await expectMissionLayoutState(page, scenario.layout);
                await expectMissionSupportPanels(page, {
                    planningStatsVisible: true,
                    terrainVisible: true,
                });
                await expect(page.locator(missionSupportPanelSelectors.planningStatsCruiseInput)).toHaveValue("18.5");
            }

            await missionTerrainWarningActionLocator(page, 1).click();
            await expectSelectedWaypoint(page, {
                latitude: 47.5312,
                longitude: 8.6312,
                altitude: 135,
            });
        });
    }
});

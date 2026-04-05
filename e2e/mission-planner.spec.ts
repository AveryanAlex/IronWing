import { readFileSync } from "node:fs";

import {
    applyShellViewport,
    connectionSelectors,
    expect,
    expectMissionWorkspace,
    expectRuntimeDiagnostics,
    missionWorkspaceLocator,
    missionWorkspaceSelectors,
    openMissionWorkspace,
    readMissionMapDebugSnapshot,
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

const surveyPlanContents = readFileSync("tests/contracts/survey-complex.plan.json", "utf8");

test.describe("mocked mission planner workflow", () => {
    test("proves read/import/new/edit/map/validate/upload/cancel/clear/export flows on the active Svelte shell", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.clearSavedFiles();
        await mockPlatform.waitForOperatorWorkspace();
        await expectRuntimeDiagnostics(page);

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

        await openMissionWorkspace(page);
        await expectMissionWorkspace(page);
        await expect(missionWorkspaceLocator(page, "empty")).toBeVisible();

        await mockPlatform.cancelOpenFile();
        await missionWorkspaceLocator(page, "entryImport").click();
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Import cancelled");
        await expect(missionWorkspaceLocator(page, "empty")).toBeVisible();

        await missionWorkspaceLocator(page, "entryRead").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Reading mission");
        await expect(missionWorkspaceLocator(page, "inlineStatusDetail")).toContainText("download mission");
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("2");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expect(missionWorkspaceLocator(page, "homeSummary")).toContainText("47.39774");
        await expect(missionWorkspaceLocator(page, "mapMarkerCount")).toContainText("3");

        await mockPlatform.cancelSaveFile();
        await missionWorkspaceLocator(page, "toolbarExport").click();
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Export cancelled");
        await expect.poll(() => mockPlatform.getSavedFiles()).toEqual([]);

        await mockPlatform.setSaveFileName("vehicle-read.plan");
        await missionWorkspaceLocator(page, "toolbarExport").click();
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Saved vehicle-read.plan");
        await expect(missionWorkspaceLocator(page, "warningFile")).toContainText("omitted");
        await expect(missionWorkspaceLocator(page, "countsWarnings")).not.toContainText("0");

        const savedFiles = await mockPlatform.getSavedFiles();
        expect(savedFiles).toHaveLength(1);
        expect(savedFiles[0]?.name).toBe("vehicle-read.plan");
        expect(savedFiles[0]?.contents).toContain('"fileType": "Plan"');

        await missionWorkspaceLocator(page, "toolbarNew").click();
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Blank mission draft ready");
        await missionWorkspaceLocator(page, "listAdd").click();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");
        await mockPlatform.setOpenFile(surveyPlanContents, "survey-complex.plan");
        await missionWorkspaceLocator(page, "toolbarImport").click();
        await expect(missionWorkspaceLocator(page, "promptKind")).toContainText("import-replace");
        await missionWorkspaceLocator(page, "promptDismiss").click();
        await expect(missionWorkspaceLocator(page, "prompt")).toHaveCount(0);
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");

        await mockPlatform.setOpenFile(surveyPlanContents, "survey-complex.plan");
        await missionWorkspaceLocator(page, "toolbarImport").click();
        await expect(missionWorkspaceLocator(page, "prompt")).toBeVisible();
        await missionWorkspaceLocator(page, "promptConfirm").click();
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("2");
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Imported survey-complex.plan");
        await expect(missionWorkspaceLocator(page, "warningFile")).toContainText("Mission ComplexItem 2 (survey)");

        const firstSurveyBlock = page.locator('[data-testid^="mission-survey-block-"]').first();
        await expect(firstSurveyBlock).toBeVisible();
        await firstSurveyBlock.click();
        await expect(missionWorkspaceLocator(page, "inspectorSelectionKind")).toContainText("survey-block");
        await expect(missionWorkspaceLocator(page, "inspectorReadonly")).toContainText("Imported survey block selected");

        await missionWorkspaceLocator(page, "toolbarNew").click();
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expect(missionWorkspaceLocator(page, "warningFile")).toHaveCount(0);

        await missionWorkspaceLocator(page, "listAdd").click();

        await missionWorkspaceLocator(page, "inspectorLatitude").fill("47.53");
        await missionWorkspaceLocator(page, "inspectorLongitude").click();
        await missionWorkspaceLocator(page, "inspectorLongitude").fill("8.63");
        await missionWorkspaceLocator(page, "inspectorAltitude").click();
        await missionWorkspaceLocator(page, "inspectorAltitude").fill("120");
        await missionWorkspaceLocator(page, "inspectorAltitude").press("Tab");

        await mockPlatform.setCommandBehavior("mission_validate", {
            type: "resolve",
            delayMs: 120,
            result: [
                {
                    code: "MISSION_WARNING",
                    message: "Survey hand-off warning from mocked validation.",
                    severity: "warning",
                },
                {
                    code: "WAYPOINT_ALT_LOW",
                    message: "Waypoint altitude is below the preferred mock threshold.",
                    severity: "error",
                    seq: 0,
                },
            ],
        });
        await missionWorkspaceLocator(page, "toolbarValidate").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Validating mission");
        await expect(missionWorkspaceLocator(page, "warningValidation")).toContainText("WAYPOINT_ALT_LOW");
        await expect(missionWorkspaceLocator(page, "warningValidation")).toContainText("MISSION_WARNING");
        await mockPlatform.clearCommandBehavior("mission_validate");

        const missionMarker = page.locator(
            `${missionWorkspaceSelectors.missionMarker}:not([data-testid="mission-map-marker-home"])`,
        ).first();
        await expect(missionMarker).toBeVisible();
        await missionMarker.click();
        await expect(missionWorkspaceLocator(page, "mapSelection")).toContainText("mission item");

        const mapDebug = await readMissionMapDebugSnapshot(page) as {
            selection?: { kind?: string };
            counts?: { markers?: number };
            updateCount?: number;
        } | null;
        expect(mapDebug?.selection?.kind).toBe("mission-item");
        expect(mapDebug?.counts?.markers).toBe(1);
        expect(mapDebug?.updateCount ?? 0).toBeGreaterThan(0);

        await missionWorkspaceLocator(page, "toolbarUpload").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Uploading mission");
        await expect(missionWorkspaceLocator(page, "toolbarCancel")).toBeVisible();
        await missionWorkspaceLocator(page, "toolbarCancel").click();
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Cancelled the pending mission transfer");
        await expect(missionWorkspaceLocator(page, "toolbarCancel")).toHaveCount(0);

        await expect.poll(async () => {
            return (await mockPlatform.getInvocations()).map((entry) => entry.cmd);
        }).toContain("mission_cancel");

        await missionWorkspaceLocator(page, "toolbarUpload").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Uploading mission");
        await expect.poll(async () => {
            const commands = (await mockPlatform.getInvocations()).map((entry) => entry.cmd);
            return {
                missionUploads: commands.filter((cmd) => cmd === "mission_upload").length,
                fenceUploads: commands.filter((cmd) => cmd === "fence_upload").length,
                rallyUploads: commands.filter((cmd) => cmd === "rally_upload").length,
            };
        }).toEqual({ missionUploads: 2, fenceUploads: 1, rallyUploads: 1 });
        await expect(missionWorkspaceLocator(page, "inlineStatus")).toHaveCount(0);

        await missionWorkspaceLocator(page, "toolbarClear").click();
        await expect(missionWorkspaceLocator(page, "promptKind")).toContainText("clear-replace");
        await missionWorkspaceLocator(page, "promptConfirm").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Clearing the vehicle mission");
        await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Vehicle mission cleared");
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("0");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expect(missionWorkspaceLocator(page, "mapStatus")).toContainText("empty");
        await expect(page.locator(missionWorkspaceSelectors.mapSurface)).toHaveCount(0);

        await expect.poll(async () => {
            const commands = (await mockPlatform.getInvocations()).map((entry) => entry.cmd);
            return {
                missionClears: commands.filter((cmd) => cmd === "mission_clear").length,
                fenceClears: commands.filter((cmd) => cmd === "fence_clear").length,
                rallyClears: commands.filter((cmd) => cmd === "rally_clear").length,
            };
        }).toEqual({ missionClears: 1, fenceClears: 1, rallyClears: 1 });
    });
});

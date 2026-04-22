import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

import {
    applyShellViewport,
    connectionSelectors,
    expect,
    expectMissionHistoryState,
    expectMissionWorkspace,
    expectRuntimeDiagnostics,
    missionHistoryButtonLocator,
    missionWorkspaceLocator,
    missionWorkspaceSelectors,
    openMissionWorkspace,
    readMissionHistoryState,
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
const undoShortcut = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
const redoShortcut = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z";

async function confirmExportReviewIfVisible(page: Page) {
    const exportReview = missionWorkspaceLocator(page, "exportReview");
    await exportReview.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);

    if (await exportReview.isVisible().catch(() => false)) {
        await missionWorkspaceLocator(page, "exportReviewConfirm").click();
    }
}

async function pressMissionHistoryShortcut(page: Page, kind: "undo" | "redo") {
    await page.keyboard.press(kind === "undo" ? undoShortcut : redoShortcut);
}

test.describe("mocked mission planner workflow", () => {
    test("proves read/import/new/edit/map/upload/cancel/export flows on the active Svelte shell", async ({
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
        await expectMissionHistoryState(
            page,
            {
                undo: { count: 0, disabled: true },
                redo: { count: 0, disabled: true },
            },
            "A fresh empty Mission workspace should expose disabled history controls with explicit zero-count labels.",
        );

        await mockPlatform.cancelOpenFile();
        await missionWorkspaceLocator(page, "entryImport").click();
        await expect(missionWorkspaceLocator(page, "empty")).toBeVisible();
        await expectMissionHistoryState(
            page,
            {
                undo: { count: 0, disabled: true },
                redo: { count: 0, disabled: true },
            },
            "Cancelling import should leave history unchanged instead of inventing a recoverable step.",
        );

        await missionWorkspaceLocator(page, "entryRead").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Reading planning state");
        await expect(missionWorkspaceLocator(page, "inlineStatusDetail")).toContainText("download mission");
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("2");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expect(missionWorkspaceLocator(page, "homeSummary")).toContainText("47.39774");
        await expect(missionWorkspaceLocator(page, "mapMarkerCount")).toContainText("3");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: 1, disabled: false },
                redo: { count: 0, disabled: true },
            },
            "Reading from the vehicle should register as a single undoable workspace replacement on the mounted Mission header.",
        );

        await missionHistoryButtonLocator(page, "undo").click();
        await expect(missionWorkspaceLocator(page, "empty")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("0 / 0");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: 0, disabled: true },
                redo: { count: 1, disabled: false },
            },
            "Undoing the vehicle read should restore the empty workspace in one step and expose one redo action.",
        );

        await missionHistoryButtonLocator(page, "redo").click();
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("2");
        await expect(missionWorkspaceLocator(page, "homeSummary")).toContainText("47.39774");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: 1, disabled: false },
                redo: { count: 0, disabled: true },
            },
            "Redoing the vehicle read should restore the mounted planner content without adding extra recovery steps.",
        );

        await mockPlatform.cancelSaveFile();
        await missionWorkspaceLocator(page, "toolbarExport").click();
        await confirmExportReviewIfVisible(page);
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("2");
        await expect.poll(() => mockPlatform.getSavedFiles()).toEqual([]);

        await mockPlatform.setSaveFileName("vehicle-read.plan");
        await missionWorkspaceLocator(page, "toolbarExport").click();
        await confirmExportReviewIfVisible(page);
        await expect(missionWorkspaceLocator(page, "warningFile")).toContainText("omitted");
        await expect(missionWorkspaceLocator(page, "countsWarnings")).not.toContainText("0");

        const savedFiles = await mockPlatform.getSavedFiles();
        expect(savedFiles).toHaveLength(1);
        expect(savedFiles[0]?.name).toBe("vehicle-read.plan");
        expect(savedFiles[0]?.contents).toContain('"fileType": "Plan"');

        await missionWorkspaceLocator(page, "toolbarNew").click();
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("0 / 0");
        await missionWorkspaceLocator(page, "listAdd").click();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");

        const historyBeforeImport = await readMissionHistoryState(page);
        await mockPlatform.setOpenFile(surveyPlanContents, "survey-complex.plan");
        await missionWorkspaceLocator(page, "toolbarImport").click();
        await expect(missionWorkspaceLocator(page, "importReviewTitle")).toContainText("survey-complex.plan");
        await missionWorkspaceLocator(page, "importReviewDismiss").click();
        await expect(missionWorkspaceLocator(page, "importReview")).toHaveCount(0);
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: historyBeforeImport.undo.count, disabled: historyBeforeImport.undo.disabled },
                redo: { count: historyBeforeImport.redo.count, disabled: historyBeforeImport.redo.disabled },
            },
            "Dismissing the import review should keep the draft and history stack untouched.",
        );

        await mockPlatform.setOpenFile(surveyPlanContents, "survey-complex.plan");
        await missionWorkspaceLocator(page, "toolbarImport").click();
        await expect(missionWorkspaceLocator(page, "importReview")).toBeVisible();
        await missionWorkspaceLocator(page, "importReviewConfirm").click();
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("2");
        expect(await page.locator(missionWorkspaceSelectors.warningFile).filter({ hasText: "survey" }).count()).toBeGreaterThan(0);

        const historyAfterImport = await readMissionHistoryState(page);
        expect(historyAfterImport.undo.count).toBe(historyBeforeImport.undo.count + 1);
        expect(historyAfterImport.undo.disabled).toBe(false);
        expect(historyAfterImport.redo.count).toBe(0);
        expect(historyAfterImport.redo.disabled).toBe(true);

        await missionHistoryButtonLocator(page, "undo").click();
        await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1 / 0");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expect(page.locator('[data-testid^="mission-survey-block-"]')).toHaveCount(0);
        await expectMissionHistoryState(
            page,
            {
                undo: { count: historyBeforeImport.undo.count, disabled: historyBeforeImport.undo.disabled },
                redo: { count: 1, disabled: false },
            },
            "Undoing the import review should restore the pre-import draft in one step.",
        );

        await missionHistoryButtonLocator(page, "redo").click();
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("2");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: historyAfterImport.undo.count, disabled: false },
                redo: { count: 0, disabled: true },
            },
            "Redoing the import review should recover the imported survey workspace in one step.",
        );

        const firstSurveyBlock = page.locator('[data-testid^="mission-survey-block-"]').first();
        await expect(firstSurveyBlock).toBeVisible();
        await firstSurveyBlock.click();
        await expect(missionWorkspaceLocator(page, "inspectorSelectionKind")).toContainText("survey-block");
        await expect(missionWorkspaceLocator(page, "inspectorSurvey")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "surveyGenerate")).toBeVisible();
        await expect(missionWorkspaceLocator(page, "cameraCurrent")).not.toContainText("Choose a camera");

        const historyBeforeNewDraft = await readMissionHistoryState(page);
        await missionWorkspaceLocator(page, "toolbarNew").click();
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        expect(await page.locator(missionWorkspaceSelectors.warningFile).count()).toBeGreaterThan(0);

        const historyAfterNewDraft = await readMissionHistoryState(page);
        expect(historyAfterNewDraft.undo.count).toBe(historyBeforeNewDraft.undo.count + 1);
        expect(historyAfterNewDraft.undo.disabled).toBe(false);
        expect(historyAfterNewDraft.redo.count).toBe(0);
        expect(historyAfterNewDraft.redo.disabled).toBe(true);

        await pressMissionHistoryShortcut(page, "undo");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("2");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: historyBeforeNewDraft.undo.count, disabled: historyBeforeNewDraft.undo.disabled },
                redo: { count: 1, disabled: false },
            },
            "The workspace keyboard undo path should restore the imported survey workspace after a new-draft replacement.",
        );

        await pressMissionHistoryShortcut(page, "redo");
        await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("0");
        await expectMissionHistoryState(
            page,
            {
                undo: { count: historyAfterNewDraft.undo.count, disabled: false },
                redo: { count: 0, disabled: true },
            },
            "The workspace keyboard redo path should reapply the blank replacement without inventing extra history.",
        );

        await missionWorkspaceLocator(page, "listAdd").click();

        await missionWorkspaceLocator(page, "inspectorLatitude").fill("47.53");
        await missionWorkspaceLocator(page, "inspectorLongitude").click();
        await missionWorkspaceLocator(page, "inspectorLongitude").fill("8.63");
        await missionWorkspaceLocator(page, "inspectorAltitude").click();
        await missionWorkspaceLocator(page, "inspectorAltitude").fill("120");
        await missionWorkspaceLocator(page, "inspectorAltitude").press("Tab");

        await expect(missionWorkspaceLocator(page, "header").getByRole("button", { name: /validate mission/i })).toHaveCount(0);

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
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Uploading planning state");
        await expect(missionWorkspaceLocator(page, "toolbarCancel")).toBeVisible();
        await missionWorkspaceLocator(page, "toolbarCancel").click();
        await expect(missionWorkspaceLocator(page, "toolbarCancel")).toHaveCount(0);

        await expect.poll(async () => {
            return (await mockPlatform.getInvocations()).map((entry) => entry.cmd);
        }).toContain("mission_cancel");

        await missionWorkspaceLocator(page, "toolbarUpload").click();
        await expect(missionWorkspaceLocator(page, "inlineStatusMessage")).toContainText("Uploading planning state");
        await expect.poll(async () => {
            const commands = (await mockPlatform.getInvocations()).map((entry) => entry.cmd);
            return {
                missionUploads: commands.filter((cmd) => cmd === "mission_upload").length,
                fenceUploads: commands.filter((cmd) => cmd === "fence_upload").length,
                rallyUploads: commands.filter((cmd) => cmd === "rally_upload").length,
            };
        }).toEqual({ missionUploads: 2, fenceUploads: 1, rallyUploads: 1 });
        await expect(missionWorkspaceLocator(page, "inlineStatus")).toHaveCount(0);
        await expect(missionWorkspaceLocator(page, "toolbarRead")).toHaveAttribute("aria-label", "Read from vehicle");
        await expect(missionWorkspaceLocator(page, "toolbarRead")).toHaveAttribute("title", "Read from vehicle");
        await expect(missionWorkspaceLocator(page, "toolbarUpload")).toHaveAttribute("aria-label", "Write to vehicle");
        await expect(missionWorkspaceLocator(page, "toolbarUpload")).toHaveAttribute("title", "Write to vehicle");
        await expect(missionWorkspaceLocator(page, "header").getByRole("button", { name: /^clear$/i })).toHaveCount(0);
    });
});

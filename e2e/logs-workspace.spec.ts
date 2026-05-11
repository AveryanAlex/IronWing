import type { Locator, Page } from "@playwright/test";

import {
    applyShellViewport,
    connectionSelectors,
    expect,
    expectLogsWorkspace,
    expectMissionWorkspace,
    openLogsWorkspace,
    openMissionWorkspace,
    logsWorkspaceSelectors,
    missionWorkspaceLocator,
    missionWorkspaceSelectors,
    test,
} from "./fixtures/mock-platform";
import { appShellTestIds } from "../src/app/shell/chrome-state";

const seededReadyEntryId = "log-2026-05-08-001";
const seededMissingEntryId = "log-2026-05-08-003";
const seededCorruptEntryId = "log-2026-05-08-006";
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
} as const;

function logEntryLocator(page: Page, entryId: string) {
    return page.locator(`[data-testid="logs-entry-${entryId}"]`);
}

async function dragChartRange(plot: Locator) {
    const box = await plot.boundingBox();
    if (!box) {
        throw new Error("Unable to drag chart range; the chart plot was not laid out.");
    }

    const page = plot.page();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
}

async function readPanelLayout(panel: Locator) {
    return panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return {
            top: rect.top,
            bottom: rect.bottom,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
        };
    });
}

async function expectPanelStack(panels: Array<{ name: string; locator: Locator }>, context: string) {
    const layouts = await Promise.all(panels.map(async (panel) => ({
        name: panel.name,
        ...(await readPanelLayout(panel.locator)),
    })));

    for (const layout of layouts) {
        expect(
            layout.scrollHeight,
            `${layout.name} panel content should fit its own card in the ${context} column instead of spilling into the next Logs panel.`,
        ).toBeLessThanOrEqual(layout.clientHeight + 1);
    }

    for (let index = 0; index < layouts.length - 1; index += 1) {
        const current = layouts[index];
        const next = layouts[index + 1];
        expect(
            current.bottom,
            `${current.name} panel should end before the ${next.name} panel starts in the ${context} column.`,
        ).toBeLessThanOrEqual(next.top + 1);
    }
}

async function expectLogsAnalysisLayout(page: Page) {
    await expectPanelStack([
        { name: "library", locator: page.locator(logsWorkspaceSelectors.libraryPanel) },
        { name: "details", locator: page.locator(logsWorkspaceSelectors.detailsPanel) },
    ], "library/detail");

    await expectPanelStack([
        { name: "recording", locator: page.locator(logsWorkspaceSelectors.recordingPanel) },
        { name: "replay", locator: page.locator(logsWorkspaceSelectors.replayPanel) },
        { name: "raw browser", locator: page.locator(logsWorkspaceSelectors.rawPanel) },
        { name: "charts", locator: page.locator(logsWorkspaceSelectors.chartsPanel) },
    ], "analysis");

    await expect(
        page.locator(logsWorkspaceSelectors.rawPanel),
        "Forensic browser should use the same card chrome as the other Logs panels instead of floating on the page.",
    ).toHaveCSS("border-top-style", "solid");

    await page.locator(logsWorkspaceSelectors.root).evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });

    const bottomGap = await page.locator(logsWorkspaceSelectors.root).evaluate((root, chartsSelector) => {
        const charts = document.querySelector(chartsSelector);
        if (!charts) {
            throw new Error("Logs charts panel was not mounted.");
        }

        return root.getBoundingClientRect().bottom - charts.getBoundingClientRect().bottom;
    }, logsWorkspaceSelectors.chartsPanel);

    expect(bottomGap, "The final Logs card should retain visible bottom padding when scrolled to the end.").toBeGreaterThanOrEqual(20);
}

test.describe("mocked logs workspace workflow", () => {
    test.beforeEach(async ({ page, mockPlatform }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.seedLogLibrary(["ready_tlog", "missing_tlog", "corrupt_bin"]);
        await mockPlatform.waitForOperatorWorkspace();

        await openLogsWorkspace(page);
        await expectLogsWorkspace(page);
        await expect(page.getByRole("button", { name: "Logs" })).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(logsWorkspaceSelectors.libraryEmpty)).toHaveCount(0);
        await expect(page.locator('[data-testid^="logs-entry-"]')).toHaveCount(3);
    });

    test("imports entries and surfaces truthful missing/corrupt diagnostics", async ({ page, mockPlatform }) => {
        await page.locator(logsWorkspaceSelectors.importPathInput).fill("/mock/logs/imported-flight.tlog");
        await page.locator(logsWorkspaceSelectors.importButton).click();
        await expect(page.locator('[data-testid^="logs-entry-"]')).toHaveCount(4);
        await expect(page.locator(logsWorkspaceSelectors.libraryList)).toContainText("imported-flight.tlog");

        await mockPlatform.setOpenLogFilePreset("corrupt_tlog");
        await page.locator(logsWorkspaceSelectors.importPickerButton).click();
        await expect.poll(() => mockPlatform.getOpenFileState()).toMatchObject({
            name: "corrupt-flight.tlog",
            openCount: 1,
        });
        await expect(page.locator('[data-testid^="logs-entry-"]')).toHaveCount(5);
        await expect(page.locator(logsWorkspaceSelectors.libraryList)).toContainText("corrupt-flight.tlog");

        await logEntryLocator(page, seededMissingEntryId).click();
        await expect(page.locator(logsWorkspaceSelectors.selectedStatusPill)).toContainText("missing");
        await expect(page.locator(logsWorkspaceSelectors.selectedMessage)).toContainText("missing");
        await expect(page.locator(logsWorkspaceSelectors.detailsPanel)).toContainText("path_missing");

        await logEntryLocator(page, seededCorruptEntryId).click();
        await expect(page.locator(logsWorkspaceSelectors.selectedStatusPill)).toContainText("corrupt");
        await expect(page.locator(logsWorkspaceSelectors.selectedMessage)).toContainText("corrupt");
        await expect(page.locator(logsWorkspaceSelectors.detailsPanel)).toContainText("unexpected_eof");
    });

    test("drives replay, map handoff, chart export, raw-browser export, and live restore flows", async ({ page, mockPlatform }) => {

        await page.getByRole("button", { name: "Overview" }).click();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
        await page.locator(connectionSelectors.connectButton).click();
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
        await expect(page.locator(connectionSelectors.disconnectButton)).toBeVisible();

        await openMissionWorkspace(page);
        await page.locator(missionWorkspaceSelectors.entryNew).click();
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();

        await openLogsWorkspace(page);
        await logEntryLocator(page, seededReadyEntryId).click();
        await expect(page.locator(logsWorkspaceSelectors.selectedStatusPill)).toContainText("ready");
        await expect(page.locator(logsWorkspaceSelectors.selectedMessage)).toHaveCount(0);
        await expect(page.locator(logsWorkspaceSelectors.mapMarkerButton)).toBeDisabled();

        await page.locator(logsWorkspaceSelectors.preparePlayback).click();
        await expect(page.locator(logsWorkspaceSelectors.playbackStatusPill)).toContainText("ready");
        await page.locator(logsWorkspaceSelectors.playButton).click();
        await expect(page.locator(logsWorkspaceSelectors.playbackStatusPill)).toContainText("playing");
        await expect(page.locator('[data-testid="logs-playback-label"]')).toContainText("Replaying telemetry");
        await expect(page.getByTestId(appShellTestIds.replayReadonlyBanner)).toBeVisible();

        await page.locator(logsWorkspaceSelectors.pauseButton).click();
        await expect(page.locator(logsWorkspaceSelectors.playbackStatusPill)).toContainText("paused");

        await page.locator(logsWorkspaceSelectors.timelineRange).fill("42000000");
        await expect.poll(async () => (await mockPlatform.getInvocations()).filter((invocation) => invocation.cmd === "playback_seek").length).toBe(1);
        await expect(page.getByTestId("logs-timeline-time")).toContainText("0:41 / 1:00");

        await page.locator(logsWorkspaceSelectors.speedSelect).selectOption("4");
        await expect.poll(async () => (await mockPlatform.getInvocations()).filter((invocation) => invocation.cmd === "playback_set_speed" && invocation.args?.speed === 4).length).toBe(1);

        await page.locator('[data-testid="logs-chart-group-altitude"]').click();
        const chartPlot = page.getByTestId("logs-chart-plot-alt");
        await expect(page.getByTestId("logs-chart-series-alt")).toBeVisible();
        await dragChartRange(chartPlot);
        await expect(page.locator('[data-testid="logs-chart-range-pill"]')).toBeVisible();
        await page.locator(logsWorkspaceSelectors.chartExportPath).fill("/tmp/logs-chart-export.csv");
        await page.locator(logsWorkspaceSelectors.chartExportButton).click();
        await expect(page.locator(logsWorkspaceSelectors.chartExportResult)).toContainText("/tmp/logs-chart-export.csv");

        await page.locator(logsWorkspaceSelectors.rawTypeFilter).fill("GLOBAL_POSITION_INT");
        await page.locator(logsWorkspaceSelectors.rawLimitFilter).fill("5");
        await page.locator(logsWorkspaceSelectors.rawRunQuery).click();
        await expect(page.locator('[data-testid="logs-raw-row-7"]')).toBeVisible();
        await page.locator('[data-testid="logs-raw-row-7"]').click();
        await expect(page.locator(logsWorkspaceSelectors.rawMessagesTable)).toContainText("GLOBAL_POSITION_INT");
        await page.locator(logsWorkspaceSelectors.rawExportDestination).fill("/tmp/logs-raw-export.csv");
        await page.locator(logsWorkspaceSelectors.rawExportButton).click();
        await expect(page.locator(logsWorkspaceSelectors.rawPanel)).toContainText("Export completed · 1 rows written.");

        await page.locator(logsWorkspaceSelectors.mapPathButton).click();
        await expectMissionWorkspace(page);
        await expect(missionWorkspaceLocator(page, "replayOverlayBanner")).toContainText("Replay map overlay");
        await expect(missionWorkspaceLocator(page, "mapReplayPath")).toBeVisible();
        await expect(page.locator(missionWorkspaceSelectors.mapReplayMarker)).toHaveCount(0);
        await expect(missionWorkspaceLocator(page, "homeReadOnly")).toContainText("Playback keeps the planner mounted");

        await page.locator(missionWorkspaceSelectors.modeFence).click();
        await expect(page.locator(missionWorkspaceSelectors.fenceAddInclusionPolygon)).toBeDisabled();

        await openLogsWorkspace(page);

        await page.locator(logsWorkspaceSelectors.stopButton).click();
        await expect(page.locator(logsWorkspaceSelectors.playbackStatusPill)).toContainText("idle");
        await expect(page.locator('[data-testid="logs-playback-label"]')).toContainText("Replay idle");

        await page.getByRole("button", { name: "Mission" }).click();
        await expect(page.getByTestId(appShellTestIds.sessionSource)).toContainText("live");
        await expect(page.getByTestId(appShellTestIds.activeWorkspace)).toContainText("mission");
        await page.locator(missionWorkspaceSelectors.modeFence).click();
        await expect(page.locator(missionWorkspaceSelectors.fenceAddInclusionPolygon)).toBeEnabled();
    });

    test("keeps replay, raw browser, and chart panels from overlapping during replay analysis", async ({ page, mockPlatform }) => {
        await applyShellViewport(page, "radiomaster");

        await page.getByRole("button", { name: "Overview" }).click();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
        await page.locator(connectionSelectors.connectButton).click();
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
        await expect(page.locator(connectionSelectors.disconnectButton)).toBeVisible();

        await openLogsWorkspace(page);
        await logEntryLocator(page, seededReadyEntryId).click();
        await page.locator(logsWorkspaceSelectors.preparePlayback).click();
        await page.locator(logsWorkspaceSelectors.playButton).click();
        await page.locator(logsWorkspaceSelectors.pauseButton).click();
        await expect(page.locator(logsWorkspaceSelectors.playbackStatusPill)).toContainText("paused");
        await expect(page.getByTestId(appShellTestIds.replayReadonlyBanner)).toBeVisible();

        await page.locator(logsWorkspaceSelectors.rawTypeFilter).fill("GLOBAL_POSITION_INT");
        await page.locator(logsWorkspaceSelectors.rawLimitFilter).fill("5");
        await page.locator(logsWorkspaceSelectors.rawRunQuery).click();
        await expect(page.locator('[data-testid="logs-raw-row-7"]')).toBeVisible();

        await page.locator(logsWorkspaceSelectors.chartsPanel).scrollIntoViewIfNeeded();
        await page.locator('[data-testid="logs-chart-group-altitude"]').click();
        const chartPlot = page.getByTestId("logs-chart-plot-alt");
        await expect(page.getByTestId("logs-chart-series-alt")).toBeVisible();
        await dragChartRange(chartPlot);
        await expect(page.locator('[data-testid="logs-chart-range-pill"]')).toBeVisible();

        await expectLogsAnalysisLayout(page);
    });

    test("sends the replay marker through the shipped shell into the mission overlay", async ({ page, mockPlatform }) => {
        await page.getByRole("button", { name: "Overview" }).click();
        await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
        await page.locator(connectionSelectors.connectButton).click();
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

        await openMissionWorkspace(page);
        await page.locator(missionWorkspaceSelectors.entryNew).click();
        await expect(missionWorkspaceLocator(page, "ready")).toBeVisible();

        await openLogsWorkspace(page);
        await logEntryLocator(page, seededReadyEntryId).click();
        await page.locator(logsWorkspaceSelectors.preparePlayback).click();
        await page.locator(logsWorkspaceSelectors.playButton).click();
        await page.locator(logsWorkspaceSelectors.pauseButton).click();
        await expect(page.locator(logsWorkspaceSelectors.mapMarkerButton)).toBeEnabled();

        await page.locator(logsWorkspaceSelectors.mapMarkerButton).click();
        await expect(page.getByTestId(appShellTestIds.activeWorkspace)).toContainText("mission");
        await expectMissionWorkspace(page);
        await expect(page.locator(missionWorkspaceSelectors.mapReplayMarker)).toBeVisible();
    });

    test("toggles recording and completes relink/reindex/remove maintenance flows", async ({ page, mockPlatform }) => {
        await logEntryLocator(page, seededReadyEntryId).click();
        await page.locator(logsWorkspaceSelectors.autoRecordToggle).check();
        await expect(page.locator('[data-testid="logs-auto-record-value"]')).toContainText("enabled");
        await mockPlatform.setSaveFileName("capture-logs.tlog");
        await page.locator(logsWorkspaceSelectors.recordingToggle).click();
        await expect(page.locator(logsWorkspaceSelectors.recordingStatus)).toContainText("Recording capture-logs.tlog");

        await page.locator(logsWorkspaceSelectors.preparePlayback).click();
        await page.locator(logsWorkspaceSelectors.playButton).click();
        await expect(page.locator(logsWorkspaceSelectors.recordingOverlap)).toBeVisible();

        await page.locator(logsWorkspaceSelectors.stopButton).click();
        await page.locator(logsWorkspaceSelectors.recordingToggle).click();
        await expect(page.locator(logsWorkspaceSelectors.recordingStatus)).toContainText("Recorder idle");
        await expect(page.locator('[data-testid^="logs-entry-"]')).toHaveCount(4);

        await logEntryLocator(page, seededMissingEntryId).click();
        await page.locator(logsWorkspaceSelectors.relinkPathInput).fill("/mock/relinked/missing-flight.tlog");
        await page.locator(logsWorkspaceSelectors.relinkButton).click();
        await expect(page.locator(logsWorkspaceSelectors.selectedStatusPill)).toContainText("stale");
        await expect(page.locator(logsWorkspaceSelectors.detailsPanel)).toContainText("reindex explicitly");

        await page.locator(logsWorkspaceSelectors.reindexButton).click();
        await expect(page.locator(logsWorkspaceSelectors.selectedStatusPill)).toContainText("ready");
        await page.locator(logsWorkspaceSelectors.removeButton).click();
        await expect(logEntryLocator(page, seededMissingEntryId)).toHaveCount(0);
        await expect(page.locator('[data-testid^="logs-entry-"]')).toHaveCount(3);
    });
});

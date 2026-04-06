import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import type { SessionEnvelope } from "../src/session";
import { missionWorkspaceTestIds } from "../src/components/mission/mission-workspace-test-ids";
import {
    applyShellViewport,
    closeVehiclePanelDrawer,
    connectionSelectors,
    expect,
    expectDockedVehiclePanel,
    expectMissionWorkspace,
    expectRuntimeDiagnostics,
    missionWorkspaceLocator,
    missionWorkspaceSelectors,
    openMissionWorkspace,
    openVehiclePanelDrawer,
    requireMissionMapDebugSnapshot,
    test,
    type ShellViewportPresetName,
} from "./fixtures/mock-platform";

type MockPlatformHarness = {
    reset: () => Promise<void>;
    clearSavedFiles: () => Promise<void>;
    getSavedFiles: () => Promise<Array<{ name: string; contents: string; size: number }>>;
    setOpenFile: (contents: string, name?: string, type?: string) => Promise<void>;
    setOpenBinaryFile: (contents: Uint8Array | ArrayBuffer | number[], name?: string, type?: string) => Promise<void>;
    getOpenFileState: () => Promise<{
        mode: "resolve" | "cancel" | "reject";
        name: string;
        type: string;
        kind: "text" | "binary";
        size: number;
        openCount: number;
    }>;
    cancelOpenFile: (message?: string) => Promise<void>;
    setSaveFileName: (name: string) => Promise<void>;
    setCommandBehavior: (cmd: string, behavior: unknown) => Promise<void>;
    resolveDeferredConnectLink: (params: {
        vehicleState: typeof connectedVehicleState;
        missionState?: {
            plan: null;
            current_index: null;
            sync: "current";
            active_op: null;
        };
        guidedState: typeof blockedGuidedState;
    }) => Promise<boolean>;
    emit: (event: string, payload: unknown) => Promise<void>;
    getLiveEnvelope: () => Promise<SessionEnvelope | null>;
    waitForOperatorWorkspace: () => Promise<void>;
};

type SavedPlanJson = {
    fileType?: string;
    mission?: {
        items?: Array<Record<string, unknown>>;
    };
    geoFence?: unknown;
    rallyPoints?: unknown;
};

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

const continuityViewportScenarios = ["desktop", "radiomaster", "phone"] as const satisfies readonly ShellViewportPresetName[];
const continuityKmlContents = readFileSync("tests/contracts/mission-continuity.kml", "utf8");
const continuityKmzBytes = readFileSync("tests/contracts/mission-continuity.kmz");

function note(history: string[], step: string) {
    history.push(step);
}

function historyMessage(history: string[], failure: string): string {
    return `${failure}\nAction history:\n${history.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

function dynamicTestId(prefix: string, suffix: string | number) {
    return `[data-testid="${prefix}-${suffix}"]`;
}

function importReviewChoiceLocator(page: Page, domain: "mission" | "fence" | "rally") {
    return page.locator(dynamicTestId(missionWorkspaceTestIds.importReviewChoicePrefix, domain));
}

function importReviewReplaceButton(page: Page, domain: "mission" | "fence" | "rally") {
    return page.locator(dynamicTestId(missionWorkspaceTestIds.importReviewReplacePrefix, domain));
}

function exportReviewInputLocator(page: Page, domain: "mission" | "fence" | "rally") {
    return page.locator(`${dynamicTestId(missionWorkspaceTestIds.exportReviewChoicePrefix, domain)} input`);
}

function firstFenceRegionLocator(page: Page) {
    return page.locator(`[data-testid^="${missionWorkspaceTestIds.fenceRegionPrefix}-"]`).first();
}

function firstRallyPointLocator(page: Page) {
    return page.locator(`[data-testid^="${missionWorkspaceTestIds.rallyPointPrefix}-"]`).first();
}

async function clickMissionControl(page: Page, selector: keyof typeof missionWorkspaceSelectors) {
    const locator = missionWorkspaceLocator(page, selector);
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
}

async function connectAndOpenMissionWorkspace(
    page: Page,
    mockPlatform: MockPlatformHarness,
    preset: ShellViewportPresetName,
    history: string[],
) {
    note(history, `Apply the ${preset} shell viewport.`);
    await applyShellViewport(page, preset);
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.clearSavedFiles();
    await mockPlatform.waitForOperatorWorkspace();
    await expectRuntimeDiagnostics(page);

    if (preset === "phone") {
        note(history, "Open the phone vehicle drawer so the connection surface becomes reachable.");
        await openVehiclePanelDrawer(page);
    } else {
        note(history, `Confirm ${preset} keeps the vehicle panel docked.`);
        await expectDockedVehiclePanel(page, preset);
    }

    note(history, "Connect the mocked live vehicle session.");
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
    await expect(
        page.locator(connectionSelectors.statusText),
        historyMessage(history, "The mocked vehicle never reached Connected state."),
    ).toContainText("Connected");

    if (preset === "phone") {
        note(history, "Close the phone vehicle drawer before entering the Mission workspace.");
        await closeVehiclePanelDrawer(page);
    }

    note(history, "Open the Mission workspace on the shipped Svelte shell.");
    await openMissionWorkspace(page);
    await expectMissionWorkspace(page);
}

async function startBlankMission(page: Page, history: string[]) {
    note(history, "Start a blank planner draft so continuity stays inside one mounted workspace.");
    await clickMissionControl(page, "entryNew");
    await expect(
        missionWorkspaceLocator(page, "ready"),
        historyMessage(history, "The Mission workspace never mounted the ready state after starting a blank draft."),
    ).toBeVisible();
}

async function setSharedHome(page: Page, history: string[]) {
    note(history, "Populate Home so playback and detached-local states have truthful shared-context copy to preserve.");
    await missionWorkspaceLocator(page, "homeLatitude").fill("47.401");
    await missionWorkspaceLocator(page, "homeLongitude").fill("8.552");
    await missionWorkspaceLocator(page, "homeAltitude").fill("490");
    await missionWorkspaceLocator(page, "homeAltitude").press("Tab");

    await expect(
        missionWorkspaceLocator(page, "homeSummary"),
        historyMessage(history, "Home edits never committed into the mounted planner workspace."),
    ).toContainText("47.401");
}

async function addAndEditRallyPoint(page: Page, history: string[]) {
    note(history, "Switch into Rally mode and add one point that later survives KML/KMZ review choices.");
    await clickMissionControl(page, "modeRally");
    await expect(missionWorkspaceLocator(page, "rallyList")).toBeVisible();
    await clickMissionControl(page, "rallyAdd");
    await expect(missionWorkspaceLocator(page, "countsRally")).toContainText("1");
    await expect(missionWorkspaceLocator(page, "mapRallyCount")).toContainText("1");

    const firstRallyPoint = firstRallyPointLocator(page);
    await expect(firstRallyPoint, historyMessage(history, "Rally mode never rendered the newly added rally point card.")).toBeVisible();
    await firstRallyPoint.click();
    await expect(missionWorkspaceLocator(page, "rallyInspectorSelectionKind")).toContainText("rally-point");

    note(history, "Change the rally altitude frame so the proof exercises real rally editing instead of list-only discovery.");
    await missionWorkspaceLocator(page, "rallyAltitudeFrame").selectOption("terrain");
    await missionWorkspaceLocator(page, "rallyAltitude").fill("42");
    await missionWorkspaceLocator(page, "rallyAltitude").press("Tab");

    const rallySnapshot = await requireMissionMapDebugSnapshot(page, "confirming the active rally editor state");
    expect(rallySnapshot.mode, historyMessage(history, "Mission-map diagnostics drifted away from Rally mode while editing a rally point.")).toBe("rally");
    expect(rallySnapshot.selectedRallyPointUiId, historyMessage(history, "Mission-map diagnostics lost the selected rally point id.")).not.toBeNull();
    expect(rallySnapshot.rallyMarkerCount, historyMessage(history, "Mission-map diagnostics lost the rally marker count.")).toBe(1);
    await expect(missionWorkspaceLocator(page, "homeSync")).toContainText("Live mission reads can refresh Home");
}

async function importContinuityKmlAndDismiss(page: Page, mockPlatform: MockPlatformHarness, history: string[]) {
    note(history, "Cancel one KML/KMZ picker request so the continuity flow proves the explicit cancelled-file note.");
    await mockPlatform.cancelOpenFile();
    await clickMissionControl(page, "toolbarImportKml");
    await expect(missionWorkspaceLocator(page, "localNote")).toContainText("KML/KMZ import cancelled");
    await expect(missionWorkspaceLocator(page, "countsRally")).toContainText("1");

    note(history, "Open the textual KML fixture and dismiss the review so the current draft stays unchanged.");
    await mockPlatform.setOpenFile(
        continuityKmlContents,
        "mission-continuity.kml",
        "application/vnd.google-earth.kml+xml",
    );
    const beforeOpen = await mockPlatform.getOpenFileState();
    await clickMissionControl(page, "toolbarImportKml");
    await expect
        .poll(() => mockPlatform.getOpenFileState(), {
            message: historyMessage(history, "The mocked picker never reported opening the textual KML continuity fixture."),
        })
        .toMatchObject({
            kind: "text",
            name: "mission-continuity.kml",
            type: "application/vnd.google-earth.kml+xml",
            openCount: beforeOpen.openCount + 1,
        });

    await expect(missionWorkspaceLocator(page, "importReview")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "importReviewTitle")).toContainText("mission-continuity.kml");
    await expect(missionWorkspaceLocator(page, "importReview")).toContainText("unsupported Point geometry");
    await expect(importReviewChoiceLocator(page, "rally")).toHaveCount(0);
    await importReviewReplaceButton(page, "mission").click();
    await importReviewReplaceButton(page, "fence").click();
    await clickMissionControl(page, "importReviewDismiss");

    await expect(
        missionWorkspaceLocator(page, "importReview"),
        historyMessage(history, "Dismissing the import review should leave the current planner workspace untouched."),
    ).toHaveCount(0);
    await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("0");
    await expect(missionWorkspaceLocator(page, "countsFence")).toContainText("0");
    await expect(missionWorkspaceLocator(page, "countsRally")).toContainText("1");
}

async function applyContinuityKmlImport(page: Page, mockPlatform: MockPlatformHarness, history: string[]) {
    note(history, "Re-open the textual KML fixture and apply the review with Mission/Fence replace plus Rally keep-current semantics.");
    await mockPlatform.setOpenFile(
        continuityKmlContents,
        "mission-continuity.kml",
        "application/vnd.google-earth.kml+xml",
    );
    await clickMissionControl(page, "toolbarImportKml");
    await expect(missionWorkspaceLocator(page, "importReview")).toBeVisible();

    await expect(importReviewChoiceLocator(page, "rally")).toHaveCount(0);
    await importReviewReplaceButton(page, "mission").click();
    await importReviewReplaceButton(page, "fence").click();
    await clickMissionControl(page, "importReviewConfirm");

    await expect(
        missionWorkspaceLocator(page, "localNote"),
        historyMessage(history, "Applying the continuity KML review never reported success back to the workspace."),
    ).toContainText("Applied mission-continuity.kml");
    await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("3");
    await expect(missionWorkspaceLocator(page, "countsFence")).toContainText("1");
    await expect(missionWorkspaceLocator(page, "countsRally")).toContainText("1");
    await expect(missionWorkspaceLocator(page, "warningFile")).toContainText("unsupported Point geometry");
}

async function proveFenceContinuity(page: Page, history: string[]) {
    note(history, "Enter Fence mode, recast the imported polygon into a circle, and force one blocked edit so warning-action routing is proven through the live shell.");
    await clickMissionControl(page, "modeFence");
    await expect(missionWorkspaceLocator(page, "fenceList")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "mapFenceCount")).toContainText("1");

    const firstFenceRegion = firstFenceRegionLocator(page);
    await expect(firstFenceRegion, historyMessage(history, "Fence mode never rendered the imported KML fence region card.")).toBeVisible();
    await firstFenceRegion.click();
    await expect(missionWorkspaceLocator(page, "fenceInspectorSelectionKind")).toContainText("fence-region");
    await missionWorkspaceLocator(page, "fenceInspectorType").selectOption("inclusion_circle");
    await missionWorkspaceLocator(page, "fenceCircleRadius").fill("-10");
    await missionWorkspaceLocator(page, "fenceCircleRadius").press("Tab");

    await expect(
        missionWorkspaceLocator(page, "warningRegister"),
        historyMessage(history, "The blocked fence edit never surfaced in the sticky warning register."),
    ).toContainText("Blocked action");
    await expect(missionWorkspaceLocator(page, "warningRegister")).toContainText("radius greater than zero");

    const fenceSnapshot = await requireMissionMapDebugSnapshot(page, "confirming the fence editor diagnostics");
    expect(fenceSnapshot.mode, historyMessage(history, "Mission-map diagnostics drifted away from Fence mode during fence editing.")).toBe("fence");
    expect(fenceSnapshot.counts.fenceFeatures, historyMessage(history, "Mission-map diagnostics lost the fence feature count.")).toBeGreaterThan(0);
    expect(fenceSnapshot.activeFenceRadiusCount, historyMessage(history, "Mission-map diagnostics lost the active fence radius handle count.")).toBe(1);

    note(history, "Switch back to Mission mode and use the sticky warning action to reopen the targeted fence region.");
    await clickMissionControl(page, "modeMission");
    await page.getByRole("button", { name: /open fence mode/i }).click();
    await expect(missionWorkspaceLocator(page, "fenceList")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "fenceInspectorSelectionKind")).toContainText("fence-region");
}

async function proveMixedExportChooser(page: Page, mockPlatform: MockPlatformHarness, history: string[], fileName: string) {
    note(history, "Open the mixed-domain export chooser, prove the empty-selection failure, then save a real .plan with Mission/Fence/Rally content.");
    await clickMissionControl(page, "toolbarExport");
    await expect(missionWorkspaceLocator(page, "exportReview")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "exportReviewTitle")).toContainText("Choose which planner domains");
    await expect(exportReviewInputLocator(page, "mission")).toBeChecked();
    await expect(exportReviewInputLocator(page, "fence")).toBeChecked();
    await expect(exportReviewInputLocator(page, "rally")).toBeChecked();

    await exportReviewInputLocator(page, "mission").uncheck();
    await exportReviewInputLocator(page, "fence").uncheck();
    await exportReviewInputLocator(page, "rally").uncheck();
    await clickMissionControl(page, "exportReviewConfirm");
    await expect(missionWorkspaceLocator(page, "exportReview")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "warningRegister")).toContainText("Choose at least one planning domain");

    await exportReviewInputLocator(page, "mission").check();
    await exportReviewInputLocator(page, "fence").check();
    await exportReviewInputLocator(page, "rally").check();
    await mockPlatform.setSaveFileName(fileName);
    await clickMissionControl(page, "exportReviewConfirm");
    await expect(missionWorkspaceLocator(page, "localNote")).toContainText(`Saved ${fileName}`);

    const savedFiles = await mockPlatform.getSavedFiles();
    expect(savedFiles, historyMessage(history, `Exporting ${fileName} should leave exactly one saved .plan file.`)).toHaveLength(1);
    const saved = savedFiles[0];
    expect(saved?.name).toBe(fileName);
    expect(saved?.size ?? 0).toBeGreaterThan(0);

    let parsed: SavedPlanJson;
    try {
        parsed = JSON.parse(saved?.contents ?? "") as SavedPlanJson;
    } catch (error) {
        throw new Error(
            historyMessage(
                history,
                `Exporting ${fileName} produced malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
            ),
        );
    }

    expect(parsed.fileType).toBe("Plan");
    expect(parsed.mission?.items?.length ?? 0, historyMessage(history, "The mixed-domain export lost mission items.")).toBeGreaterThan(0);
    expect(parsed.geoFence, historyMessage(history, "The mixed-domain export lost fence content.")).toBeTruthy();
    expect(parsed.rallyPoints, historyMessage(history, "The mixed-domain export lost rally content.")).toBeTruthy();
}

async function emitSessionEnvelope(
    mockPlatform: MockPlatformHarness,
    envelope: SessionEnvelope,
    connection: "connected" | "disconnected",
    vehicleState: typeof connectedVehicleState | null,
) {
    await mockPlatform.emit("session://state", {
        envelope,
        value: {
            available: true,
            complete: true,
            provenance: envelope.source_kind === "playback" ? "playback" : "stream",
            value: {
                status: "active",
                connection: { kind: connection },
                vehicle_state: vehicleState,
                home_position: null,
            },
        },
    });
}

async function provePlaybackAndDetachedLocalStates(
    page: Page,
    mockPlatform: MockPlatformHarness,
    liveEnvelope: SessionEnvelope,
    history: string[],
) {
    note(history, "Switch the active scope into playback without replacing the mounted draft, then verify read-only truth across attachment, Home, and mode-specific controls.");
    const playbackEnvelope: SessionEnvelope = {
        ...liveEnvelope,
        source_kind: "playback",
    };
    await emitSessionEnvelope(mockPlatform, playbackEnvelope, "disconnected", null);
    await expect(missionWorkspaceLocator(page, "attachment")).toContainText("Playback read-only");
    await expect(missionWorkspaceLocator(page, "attachmentDetail")).toContainText("Playback keeps the planner mounted");
    await expect(missionWorkspaceLocator(page, "warningRegister")).toContainText("Playback read-only");

    await clickMissionControl(page, "modeFence");
    await expect(missionWorkspaceLocator(page, "fenceAddInclusionPolygon")).toBeDisabled();
    await clickMissionControl(page, "modeRally");
    await expect(missionWorkspaceLocator(page, "rallyAdd")).toBeDisabled();
    await expect(missionWorkspaceLocator(page, "homeSync")).toContainText("Playback keeps the last known Home visible");
    await expect(missionWorkspaceLocator(page, "homeReadOnly")).toContainText("Playback keeps the planner mounted");

    note(history, "Advance the active live scope revision so the mounted draft becomes detached-local instead of being falsely treated as attached.");
    const detachedEnvelope: SessionEnvelope = {
        ...liveEnvelope,
        source_kind: "live",
        reset_revision: liveEnvelope.reset_revision + 1,
    };
    await emitSessionEnvelope(mockPlatform, detachedEnvelope, "connected", connectedVehicleState);
    await expect(missionWorkspaceLocator(page, "attachment")).toContainText("Detached local");
    await expect(missionWorkspaceLocator(page, "attachmentDetail")).toContainText("previous draft mounted");
    await expect(missionWorkspaceLocator(page, "warningRegister")).toContainText("Detached local");
    await expect(missionWorkspaceLocator(page, "toolbarUpload")).toBeDisabled();
}

async function importContinuityKmzWhileDetached(
    page: Page,
    mockPlatform: MockPlatformHarness,
    history: string[],
) {
    note(history, "Feed the real binary KMZ fixture through the mocked picker while detached-local, then reattach the workspace by applying the review in the active scope.");
    const beforeOpen = await mockPlatform.getOpenFileState();
    await mockPlatform.setOpenBinaryFile(
        Array.from(continuityKmzBytes),
        "mission-continuity.kmz",
        "application/vnd.google-earth.kmz",
    );
    await clickMissionControl(page, "toolbarImportKml");
    await expect
        .poll(() => mockPlatform.getOpenFileState(), {
            message: historyMessage(history, "The mocked picker never reported opening the binary KMZ continuity fixture."),
        })
        .toMatchObject({
            kind: "binary",
            name: "mission-continuity.kmz",
            type: "application/vnd.google-earth.kmz",
            size: continuityKmzBytes.length,
            openCount: beforeOpen.openCount + 1,
        });

    await expect(missionWorkspaceLocator(page, "importReview")).toBeVisible();
    await expect(missionWorkspaceLocator(page, "importReviewTitle")).toContainText("mission-continuity.kmz");
    await expect(missionWorkspaceLocator(page, "importReview")).toContainText("unsupported Point geometry");
    await expect(importReviewChoiceLocator(page, "rally")).toHaveCount(0);

    await importReviewReplaceButton(page, "mission").click();
    await importReviewReplaceButton(page, "fence").click();
    await clickMissionControl(page, "importReviewConfirm");

    await expect(missionWorkspaceLocator(page, "localNote")).toContainText("Applied mission-continuity.kmz");
    await expect(missionWorkspaceLocator(page, "attachment")).toContainText("Live attached");
    await expect(missionWorkspaceLocator(page, "attachmentDetail")).toContainText("belongs to the active live scope");
    await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("3");
    await expect(missionWorkspaceLocator(page, "countsFence")).toContainText("1");
    await expect(missionWorkspaceLocator(page, "countsRally")).toContainText("1");
    await expect(missionWorkspaceLocator(page, "warningFile")).toContainText("unsupported Point geometry");
}

test.describe("mocked mission planning continuity", () => {
    for (const preset of continuityViewportScenarios) {
        test(`proves mission, fence, rally, KML/KMZ, playback, and detached continuity on the ${preset} shell`, async ({
            page,
            mockPlatform,
        }) => {
            const history: string[] = [];
            const harness = mockPlatform as MockPlatformHarness;

            await connectAndOpenMissionWorkspace(page, harness, preset, history);
            const liveEnvelope = await harness.getLiveEnvelope();
            if (!liveEnvelope) {
                throw new Error(historyMessage(history, "The mock backend never exposed a live envelope after connection."));
            }

            await startBlankMission(page, history);
            await addAndEditRallyPoint(page, history);
            await importContinuityKmlAndDismiss(page, harness, history);
            await applyContinuityKmlImport(page, harness, history);
            await setSharedHome(page, history);
            await proveFenceContinuity(page, history);
            await proveMixedExportChooser(page, harness, history, `${preset}-continuity.plan`);
            await provePlaybackAndDetachedLocalStates(page, harness, liveEnvelope, history);
            await importContinuityKmzWhileDetached(page, harness, history);

            note(history, "Return to Rally mode once more so the final diagnostics prove the kept current rally point survived both textual and binary continuity imports.");
            await clickMissionControl(page, "modeRally");
            await expect(missionWorkspaceLocator(page, "rallyList")).toBeVisible();
            await expect(missionWorkspaceLocator(page, "mapRallyCount")).toContainText("1");
            const finalSnapshot = await requireMissionMapDebugSnapshot(page, `${preset} final continuity snapshot`);
            expect(finalSnapshot.mode, historyMessage(history, `The ${preset} flow lost Rally mode before the final diagnostic snapshot.`)).toBe("rally");
            expect(finalSnapshot.rallyMarkerCount, historyMessage(history, `The ${preset} flow lost the preserved rally marker count after the KMZ reattach.`)).toBe(1);
            expect(
                finalSnapshot.readOnlyReason,
                historyMessage(history, `The ${preset} flow should end reattached to the active live scope with truthful attachment detail.`),
            ).toContain("belongs to the active live scope");
        });
    }
});

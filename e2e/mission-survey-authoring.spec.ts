import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { missionWorkspaceTestIds } from "../src/components/mission/mission-workspace-test-ids";
import {
    applyShellViewport,
    closeVehiclePanelDrawer,
    connectionSelectors,
    expect,
    expectDockedVehiclePanel,
    expectMissionHistoryState,
    expectMissionWorkspace,
    expectRuntimeDiagnostics,
    missionHistoryButtonLocator,
    missionWorkspaceLocator,
    missionWorkspaceSelectors,
    openMissionWorkspace,
    openVehiclePanelDrawer,
    readMissionHistoryState,
    requireMissionMapDebugSnapshot,
    selectMissionPhoneSegment,
    test,
    type ShellViewportPresetName,
} from "./fixtures/mock-platform";

type MockPlatformHarness = {
    reset: () => Promise<void>;
    clearSavedFiles: () => Promise<void>;
    getSavedFiles: () => Promise<Array<{ name: string; contents: string }>>;
    setOpenFile: (contents: string, name?: string) => Promise<void>;
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
    waitForOperatorWorkspace: () => Promise<void>;
};

type AuthoringPattern = "grid" | "corridor" | "structure";

type PlanItem = Record<string, unknown> & {
    type?: string;
    complexItemType?: string;
};

type SavedPlanJson = {
    fileType?: string;
    mission?: {
        items?: PlanItem[];
    };
};

type FixtureScenario = {
    key: "survey" | "corridor" | "structure";
    fileName: string;
    contents: string;
    expectedComplexTypes: string[];
    blockedRegionIndex?: number;
    blockedCameraName?: string;
    assertRoundTrip: (items: PlanItem[]) => void;
};

const BUILTIN_CAMERA = "Sony ILCE-QX1";
const undoShortcut = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
const redoShortcut = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z";
const surveyPlanContents = readFileSync("tests/contracts/survey-complex.plan.json", "utf8");
const corridorPlanContents = readFileSync("tests/contracts/corridor-complex.plan.json", "utf8");
const structurePlanContents = readFileSync("tests/contracts/structure-complex.plan.json", "utf8");

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

const authoredViewportScenarios = ["desktop", "radiomaster", "phone"] as const satisfies readonly ShellViewportPresetName[];

const surveyCardSelector = [
    `[data-testid^="${missionWorkspaceTestIds.surveyPrefix}-"]`,
    `:not([data-testid^="${missionWorkspaceTestIds.surveyCollapsePrefix}-"])`,
    `:not([data-testid^="${missionWorkspaceTestIds.surveyGeneratePrefix}-"])`,
    `:not([data-testid^="${missionWorkspaceTestIds.surveyDissolvePrefix}-"])`,
    `:not([data-testid^="${missionWorkspaceTestIds.surveyDeletePrefix}-"])`,
].join("");

const patternButtons: Record<AuthoringPattern, keyof typeof missionWorkspaceSelectors> = {
    grid: "mapDrawStartGrid",
    corridor: "mapDrawStartCorridor",
    structure: "mapDrawStartStructure",
};

const drawPoints: Record<AuthoringPattern, Array<{ x: number; y: number }>> = {
    grid: [
        { x: 0.12, y: 0.82 },
        { x: 0.84, y: 0.8 },
        { x: 0.72, y: 0.14 },
    ],
    corridor: [
        { x: 0.1, y: 0.74 },
        { x: 0.44, y: 0.16 },
        { x: 0.88, y: 0.74 },
    ],
    structure: [
        { x: 0.14, y: 0.86 },
        { x: 0.86, y: 0.8 },
        { x: 0.72, y: 0.16 },
    ],
};

const fixtureScenarios: FixtureScenario[] = [
    {
        key: "survey",
        fileName: "survey-complex.plan",
        contents: surveyPlanContents,
        expectedComplexTypes: ["survey", "survey"],
        blockedRegionIndex: 1,
        blockedCameraName: "Manual (no camera specs)",
        assertRoundTrip(items) {
            const secondComplex = items[2] as {
                complexItemType?: string;
                TransectStyleComplexItem?: {
                    CameraCalc?: { CameraName?: string };
                    HoverAndCapture?: boolean;
                };
            };
            expect(secondComplex.complexItemType).toBe("survey");
            expect(secondComplex.TransectStyleComplexItem?.CameraCalc?.CameraName).toBe("Manual (no camera specs)");
            expect(secondComplex.TransectStyleComplexItem?.HoverAndCapture).toBe(true);
        },
    },
    {
        key: "corridor",
        fileName: "corridor-complex.plan",
        contents: corridorPlanContents,
        expectedComplexTypes: ["CorridorScan", "CorridorScan"],
        blockedRegionIndex: 1,
        blockedCameraName: "Custom Camera",
        assertRoundTrip(items) {
            const secondComplex = items[2] as {
                complexItemType?: string;
                CorridorWidth?: number;
                TransectStyleComplexItem?: { CameraCalc?: { CameraName?: string } };
            };
            expect(secondComplex.complexItemType).toBe("CorridorScan");
            expect(secondComplex.CorridorWidth).toBe(42);
            expect(secondComplex.TransectStyleComplexItem?.CameraCalc?.CameraName).toBe("Custom Camera");
        },
    },
    {
        key: "structure",
        fileName: "structure-complex.plan",
        contents: structurePlanContents,
        expectedComplexTypes: ["StructureScan"],
        assertRoundTrip(items) {
            const structureComplex = items[1] as {
                complexItemType?: string;
                Layers?: number;
                StructureHeight?: number;
                CameraCalc?: { CameraName?: string };
            };
            expect(structureComplex.complexItemType).toBe("StructureScan");
            expect(structureComplex.Layers).toBe(4);
            expect(structureComplex.StructureHeight).toBe(24);
            expect(structureComplex.CameraCalc?.CameraName).toBe(BUILTIN_CAMERA);
        },
    },
];

function note(history: string[], step: string) {
    history.push(step);
}

function historyMessage(history: string[], failure: string): string {
    return `${failure}\nAction history:\n${history.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function surveyBlockLocator(page: Page, regionId: string) {
    return page.locator(`[data-testid="${missionWorkspaceTestIds.surveyPrefix}-${regionId}"]`);
}

async function pressMissionHistoryShortcut(page: Page, kind: "undo" | "redo") {
    await page.keyboard.press(kind === "undo" ? undoShortcut : redoShortcut);
}

function parseLatestSavedPlan(
    savedFiles: Array<{ name: string; contents: string }>,
    history: string[],
    context: string,
): SavedPlanJson {
    expect(savedFiles, historyMessage(history, `${context} should leave exactly one saved .plan file.`)).toHaveLength(1);

    const saved = savedFiles[0];
    if (!saved) {
        throw new Error(historyMessage(history, `${context} did not produce a saved .plan file.`));
    }

    try {
        const parsed = JSON.parse(saved.contents) as SavedPlanJson;
        if (!parsed || typeof parsed !== "object" || parsed.fileType !== "Plan") {
            throw new Error("Saved file was not a QGroundControl plan object.");
        }
        if (!Array.isArray(parsed.mission?.items)) {
            throw new Error("Saved plan did not contain mission.items[].");
        }
        return parsed;
    } catch (error) {
        throw new Error(
            historyMessage(
                history,
                `${context} produced malformed saved plan JSON: ${error instanceof Error ? error.message : String(error)}`,
            ),
        );
    }
}

async function connectAndOpenMissionWorkspace(
    page: Page,
    mockPlatform: MockPlatformHarness,
    preset: ShellViewportPresetName,
    history: string[],
) {
    note(history, `Apply ${preset} viewport.`);
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

    note(history, "Connect the mock vehicle session.");
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
        historyMessage(history, "The vehicle connection never reached Connected state."),
    ).toContainText("Connected");

    if (preset === "phone") {
        note(history, "Close the phone vehicle drawer before working in the main Mission viewport.");
        await closeVehiclePanelDrawer(page);
    }

    note(history, "Open the Mission workspace on the active Svelte shell.");
    await openMissionWorkspace(page);
    await expectMissionWorkspace(page);
}

async function startBlankMission(page: Page, history: string[]) {
    note(history, "Start a blank mission draft.");
    await missionWorkspaceLocator(page, "entryNew").click();
    await expect(
        missionWorkspaceLocator(page, "ready"),
        historyMessage(history, "The Mission workspace never mounted the ready state after creating a blank draft."),
    ).toBeVisible();
}

async function addManualWaypoint(page: Page, history: string[]) {
    note(history, "Add one manual waypoint so export proves mixed manual + survey content.");
    await missionWorkspaceLocator(page, "listAdd").click();
    await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");
    await missionWorkspaceLocator(page, "inspectorLatitude").fill("47.5301");
    await missionWorkspaceLocator(page, "inspectorLongitude").fill("8.6301");
    await missionWorkspaceLocator(page, "inspectorAltitude").fill("120");
    await missionWorkspaceLocator(page, "inspectorAltitude").press("Tab");
}

async function drawSurveyRegion(
    page: Page,
    history: string[],
    pattern: AuthoringPattern,
): Promise<string> {
    const hasPhoneSegments = (await page.locator(`[data-testid="${missionWorkspaceTestIds.phoneSegmentBar}"]`).count()) > 0;
    if (hasPhoneSegments) {
        note(history, `Switch the phone Mission shell to the map segment before starting ${pattern} drawing.`);
        await selectMissionPhoneSegment(page, "map");
    }

    note(history, `Start ${pattern} drawing on the shared map surface.`);
    const drawStart = missionWorkspaceLocator(page, patternButtons[pattern]);
    await drawStart.scrollIntoViewIfNeeded();
    await drawStart.click();
    await expect(
        missionWorkspaceLocator(page, "mapDrawMode"),
        historyMessage(history, `The planner map never entered ${pattern} draw mode.`),
    ).toContainText(`draw:${pattern}`);

    const drawSurface = missionWorkspaceLocator(page, "mapDrawSurface");
    await expect(
        drawSurface,
        historyMessage(history, `The ${pattern} draw surface never became visible after entering draw mode.`),
    ).toBeVisible();
    await drawSurface.scrollIntoViewIfNeeded();

    for (const [index, point] of drawPoints[pattern].entries()) {
        let previousSignature: string | null = null;
        let stableSampleCount = 0;
        await expect.poll(
            async () => {
                const drawSurfaceBox = await drawSurface.boundingBox();
                const snapshot = await requireMissionMapDebugSnapshot(page, `${pattern} draw readiness before point ${index + 1}`);
                if (!drawSurfaceBox || snapshot.drawMode !== "draw" || snapshot.drawPatternType !== pattern || snapshot.drawRegionId === null) {
                    previousSignature = null;
                    stableSampleCount = 0;
                    return 0;
                }

                const signature = [
                    Math.round(drawSurfaceBox.x),
                    Math.round(drawSurfaceBox.y),
                    Math.round(drawSurfaceBox.width),
                    Math.round(drawSurfaceBox.height),
                    snapshot.updateCount,
                    snapshot.drawPointCount,
                ].join(":");
                stableSampleCount = signature === previousSignature ? stableSampleCount + 1 : 0;
                previousSignature = signature;
                return stableSampleCount;
            },
            {
                message: historyMessage(history, `The ${pattern} draw surface never settled before point ${index + 1}.`),
            },
        ).toBeGreaterThan(0);

        const drawSurfaceBox = await drawSurface.boundingBox();
        if (!drawSurfaceBox) {
            throw new Error(historyMessage(history, `The ${pattern} draw surface had no measurable bounding box before point ${index + 1}.`));
        }

        note(history, `Place ${pattern} geometry point at ${(point.x * 100).toFixed(0)}% × ${(point.y * 100).toFixed(0)}% of the map surface.`);
        await drawSurface.click({ position: { x: drawSurfaceBox.width * point.x, y: drawSurfaceBox.height * point.y } });
        await expect.poll(
            async () => (await requireMissionMapDebugSnapshot(page, `${pattern} authoring click ${index + 1}`)).drawPointCount,
            {
                message: historyMessage(history, `The ${pattern} draw session never acknowledged point ${index + 1}.`),
            },
        ).toBe(index + 1);
    }

    await expect.poll(
        async () => (await requireMissionMapDebugSnapshot(page, `${pattern} authoring`)).drawPointCount,
        {
            message: historyMessage(history, `The ${pattern} draw session never reported the expected point count.`),
        },
    ).toBe(drawPoints[pattern].length);

    note(history, `Finish ${pattern} drawing.`);
    await missionWorkspaceLocator(page, "mapDrawFinish").click();
    await expect(
        missionWorkspaceLocator(page, "mapDrawMode"),
        historyMessage(history, `The planner map never returned to idle after finishing ${pattern} drawing.`),
    ).toContainText("idle");
    await expect(drawSurface).toHaveCount(0);

    const snapshot = await requireMissionMapDebugSnapshot(page, `${pattern} selection after draw`);
    const regionId = snapshot.selectedSurveyRegionId ?? (snapshot.selection.kind === "survey-block" ? snapshot.selection.regionId : null);
    if (!regionId) {
        throw new Error(historyMessage(history, `Finishing ${pattern} drawing did not leave a selected survey region.`));
    }

    if (hasPhoneSegments) {
        note(history, `Return the phone Mission shell to the plan segment so ${pattern} survey inspector controls stay reachable.`);
        await selectMissionPhoneSegment(page, "plan");
    }

    await expect(missionWorkspaceLocator(page, "inspectorSelectionKind")).toContainText("survey-block");
    return regionId;
}

async function selectBuiltinCamera(page: Page, history: string[]) {
    note(history, `Select the builtin ${BUILTIN_CAMERA} survey camera.`);
    const searchInput = missionWorkspaceLocator(page, "cameraSearch");
    await searchInput.scrollIntoViewIfNeeded();
    await searchInput.fill(BUILTIN_CAMERA);
    const cameraButton = page.getByRole("button", { name: new RegExp(`^Use ${escapeRegExp(BUILTIN_CAMERA)}$`) }).first();
    await expect(
        cameraButton,
        historyMessage(history, `The builtin ${BUILTIN_CAMERA} camera button never appeared in the survey camera picker.`),
    ).toBeVisible();
    await cameraButton.click();
    await expect(
        missionWorkspaceLocator(page, "cameraCurrent"),
        historyMessage(history, `The survey camera picker never reflected ${BUILTIN_CAMERA} as the active camera.`),
    ).toContainText(BUILTIN_CAMERA);
}

async function stabilizeCorridorGeometry(page: Page, history: string[]) {
    note(history, "Refine the corridor centerline through the inspector so generate runs against a compact local route.");
    const inspector = page.locator(missionWorkspaceSelectors.inspectorSurvey);
    const latitudes = ["47.5298", "47.5303", "47.5308"];
    const longitudes = ["8.6297", "8.6302", "8.6307"];
    const latitudeInputs = inspector.getByRole("spinbutton", { name: "Latitude" });
    const longitudeInputs = inspector.getByRole("spinbutton", { name: "Longitude" });

    for (const [index, latitude] of latitudes.entries()) {
        await latitudeInputs.nth(index).fill(latitude);
        await latitudeInputs.nth(index).press("Tab");
        await longitudeInputs.nth(index).fill(longitudes[index]!);
        await longitudeInputs.nth(index).press("Tab");
    }
}

async function stabilizeStructureGeometry(page: Page, history: string[]) {
    note(history, "Refine the structure footprint through the inspector so generate runs against a compact local polygon.");
    const inspector = page.locator(missionWorkspaceSelectors.inspectorSurvey);
    const latitudes = ["47.5297", "47.5307", "47.5302"];
    const longitudes = ["8.6297", "8.6301", "8.6308"];
    const latitudeInputs = inspector.getByRole("spinbutton", { name: "Latitude" });
    const longitudeInputs = inspector.getByRole("spinbutton", { name: "Longitude" });

    for (const [index, latitude] of latitudes.entries()) {
        await latitudeInputs.nth(index).fill(latitude);
        await latitudeInputs.nth(index).press("Tab");
        await longitudeInputs.nth(index).fill(longitudes[index]!);
        await longitudeInputs.nth(index).press("Tab");
    }
}

async function generateSelectedSurvey(page: Page, history: string[], pattern: AuthoringPattern) {
    note(history, `Generate the selected ${pattern} survey region.`);
    const generateButton = missionWorkspaceLocator(page, "surveyGenerate");
    await generateButton.scrollIntoViewIfNeeded();
    await generateButton.click();

    const generatedItems = page
        .locator(missionWorkspaceSelectors.inspectorSurvey)
        .getByRole("button", { name: /Item\s+\d+/i });
    await expect.poll(
        async () => await generatedItems.count(),
        {
            message: historyMessage(history, `The ${pattern} survey inspector never exposed generated mission items.`),
            timeout: 15_000,
        },
    ).toBeGreaterThan(0);
    await expect.poll(
        async () => (await requireMissionMapDebugSnapshot(page, `${pattern} preview`)).surveyPreviewFeatureCount,
        {
            message: historyMessage(history, `The ${pattern} survey never published preview overlay diagnostics.`),
            timeout: 15_000,
        },
    ).toBeGreaterThan(0);
}

async function verifyCancelledRegenerateAndDissolve(
    page: Page,
    history: string[],
    regionId: string,
) {
    note(history, "Create one subordinate generated-item manual edit before testing prompt dismiss paths.");
    const editableGeneratedItem = page
        .locator(missionWorkspaceSelectors.inspectorSurvey)
        .getByRole("button", { name: /Waypoint/i })
        .first();
    await expect(editableGeneratedItem).toBeVisible();
    await editableGeneratedItem.click();
    await expect(missionWorkspaceLocator(page, "surveyGeneratedAltitude")).toBeVisible();
    await missionWorkspaceLocator(page, "surveyGeneratedAltitude").fill("82");
    await missionWorkspaceLocator(page, "surveyGeneratedAltitude").press("Tab");

    const editedBadge = page
        .locator(missionWorkspaceSelectors.inspectorSurvey)
        .locator(`[data-testid^="${missionWorkspaceTestIds.surveyGeneratedEditedPrefix}-"]`)
        .first();
    await expect(
        editedBadge,
        historyMessage(history, "The manual generated-item edit badge never appeared after editing subordinate survey output."),
    ).toBeVisible();

    note(history, "Dismiss the explicit regenerate confirmation instead of overwriting manual edits.");
    await missionWorkspaceLocator(page, "surveyGenerate").click();
    await expect(missionWorkspaceLocator(page, "surveyPromptKind")).toContainText("confirm-regenerate");
    await missionWorkspaceLocator(page, "surveyPromptDismiss").click();
    await expect(missionWorkspaceLocator(page, "surveyPrompt")).toHaveCount(0);
    await expect(editedBadge).toBeVisible();

    note(history, "Dismiss the explicit dissolve confirmation and keep the authored region intact.");
    await missionWorkspaceLocator(page, "surveyDissolve").click();
    await expect(missionWorkspaceLocator(page, "surveyPromptKind")).toContainText("confirm-dissolve");
    await missionWorkspaceLocator(page, "surveyPromptDismiss").click();
    await expect(missionWorkspaceLocator(page, "surveyPrompt")).toHaveCount(0);
    await expect(
        surveyBlockLocator(page, regionId),
        historyMessage(history, "Dismissing dissolve unexpectedly removed the selected survey region card."),
    ).toBeVisible();
}

async function proveRegenerateAndDissolveHistoryRecovery(page: Page, history: string[], regionId: string) {
    note(history, "Open the regenerate prompt, undo the last manual generated-item edit through the workspace shortcut, then redo it before proving dissolve recovery from the header.");

    const editedBadge = page
        .locator(missionWorkspaceSelectors.inspectorSurvey)
        .locator(`[data-testid^="${missionWorkspaceTestIds.surveyGeneratedEditedPrefix}-"]`)
        .first();
    await expect(
        editedBadge,
        historyMessage(history, "The survey inspector lost the generated-item edited badge before history recovery started."),
    ).toBeVisible();

    const historyBeforeRegenerateUndo = await readMissionHistoryState(page);
    await missionWorkspaceLocator(page, "surveyGenerate").click();
    await expect(missionWorkspaceLocator(page, "surveyPromptKind")).toContainText("confirm-regenerate");

    await pressMissionHistoryShortcut(page, "undo");
    await expect(missionWorkspaceLocator(page, "surveyPrompt")).toHaveCount(0);
    await expect(editedBadge).toHaveCount(0);
    await expectMissionHistoryState(
        page,
        {
            undo: {
                count: historyBeforeRegenerateUndo.undo.count - 1,
                disabled: historyBeforeRegenerateUndo.undo.count - 1 <= 0,
            },
            redo: { count: 1, disabled: false },
        },
        historyMessage(history, "Undoing while the regenerate prompt is open should roll back the last manual survey edit in one step."),
    );

    await pressMissionHistoryShortcut(page, "redo");
    await expect(editedBadge).toBeVisible();
    await expectMissionHistoryState(
        page,
        {
            undo: { count: historyBeforeRegenerateUndo.undo.count, disabled: false },
            redo: { count: 0, disabled: true },
        },
        historyMessage(history, "Redoing after survey regenerate undo should restore the manual generated-item edit in one step."),
    );

    const historyBeforeDissolve = await readMissionHistoryState(page);
    await missionWorkspaceLocator(page, "surveyDissolve").click();
    await expect(missionWorkspaceLocator(page, "surveyPromptKind")).toContainText("confirm-dissolve");
    await missionWorkspaceLocator(page, "surveyPromptConfirm").click();
    await expect(surveyBlockLocator(page, regionId)).toHaveCount(0);

    const historyAfterDissolve = await readMissionHistoryState(page);
    expect(historyAfterDissolve.undo.count).toBe(historyBeforeDissolve.undo.count + 1);
    expect(historyAfterDissolve.undo.disabled).toBe(false);
    expect(historyAfterDissolve.redo.count).toBe(0);
    expect(historyAfterDissolve.redo.disabled).toBe(true);

    await missionHistoryButtonLocator(page, "undo").click();
    await expect(surveyBlockLocator(page, regionId)).toBeVisible();
    await expectMissionHistoryState(
        page,
        {
            undo: { count: historyBeforeDissolve.undo.count, disabled: false },
            redo: { count: 1, disabled: false },
        },
        historyMessage(history, "Undoing a confirmed survey dissolve should restore the authored region in one step."),
    );

    await missionHistoryButtonLocator(page, "redo").click();
    await expect(surveyBlockLocator(page, regionId)).toHaveCount(0);
    await expectMissionHistoryState(
        page,
        {
            undo: { count: historyAfterDissolve.undo.count, disabled: false },
            redo: { count: 0, disabled: true },
        },
        historyMessage(history, "Redoing a confirmed survey dissolve should remove the authored region again in one step."),
    );

    await missionHistoryButtonLocator(page, "undo").click();
    await expect(surveyBlockLocator(page, regionId)).toBeVisible();
}

async function exportPlan(page: Page, mockPlatform: MockPlatformHarness, fileName: string, history: string[]) {
    note(history, `Export the mission workspace to ${fileName}.`);
    await mockPlatform.setSaveFileName(fileName);
    await missionWorkspaceLocator(page, "toolbarExport").click();
    await expect.poll(async () => (await mockPlatform.getSavedFiles()).length, {
        message: historyMessage(history, `The mission export never produced ${fileName}.`),
    }).toBe(1);
    return parseLatestSavedPlan(await mockPlatform.getSavedFiles(), history, `Exporting ${fileName}`);
}

async function importFixturePlan(
    page: Page,
    mockPlatform: MockPlatformHarness,
    history: string[],
    fileName: string,
    contents: string,
) {
    note(history, `Import ${fileName} through the Mission workspace picker.`);
    await mockPlatform.setOpenFile(contents, fileName);
    await missionWorkspaceLocator(page, "entryImport").click();

    const importReview = missionWorkspaceLocator(page, "importReview");
    const readyState = missionWorkspaceLocator(page, "ready");
    await Promise.race([
        importReview.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined),
        readyState.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined),
    ]);

    if (await importReview.isVisible().catch(() => false)) {
        note(history, `Apply the explicit import review for ${fileName} before expecting mounted planner content.`);
        await missionWorkspaceLocator(page, "importReviewConfirm").click();
    }

    await expect(
        missionWorkspaceLocator(page, "ready"),
        historyMessage(history, `${fileName} never mounted into the Mission workspace after import.`),
    ).toBeVisible();
}

function complexItemTypes(plan: SavedPlanJson): string[] {
    return (plan.mission?.items ?? [])
        .filter((item) => item.type === "ComplexItem")
        .map((item) => String(item.complexItemType));
}

test.describe("mocked survey authoring workflow", () => {
    for (const preset of authoredViewportScenarios) {
        test(`proves grid, corridor, and structure authoring on the ${preset} shell`, async ({ page, mockPlatform }) => {
            test.slow();
            const history: string[] = [];

            await connectAndOpenMissionWorkspace(page, mockPlatform as MockPlatformHarness, preset, history);
            await startBlankMission(page, history);
            await addManualWaypoint(page, history);

            const gridRegionId = await drawSurveyRegion(page, history, "grid");
            await selectBuiltinCamera(page, history);
            await generateSelectedSurvey(page, history, "grid");
            await verifyCancelledRegenerateAndDissolve(page, history, gridRegionId);
            await proveRegenerateAndDissolveHistoryRecovery(page, history, gridRegionId);

            await drawSurveyRegion(page, history, "corridor");
            await stabilizeCorridorGeometry(page, history);
            await selectBuiltinCamera(page, history);
            await generateSelectedSurvey(page, history, "corridor");

            await drawSurveyRegion(page, history, "structure");
            await stabilizeStructureGeometry(page, history);
            await selectBuiltinCamera(page, history);
            await generateSelectedSurvey(page, history, "structure");

            note(history, "Confirm the mixed workspace now contains one manual item and three persisted survey cards.");
            await expect(missionWorkspaceLocator(page, "countsMission")).toContainText("1");
            await expect(missionWorkspaceLocator(page, "countsSurvey")).toContainText("3");
            await expect(
                page.locator(surveyCardSelector),
                historyMessage(history, `The ${preset} workflow did not leave three persisted survey cards in the mixed workspace.`),
            ).toHaveCount(3);

            const debugSnapshot = await requireMissionMapDebugSnapshot(page, `${preset} authoring final snapshot`);
            expect(
                debugSnapshot.surveyPreviewFeatureCount,
                historyMessage(history, `The ${preset} workflow never left preview overlay diagnostics mounted.`),
            ).toBeGreaterThan(0);
            expect(debugSnapshot.selectedSurveyGenerationBlocked).toBe(false);

            const exported = await exportPlan(page, mockPlatform as MockPlatformHarness, `${preset}-survey-authoring.plan`, history);
            expect(
                exported.mission?.items?.some((item) => item.type === "SimpleItem"),
                historyMessage(history, `The ${preset} export lost the authored manual mission item.`),
            ).toBe(true);
            expect(complexItemTypes(exported)).toEqual(["survey", "CorridorScan", "StructureScan"]);
        });
    }

    for (const scenario of fixtureScenarios) {
        test(`round-trips truthful ${scenario.key} ComplexItems through import/export on the active Mission path`, async ({
            page,
            mockPlatform,
        }) => {
            const history: string[] = [];

            await connectAndOpenMissionWorkspace(page, mockPlatform as MockPlatformHarness, "desktop", history);
            await importFixturePlan(page, mockPlatform as MockPlatformHarness, history, scenario.fileName, scenario.contents);

            if (typeof scenario.blockedRegionIndex === "number") {
                note(history, `Select imported ${scenario.key} block ${scenario.blockedRegionIndex + 1} to verify blocked regenerate.`);
                const blockedRegion = page.locator(surveyCardSelector).nth(scenario.blockedRegionIndex);
                await blockedRegion.scrollIntoViewIfNeeded();
                await blockedRegion.click();
                await expect(missionWorkspaceLocator(page, "inspectorSelectionKind")).toContainText("survey-block");
                await expect(missionWorkspaceLocator(page, "surveyGenerate")).toBeDisabled();
                await expect(missionWorkspaceLocator(page, "cameraCurrent")).toContainText("Choose a valid camera");
                await expect(missionWorkspaceLocator(page, "inspectorSurvey")).toContainText(scenario.blockedCameraName!);

                const debugSnapshot = await requireMissionMapDebugSnapshot(page, `${scenario.key} blocked regenerate`);
                expect(debugSnapshot.selectedSurveyGenerationBlocked).toBe(true);
                expect(debugSnapshot.selectedSurveyGenerationMessage ?? "").toContain("Choose a valid camera");
            }

            const exported = await exportPlan(page, mockPlatform as MockPlatformHarness, `${scenario.key}-roundtrip.plan`, history);
            const items = exported.mission?.items ?? [];
            expect(complexItemTypes(exported)).toEqual(scenario.expectedComplexTypes);
            scenario.assertRoundTrip(items);
        });
    }
});

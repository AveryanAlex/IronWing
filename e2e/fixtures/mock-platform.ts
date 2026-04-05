import { missionWorkspaceTestIds } from "../../src/components/mission/mission-workspace-test-ids";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { OpenSessionSnapshot } from "../../src/session";
import type {
    MockCommandBehavior,
    MockGuidedStateValue,
    MockInvocation,
    MockLiveVehicleState,
    MockMissionProgressState,
    MockMissionState,
    MockPlatformEvent,
    MockParamProgressState,
    MockParamStoreState,
} from "../../src/platform/mock/backend";

export const runtimeSelectors = {
    shell: '[data-testid="app-shell"]',
    heading: '[data-testid="app-shell-heading"]',
    runtimeMarker: '[data-testid="app-runtime-marker"]',
    framework: '[data-testid="app-runtime-framework"]',
    bootstrapState: '[data-testid="app-bootstrap-state"]',
    bootedAt: '[data-testid="app-runtime-booted-at"]',
    entrypoint: '[data-testid="app-runtime-entrypoint"]',
    quarantineBoundary: '[data-testid="app-runtime-quarantine-boundary"]',
    bootstrapFailure: '[data-testid="app-bootstrap-failure"]',
    bootstrapFailureMessage: '[data-testid="app-bootstrap-failure-message"]',
    shellTier: '[data-testid="app-shell-tier"]',
    drawerState: '[data-testid="app-shell-drawer-state"]',
    vehiclePanelButton: '[data-testid="app-shell-vehicle-panel-btn"]',
    vehiclePanelRail: '[data-testid="app-shell-vehicle-panel-rail"]',
    vehiclePanelDrawer: '[data-testid="app-shell-vehicle-panel-drawer"]',
    vehiclePanelClose: '[data-testid="app-shell-vehicle-panel-close"]',
} as const;

export const connectionSelectors = {
    statusText: '[data-testid="connection-status-text"]',
    transportSelect: '[data-testid="connection-transport-select"]',
    tcpAddress: '[data-testid="connection-tcp-address"]',
    connectButton: '[data-testid="connection-connect-btn"]',
    cancelButton: '[data-testid="connection-cancel-btn"]',
    disconnectButton: '[data-testid="connection-disconnect-btn"]',
    errorMessage: '[data-testid="connection-error-message"]',
    diagnosticsLastPhase: '[data-testid="connection-diagnostics-last-phase"]',
    diagnosticsActiveSource: '[data-testid="connection-diagnostics-active-source"]',
    diagnosticsEnvelope: '[data-testid="connection-diagnostics-envelope"]',
    diagnosticsBootstrap: '[data-testid="connection-diagnostics-bootstrap"]',
} as const;

export const liveSurfaceSelectors = {
    stateValue: '[data-testid="telemetry-state-value"]',
    modeValue: '[data-testid="telemetry-mode-value"]',
    altitudeValue: '[data-testid="telemetry-alt-value"]',
    speedValue: '[data-testid="telemetry-speed-value"]',
    batteryValue: '[data-testid="telemetry-battery-value"]',
    headingValue: '[data-testid="telemetry-heading-value"]',
    gpsText: '[data-testid="telemetry-gps-text"]',
} as const;

export const operatorWorkspaceSelectors = {
    root: '[data-testid="app-shell-operator-workspace"]',
    primary: '[data-testid="operator-workspace-primary"]',
    metrics: '[data-testid="operator-workspace-metrics"]',
    secondary: '[data-testid="operator-workspace-secondary"]',
    notices: '[data-testid="operator-workspace-notices"]',
    attention: '[data-testid="operator-workspace-attention"]',
    summary: '[data-testid="operator-workspace-summary"]',
    quality: '[data-testid="operator-workspace-quality"]',
    readiness: '[data-testid="operator-workspace-readiness"]',
    stale: '[data-testid="operator-workspace-stale"]',
    disconnected: '[data-testid="operator-workspace-disconnected"]',
    degradedTelemetry: '[data-testid="operator-workspace-degraded-telemetry"]',
    degradedSupport: '[data-testid="operator-workspace-degraded-support"]',
    degradedNotices: '[data-testid="operator-workspace-degraded-notices"]',
    lastError: '[data-testid="operator-workspace-last-error"]',
    noticeCount: '[data-testid="operator-workspace-notice-count"]',
    noticesEmpty: '[data-testid="operator-workspace-notices-empty"]',
} as const;

export const parameterWorkspaceSelectors = {
    workspaceButton: '[data-testid="app-shell-parameter-workspace-btn"]',
    root: '[data-testid="parameter-workspace"]',
    state: '[data-testid="parameter-workspace-state"]',
    scope: '[data-testid="parameter-domain-scope"]',
    progress: '[data-testid="parameter-domain-progress"]',
    metadata: '[data-testid="parameter-domain-metadata"]',
    notice: '[data-testid="parameter-domain-notice"]',
    pendingCount: '[data-testid="parameter-workspace-pending-count"]',
    advancedButton: '[data-testid="parameter-workspace-advanced-button"]',
    advancedBackButton: '[data-testid="parameter-workspace-advanced-back"]',
    advancedPanel: '[data-testid="parameter-workspace-advanced-panel"]',
    expertMetadataFallback: '[data-testid="parameter-expert-metadata-fallback"]',
    expertHighlightSummary: '[data-testid="parameter-expert-highlight-summary"]',
    expertFileActions: '[data-testid="parameter-expert-file-actions"]',
    expertFileImportButton: '[data-testid="parameter-expert-file-import"]',
    expertFileExportButton: '[data-testid="parameter-expert-file-export"]',
    expertFileStatus: '[data-testid="parameter-expert-file-status"]',
    expertFileMessage: '[data-testid="parameter-expert-file-message"]',
    reviewTray: '[data-testid="app-shell-parameter-review-tray"]',
    reviewSurface: '[data-testid="app-shell-parameter-review-surface"]',
    reviewCount: '[data-testid="app-shell-parameter-review-count"]',
    reviewSummary: '[data-testid="app-shell-parameter-review-summary"]',
    reviewProgress: '[data-testid="app-shell-parameter-review-progress"]',
    reviewWarning: '[data-testid="app-shell-parameter-review-warning"]',
    reviewToggle: '[data-testid="app-shell-parameter-review-toggle"]',
    reviewApply: '[data-testid="app-shell-parameter-review-apply"]',
} as const;

export const telemetrySettingsSelectors = {
    launcher: '[data-testid="app-shell-telemetry-settings-launcher"]',
    dialog: '[data-testid="app-shell-telemetry-settings-dialog"]',
    surface: '[data-testid="app-shell-telemetry-settings-surface"]',
    close: '[data-testid="app-shell-telemetry-settings-close"]',
    status: '[data-testid="app-shell-telemetry-settings-status"]',
    apply: '[data-testid="app-shell-telemetry-settings-apply"]',
    discard: '[data-testid="app-shell-telemetry-settings-discard"]',
    telemetryInput: '[data-testid="app-shell-telemetry-settings-telemetry-input"]',
    telemetryError: '[data-testid="app-shell-telemetry-settings-telemetry-error"]',
} as const;

export const missionWorkspaceSelectors = {
    root: `[data-testid="${missionWorkspaceTestIds.root}"]`,
    header: `[data-testid="${missionWorkspaceTestIds.header}"]`,
    state: `[data-testid="${missionWorkspaceTestIds.state}"]`,
    scope: `[data-testid="${missionWorkspaceTestIds.scope}"]`,
    summary: `[data-testid="${missionWorkspaceTestIds.summary}"]`,
    inlineStatus: `[data-testid="${missionWorkspaceTestIds.inlineStatus}"]`,
    inlineStatusMessage: `[data-testid="${missionWorkspaceTestIds.inlineStatusMessage}"]`,
    inlineStatusDetail: `[data-testid="${missionWorkspaceTestIds.inlineStatusDetail}"]`,
    error: `[data-testid="${missionWorkspaceTestIds.error}"]`,
    localNote: `[data-testid="${missionWorkspaceTestIds.localNote}"]`,
    warningFile: `[data-testid="${missionWorkspaceTestIds.warningFile}"]`,
    warningValidation: `[data-testid="${missionWorkspaceTestIds.warningValidation}"]`,
    countsMission: `[data-testid="${missionWorkspaceTestIds.countsMission}"]`,
    countsSurvey: `[data-testid="${missionWorkspaceTestIds.countsSurvey}"]`,
    countsValidation: `[data-testid="${missionWorkspaceTestIds.countsValidation}"]`,
    countsWarnings: `[data-testid="${missionWorkspaceTestIds.countsWarnings}"]`,
    empty: `[data-testid="${missionWorkspaceTestIds.empty}"]`,
    ready: `[data-testid="${missionWorkspaceTestIds.ready}"]`,
    entryRead: `[data-testid="${missionWorkspaceTestIds.entryRead}"]`,
    entryImport: `[data-testid="${missionWorkspaceTestIds.entryImport}"]`,
    entryNew: `[data-testid="${missionWorkspaceTestIds.entryNew}"]`,
    toolbarRead: `[data-testid="${missionWorkspaceTestIds.toolbarRead}"]`,
    toolbarImport: `[data-testid="${missionWorkspaceTestIds.toolbarImport}"]`,
    toolbarNew: `[data-testid="${missionWorkspaceTestIds.toolbarNew}"]`,
    toolbarExport: `[data-testid="${missionWorkspaceTestIds.toolbarExport}"]`,
    toolbarValidate: `[data-testid="${missionWorkspaceTestIds.toolbarValidate}"]`,
    toolbarUpload: `[data-testid="${missionWorkspaceTestIds.toolbarUpload}"]`,
    toolbarClear: `[data-testid="${missionWorkspaceTestIds.toolbarClear}"]`,
    toolbarCancel: `[data-testid="${missionWorkspaceTestIds.toolbarCancel}"]`,
    prompt: `[data-testid="${missionWorkspaceTestIds.prompt}"]`,
    promptKind: `[data-testid="${missionWorkspaceTestIds.promptKind}"]`,
    promptConfirm: `[data-testid="${missionWorkspaceTestIds.promptConfirm}"]`,
    promptDismiss: `[data-testid="${missionWorkspaceTestIds.promptDismiss}"]`,
    homeLatitude: `[data-testid="${missionWorkspaceTestIds.homeLatitude}"]`,
    homeLongitude: `[data-testid="${missionWorkspaceTestIds.homeLongitude}"]`,
    homeAltitude: `[data-testid="${missionWorkspaceTestIds.homeAltitude}"]`,
    homeSummary: `[data-testid="${missionWorkspaceTestIds.homeSummary}"]`,
    map: `[data-testid="${missionWorkspaceTestIds.map}"]`,
    mapSurface: `[data-testid="${missionWorkspaceTestIds.mapSurface}"]`,
    mapStatus: `[data-testid="${missionWorkspaceTestIds.mapStatus}"]`,
    mapSelection: `[data-testid="${missionWorkspaceTestIds.mapSelection}"]`,
    mapDragState: `[data-testid="${missionWorkspaceTestIds.mapDragState}"]`,
    mapMarkerCount: `[data-testid="${missionWorkspaceTestIds.mapMarkerCount}"]`,
    mapSurveyCount: `[data-testid="${missionWorkspaceTestIds.mapSurveyCount}"]`,
    mapDebug: `[data-testid="${missionWorkspaceTestIds.mapDebug}"]`,
    listAdd: `[data-testid="${missionWorkspaceTestIds.listAdd}"]`,
    inspectorSelectionKind: `[data-testid="${missionWorkspaceTestIds.inspectorSelectionKind}"]`,
    inspectorReadonly: `[data-testid="${missionWorkspaceTestIds.inspectorReadonly}"]`,
    inspectorCommandSelect: `[data-testid="${missionWorkspaceTestIds.inspectorCommandSelect}"]`,
    inspectorLatitude: `[data-testid="${missionWorkspaceTestIds.inspectorLatitude}"]`,
    inspectorLongitude: `[data-testid="${missionWorkspaceTestIds.inspectorLongitude}"]`,
    inspectorAltitude: `[data-testid="${missionWorkspaceTestIds.inspectorAltitude}"]`,
    missionMarker: `[data-testid^="${missionWorkspaceTestIds.mapMarkerPrefix}-"]`,
    surveyHandle: `[data-testid^="${missionWorkspaceTestIds.mapSurveyPrefix}-"]`,
} as const;

export const shellViewportPresets = {
    desktop: {
        width: 1440,
        height: 900,
        tier: "wide",
        drawerState: "docked",
        label: "desktop shell",
    },
    radiomaster: {
        width: 1280,
        height: 720,
        tier: "wide",
        drawerState: "docked",
        label: "Radiomaster 1280x720 shell",
    },
    phone: {
        width: 390,
        height: 844,
        tier: "phone",
        drawerState: "closed",
        label: "phone shell",
    },
} as const;

export type ShellViewportPresetName = keyof typeof shellViewportPresets;
export type ShellViewportPreset = (typeof shellViewportPresets)[ShellViewportPresetName];

type MockPlatformFixture = {
    reset: () => Promise<void>;
    setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
    clearCommandBehavior: (cmd: string) => Promise<void>;
    resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => Promise<boolean>;
    rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => Promise<boolean>;
    emit: (event: string, payload: unknown) => Promise<void>;
    emitLiveSessionState: (vehicleState: MockLiveVehicleState) => Promise<void>;
    emitLiveTelemetryDomain: (telemetry: OpenSessionSnapshot["telemetry"]) => Promise<void>;
    emitLiveSupportDomain: (support: OpenSessionSnapshot["support"]) => Promise<void>;
    emitLiveStatusTextDomain: (statusText: OpenSessionSnapshot["status_text"]) => Promise<void>;
    emitMissionState: (missionState: MockMissionState) => Promise<void>;
    emitMissionProgress: (missionProgress: MockMissionProgressState) => Promise<void>;
    emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
    emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
    emitLiveGuidedState: (guidedState: MockGuidedStateValue) => Promise<void>;
    resolveDeferredConnectLink: (params: {
        vehicleState: MockLiveVehicleState;
        missionState?: MockMissionState;
        paramStore?: MockParamStoreState;
        paramProgress?: MockParamProgressState;
        guidedState: MockGuidedStateValue;
    }) => Promise<boolean>;
    getInvocations: () => Promise<MockInvocation[]>;
    getLiveEnvelope: () => Promise<{
        session_id: string;
        source_kind: "live" | "playback";
        seek_epoch: number;
        reset_revision: number;
    } | null>;
    setOpenFile: (contents: string, name?: string) => Promise<void>;
    cancelOpenFile: (message?: string) => Promise<void>;
    failOpenFile: (message: string) => Promise<void>;
    setSaveFileName: (name: string) => Promise<void>;
    cancelSaveFile: (message?: string) => Promise<void>;
    failSaveFile: (message: string) => Promise<void>;
    clearSavedFiles: () => Promise<void>;
    getSavedFiles: () => Promise<Array<{ name: string; contents: string }>>;
    waitForRuntimeSurface: () => Promise<void>;
    waitForOperatorWorkspace: () => Promise<void>;
};

type Fixtures = {
    mockPlatform: MockPlatformFixture;
};

function resolveShellViewportPreset(presetName: ShellViewportPresetName): ShellViewportPreset {
    const preset = shellViewportPresets[presetName];
    if (!preset) {
        throw new Error(
            `Unsupported shell viewport preset: ${presetName}. Use one of: ${Object.keys(shellViewportPresets).join(", ")}.`,
        );
    }
    return preset;
}

async function waitForMockController(page: Page) {
    await page.waitForFunction(() => Boolean(window.__IRONWING_MOCK_PLATFORM__), undefined, {
        timeout: 10_000,
    });
}

async function waitForRuntimeSurface(page: Page) {
    await page.waitForFunction(
        (selectors) => Boolean(document.querySelector(selectors.shell) || document.querySelector(selectors.bootstrapFailure)),
        runtimeSelectors,
        {
            timeout: 10_000,
        },
    );
}

async function waitForOperatorWorkspace(page: Page) {
    await waitForRuntimeSurface(page);
    await expect(
        page.locator(operatorWorkspaceSelectors.root),
        "The operator workspace did not mount; keep e2e/fixtures/mock-platform.ts aligned with the shipped shell test ids.",
    ).toBeVisible();
}

async function withMockController<T>(page: Page, callback: string, ...args: unknown[]) {
    await waitForMockController(page);

    return page.evaluate(
        ([methodName, values]) => {
            const controller = window.__IRONWING_MOCK_PLATFORM__;
            if (!controller) {
                throw new Error("Mock platform controller is not available");
            }

            const method = controller[methodName as keyof typeof controller] as (...methodArgs: unknown[]) => T;
            return method(...values);
        },
        [callback, args],
    );
}

async function withMockFilePicker<T>(page: Page, callback: string, ...args: unknown[]) {
    return page.evaluate(
        ([rawMethodName, rawValues]) => {
            const [methodName, values] = [rawMethodName, rawValues] as [string, unknown[]];
            const filePicker = (window as typeof window & {
                __IRONWING_FILE_PICKER__?: Record<string, (...methodArgs: unknown[]) => unknown>;
            }).__IRONWING_FILE_PICKER__;
            if (!filePicker) {
                throw new Error("Mock file picker harness is not available");
            }

            const method = filePicker[methodName] as (...methodArgs: unknown[]) => T;
            if (typeof method !== "function") {
                throw new Error(`Mock file picker method is not available: ${methodName}`);
            }

            return method(...values);
        },
        [callback, args],
    );
}

function installMockFilePicker(page: Page) {
    return page.addInitScript(() => {
        type FilePickerState = {
            openMode: "resolve" | "cancel" | "reject";
            openContents: string;
            openName: string;
            openMessage: string;
            saveMode: "resolve" | "cancel" | "reject";
            saveName: string;
            saveMessage: string;
            savedFiles: Array<{ name: string; contents: string }>;
            setOpenFile: (contents: string, name?: string) => void;
            cancelOpenFile: (message?: string) => void;
            failOpenFile: (message: string) => void;
            setSaveFileName: (name: string) => void;
            cancelSaveFile: (message?: string) => void;
            failSaveFile: (message: string) => void;
            clearSavedFiles: () => void;
            getSavedFiles: () => Array<{ name: string; contents: string }>;
        };

        const mockWindow = window as typeof window & {
            __IRONWING_FILE_PICKER__?: FilePickerState;
            showOpenFilePicker?: (options?: { suggestedName?: string }) => Promise<Array<{ getFile: () => Promise<File> }>>;
            showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
                name?: string;
                createWritable: () => Promise<{ write: (contents: unknown) => Promise<void>; close: () => Promise<void> }>;
            }>;
        };

        const state: FilePickerState = {
            openMode: "resolve",
            openContents: "",
            openName: "import.param",
            openMessage: "The user aborted a request.",
            saveMode: "resolve" as const,
            saveName: "ironwing-parameters.param",
            saveMessage: "The user aborted a request.",
            savedFiles: [] as Array<{ name: string; contents: string }>,
            setOpenFile(contents: string, name = "import.param") {
                state.openMode = "resolve";
                state.openContents = contents;
                state.openName = name;
            },
            cancelOpenFile(message = "The user aborted a request.") {
                state.openMode = "cancel";
                state.openMessage = message;
            },
            failOpenFile(message: string) {
                state.openMode = "reject";
                state.openMessage = message;
            },
            setSaveFileName(name: string) {
                state.saveMode = "resolve";
                state.saveName = name;
            },
            cancelSaveFile(message = "The user aborted a request.") {
                state.saveMode = "cancel";
                state.saveMessage = message;
            },
            failSaveFile(message: string) {
                state.saveMode = "reject";
                state.saveMessage = message;
            },
            clearSavedFiles() {
                state.savedFiles = [];
            },
            getSavedFiles() {
                return state.savedFiles.slice();
            },
        };

        mockWindow.__IRONWING_FILE_PICKER__ = state;
        mockWindow.showOpenFilePicker = async () => {
            if (state.openMode === "cancel") {
                throw new DOMException(state.openMessage, "AbortError");
            }
            if (state.openMode === "reject") {
                throw new Error(state.openMessage);
            }

            const file = new File([state.openContents], state.openName, { type: "text/plain" });
            return [{ getFile: async () => file }];
        };
        mockWindow.showSaveFilePicker = async (options) => {
            if (state.saveMode === "cancel") {
                throw new DOMException(state.saveMessage, "AbortError");
            }
            if (state.saveMode === "reject") {
                throw new Error(state.saveMessage);
            }

            const name = state.saveName || options?.suggestedName || "ironwing-parameters.param";
            return {
                name,
                createWritable: async () => ({
                    write: async (contents: unknown) => {
                        state.savedFiles.push({ name, contents: typeof contents === "string" ? contents : String(contents) });
                    },
                    close: async () => undefined,
                }),
            };
        };
    });
}

async function emitLiveScopedDomain<T>(
    page: Page,
    event: "telemetry://state" | "support://state" | "status_text://state",
    value: T,
): Promise<void> {
    const envelope = await withMockController<{
        session_id: string;
        source_kind: "live" | "playback";
        seek_epoch: number;
        reset_revision: number;
    } | null>(page, "getLiveEnvelope");

    if (!envelope) {
        throw new Error(`Cannot emit ${event} before a live session envelope exists.`);
    }

    await withMockController(page, "emit", event, { envelope, value });
}

export async function assertShellViewport(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
    const preset = resolveShellViewportPreset(presetName);

    await expect
        .poll(() => page.viewportSize()?.width ?? 0, {
            message: `${preset.label} should apply width ${preset.width}px before shell assertions continue.`,
        })
        .toBe(preset.width);
    await expect
        .poll(() => page.viewportSize()?.height ?? 0, {
            message: `${preset.label} should apply height ${preset.height}px before shell assertions continue.`,
        })
        .toBe(preset.height);
    await expect
        .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })), {
            message: `${preset.label} should reach the app with the same viewport dimensions Playwright set.`,
        })
        .toEqual({ width: preset.width, height: preset.height });

    return preset;
}

export async function applyShellViewport(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
    const preset = resolveShellViewportPreset(presetName);
    await page.setViewportSize({ width: preset.width, height: preset.height });
    await assertShellViewport(page, presetName);
    return preset;
}

export async function expectRuntimeDiagnostics(page: Page): Promise<void> {
    await expect(
        page.locator(runtimeSelectors.shell),
        "The active runtime shell did not mount; runtime diagnostics should stay available under the shared shell test ids.",
    ).toHaveAttribute("data-runtime-phase", "ready");
    await expect(page.locator(runtimeSelectors.framework)).toContainText("Svelte 5");
    await expect(page.locator(runtimeSelectors.bootstrapState)).toContainText("ready");
    await expect(page.locator(runtimeSelectors.bootedAt)).not.toContainText("Starting up");
    await expect(page.locator(runtimeSelectors.entrypoint)).toContainText("src/app/App.svelte");
    await expect(page.locator(runtimeSelectors.quarantineBoundary)).toContainText("src-old/runtime");
}

export async function expectShellChrome(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
    const preset = await assertShellViewport(page, presetName);

    await expect(
        page.locator(runtimeSelectors.shellTier),
        `${preset.label} should report the ${preset.tier} shell tier through the shared shell diagnostics card.`,
    ).toContainText(preset.tier);
    await expect(
        page.locator(runtimeSelectors.drawerState),
        `${preset.label} should report the ${preset.drawerState} vehicle-panel state through the shared shell diagnostics card.`,
    ).toContainText(preset.drawerState);

    return preset;
}

export async function expectOperatorWorkspace(page: Page): Promise<void> {
    await expect(
        page.locator(operatorWorkspaceSelectors.root),
        "The operator workspace root is missing; keep the shared operator selectors in e2e/fixtures/mock-platform.ts aligned with the shell markup.",
    ).toBeVisible();
}

export async function openMissionWorkspace(page: Page): Promise<void> {
    const missionButton = page.getByRole("button", { name: "Mission" });
    await expect(
        missionButton,
        "Mission workspace entry point is missing; keep the shared shell workspace labels aligned with the shipped header tabs.",
    ).toBeVisible();
    await missionButton.click();
    await expectMissionWorkspace(page);
}

export async function expectMissionWorkspace(page: Page): Promise<void> {
    await expect(
        page.locator(missionWorkspaceSelectors.root),
        "The mission workspace root is missing; keep the shared mission selectors in e2e/fixtures/mock-platform.ts aligned with the shipped planner markup.",
    ).toBeVisible();
}

export function missionWorkspaceLocator(page: Page, selector: keyof typeof missionWorkspaceSelectors): Locator {
    return page.locator(missionWorkspaceSelectors[selector]);
}

export async function readMissionMapDebugSnapshot(page: Page): Promise<unknown> {
    return page.evaluate(() => {
        return (window as Window & { __IRONWING_MISSION_MAP_DEBUG__?: unknown }).__IRONWING_MISSION_MAP_DEBUG__ ?? null;
    });
}

export function operatorWorkspaceLocator(page: Page, selector: keyof typeof operatorWorkspaceSelectors): Locator {
    return page.locator(operatorWorkspaceSelectors[selector]);
}

export function liveSurfaceLocator(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
    return page.locator(liveSurfaceSelectors[selector]);
}

export function liveSurfaceValueLocator(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
    return liveSurfaceLocator(page, selector).locator("dd");
}

export function operatorNoticeListLocator(page: Page): Locator {
    return page.locator(`${operatorWorkspaceSelectors.notices} .operator-workspace__notice`);
}

export function operatorNoticeLocator(page: Page, text: string): Locator {
    return operatorNoticeListLocator(page).filter({ hasText: text });
}

export function parameterInputLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="parameter-workspace-input-${name}"]`);
}

export function parameterStageButtonLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="parameter-workspace-stage-btn-${name}"]`);
}

export function parameterReviewRowLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="app-shell-parameter-review-row-${name}"]`);
}

export function parameterReviewFailureLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="app-shell-parameter-review-failure-${name}"]`);
}

export function telemetrySettingsRowLocator(page: Page, messageId: number): Locator {
    return page.locator(`[data-testid="app-shell-telemetry-settings-row-${messageId}"]`);
}

export function telemetrySettingsRowInputLocator(page: Page, messageId: number): Locator {
    return page.locator(`[data-testid="app-shell-telemetry-settings-row-input-${messageId}"]`);
}

export function telemetrySettingsRowErrorLocator(page: Page, messageId: number): Locator {
    return page.locator(`[data-testid="app-shell-telemetry-settings-row-error-${messageId}"]`);
}

export async function openTelemetrySettings(page: Page): Promise<void> {
    const launcher = page.locator(telemetrySettingsSelectors.launcher);
    await expect(
        launcher,
        "Telemetry controls launcher is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the shipped vehicle panel markup.",
    ).toBeVisible();
    await launcher.click();
    await expect(
        page.locator(telemetrySettingsSelectors.dialog),
        "Telemetry controls dialog did not open; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the shipped shell dialog seam.",
    ).toBeVisible();
}

export function parameterReviewRetryLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="app-shell-parameter-review-retry-${name}"]`);
}

export async function openParameterWorkspace(page: Page): Promise<void> {
    const workspaceButton = page.locator(parameterWorkspaceSelectors.workspaceButton);
    await expect(
        workspaceButton,
        "Parameter workspace entry point is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the shell header.",
    ).toBeVisible();
    await workspaceButton.click();
    await expect(
        page.locator(parameterWorkspaceSelectors.root),
        "Parameter workspace did not mount after selecting Setup.",
    ).toBeVisible();
}

export async function stageParameterValue(page: Page, name: string, value: string): Promise<void> {
    let input = parameterInputLocator(page, name);
    let stageButton = parameterStageButtonLocator(page, name);

    if (await input.count() === 0) {
        const advancedButton = page.locator(parameterWorkspaceSelectors.advancedButton);
        await expect(
            advancedButton,
            `Parameter input ${name} is not visible in the workflow-first default view. Advanced parameters must stay reachable through the shared workspace entry point.`,
        ).toBeVisible();
        await advancedButton.click();
        await expect(
            page.locator(parameterWorkspaceSelectors.advancedPanel),
            "Advanced parameters did not open before the mocked-browser helper tried to stage a raw edit.",
        ).toBeVisible();
        input = parameterInputLocator(page, name);
        stageButton = parameterStageButtonLocator(page, name);
    }

    await expect(
        input,
        `Parameter input ${name} is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the workspace markup.`,
    ).toBeVisible();
    await input.fill(value);
    await expect(
        stageButton,
        `Stage button for ${name} is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the workspace markup.`,
    ).toBeVisible();
    await stageButton.click();
}

export async function expectDockedVehiclePanel(page: Page, presetName: Extract<ShellViewportPresetName, "desktop" | "radiomaster">): Promise<void> {
    const preset = await expectShellChrome(page, presetName);

    await expectOperatorWorkspace(page);
    await expect(
        page.locator(runtimeSelectors.vehiclePanelRail),
        `${preset.label} should keep the vehicle panel docked on the shell rail instead of hiding it behind the phone drawer.`,
    ).toBeVisible();
    await expect(
        page.locator(runtimeSelectors.vehiclePanelButton),
        `${preset.label} should not render the phone-only Vehicle panel drawer button.`,
    ).toHaveCount(0);
    await expect(
        page.locator(connectionSelectors.connectButton),
        `${preset.label} should keep the connection surface docked and immediately reachable.`,
    ).toBeVisible();
}

export async function openVehiclePanelDrawer(page: Page): Promise<void> {
    const drawerButton = page.locator(runtimeSelectors.vehiclePanelButton);
    const drawer = page.locator(runtimeSelectors.vehiclePanelDrawer);
    const connectButton = page.locator(connectionSelectors.connectButton);

    await expect(
        drawerButton,
        "Phone tier must expose a Vehicle panel button; if this fails, update the shared shell selectors in e2e/fixtures/mock-platform.ts instead of hard-coding coordinates in the spec.",
    ).toBeVisible();
    await expect(
        drawer,
        "Phone tier should keep the drawer shell mounted in the closed state so responsive assertions stay truthful.",
    ).toHaveAttribute("data-state", "closed");
    await expect(
        connectButton,
        "Phone tier should keep the connection surface out of reach until the Vehicle panel drawer is opened.",
    ).toHaveCount(0);

    await drawerButton.click();

    await expect(
        drawer,
        "Opening the Vehicle panel should switch the shared shell drawer into the open state.",
    ).toHaveAttribute("data-state", "open");
    await expect(
        page.locator(runtimeSelectors.drawerState),
        "Opening the Vehicle panel should update the shell diagnostics card to the open state.",
    ).toContainText("open");
    await expect(
        connectButton,
        "Vehicle panel drawer opened, but the connection surface is still unreachable. Keep selectors in e2e/fixtures/mock-platform.ts aligned with the shell.",
    ).toBeVisible();
}

export async function closeVehiclePanelDrawer(page: Page): Promise<void> {
    const drawer = page.locator(runtimeSelectors.vehiclePanelDrawer);
    const closeButton = page.locator(runtimeSelectors.vehiclePanelClose);
    const connectButton = page.locator(connectionSelectors.connectButton);

    await expect(
        closeButton,
        "Phone drawer close control is missing; keep the shared shell selectors in e2e/fixtures/mock-platform.ts aligned with the drawer markup.",
    ).toBeVisible();
    await closeButton.click();
    await expect(drawer, "Closing the Vehicle panel should collapse the drawer surface.").toHaveAttribute(
        "data-state",
        "closed",
    );
    await expect(
        page.locator(runtimeSelectors.drawerState),
        "Closing the Vehicle panel should update the shell diagnostics card to the closed state.",
    ).toContainText("closed");
    await expect(
        connectButton,
        "Closing the Vehicle panel should make the connection surface unreachable again on phone layouts.",
    ).toHaveCount(0);
}

export const test = base.extend<Fixtures>({
    mockPlatform: async ({ page }, use) => {
        await installMockFilePicker(page);

        await use({
            reset: () => withMockController(page, "reset"),
            setCommandBehavior: (cmd, behavior) => withMockController(page, "setCommandBehavior", cmd, behavior),
            clearCommandBehavior: (cmd) => withMockController(page, "clearCommandBehavior", cmd),
            resolveDeferred: (cmd, result, emit) => withMockController(page, "resolveDeferred", cmd, result, emit ?? []),
            rejectDeferred: (cmd, error, emit) => withMockController(page, "rejectDeferred", cmd, error, emit ?? []),
            emit: (event, payload) => withMockController(page, "emit", event, payload),
            emitLiveSessionState: (vehicleState) => withMockController(page, "emitLiveSessionState", vehicleState),
            emitLiveTelemetryDomain: (telemetry) => emitLiveScopedDomain(page, "telemetry://state", telemetry),
            emitLiveSupportDomain: (support) => emitLiveScopedDomain(page, "support://state", support),
            emitLiveStatusTextDomain: (statusText) => emitLiveScopedDomain(page, "status_text://state", statusText),
            emitMissionState: (missionState) => withMockController(page, "emitMissionState", missionState),
            emitMissionProgress: (missionProgress) => withMockController(page, "emitMissionProgress", missionProgress),
            emitParamStore: (paramStore) => withMockController(page, "emitParamStore", paramStore),
            emitParamProgress: (paramProgress) => withMockController(page, "emitParamProgress", paramProgress),
            emitLiveGuidedState: (guidedState) => withMockController(page, "emitLiveGuidedState", guidedState),
            resolveDeferredConnectLink: (params) => withMockController(page, "resolveDeferredConnectLink", params),
            getInvocations: () => withMockController(page, "getInvocations"),
            getLiveEnvelope: () => withMockController(page, "getLiveEnvelope"),
            setOpenFile: (contents, name) => withMockFilePicker(page, "setOpenFile", contents, name),
            cancelOpenFile: (message) => withMockFilePicker(page, "cancelOpenFile", message),
            failOpenFile: (message) => withMockFilePicker(page, "failOpenFile", message),
            setSaveFileName: (name) => withMockFilePicker(page, "setSaveFileName", name),
            cancelSaveFile: (message) => withMockFilePicker(page, "cancelSaveFile", message),
            failSaveFile: (message) => withMockFilePicker(page, "failSaveFile", message),
            clearSavedFiles: () => withMockFilePicker(page, "clearSavedFiles"),
            getSavedFiles: () => withMockFilePicker(page, "getSavedFiles"),
            waitForRuntimeSurface: () => waitForRuntimeSurface(page),
            waitForOperatorWorkspace: () => waitForOperatorWorkspace(page),
        });
    },
});

export { expect };

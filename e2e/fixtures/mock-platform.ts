import { firmwareWorkspaceTestIds } from "../../src/components/firmware/firmware-workspace-test-ids";
import { missionWorkspaceTestIds } from "../../src/components/mission/mission-workspace-test-ids";
import type { MissionMapDebugSnapshot } from "../../src/components/mission/mission-map-debug";
import { setupWorkspaceTestIds } from "../../src/components/setup/setup-workspace-test-ids";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { OpenSessionSnapshot } from "../../src/session";
import type { LogLibraryCatalog, LogProgress } from "../../src/logs";
import type { PlaybackStateSnapshot } from "../../src/playback";
import type { RecordingSettings, RecordingStatus } from "../../src/recording";
import type {
    MockCommandBehavior,
    MockGuidedStateValue,
    MockInvocation,
    MockLiveVehicleState,
    MockLogSeedPreset,
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

export const setupWorkspaceSelectors = {
    root: `[data-testid="${setupWorkspaceTestIds.root}"]`,
    state: `[data-testid="${setupWorkspaceTestIds.state}"]`,
    scope: `[data-testid="${setupWorkspaceTestIds.scope}"]`,
    metadata: `[data-testid="${setupWorkspaceTestIds.metadata}"]`,
    progress: `[data-testid="${setupWorkspaceTestIds.progress}"]`,
    notice: `[data-testid="${setupWorkspaceTestIds.notice}"]`,
    selectedSection: `[data-testid="${setupWorkspaceTestIds.selectedSection}"]`,
    checkpoint: `[data-testid="${setupWorkspaceTestIds.checkpoint}"]`,
    checkpointTitle: `[data-testid="${setupWorkspaceTestIds.checkpointTitle}"]`,
    checkpointDetail: `[data-testid="${setupWorkspaceTestIds.checkpointDetail}"]`,
    checkpointDismiss: `[data-testid="${setupWorkspaceTestIds.checkpointDismiss}"]`,
    notices: `[data-testid="${setupWorkspaceTestIds.notices}"]`,
    nav: `[data-testid="${setupWorkspaceTestIds.nav}"]`,
    overviewSection: `[data-testid="${setupWorkspaceTestIds.overviewSection}"]`,
    overviewBanner: `[data-testid="${setupWorkspaceTestIds.overviewBanner}"]`,
    overviewRecoveryAction: `[data-testid="${setupWorkspaceTestIds.overviewRecoveryAction}"]`,
    detailRecovery: `[data-testid="${setupWorkspaceTestIds.detailRecovery}"]`,
    frameSection: `[data-testid="${setupWorkspaceTestIds.frameSection}"]`,
    gpsSection: `[data-testid="${setupWorkspaceTestIds.gpsSection}"]`,
    gpsSummary: `[data-testid="${setupWorkspaceTestIds.gpsSummary}"]`,
    gpsLiveState: `[data-testid="${setupWorkspaceTestIds.gpsLiveState}"]`,
    gpsLiveDetail: `[data-testid="${setupWorkspaceTestIds.gpsLiveDetail}"]`,
    gpsPortState: `[data-testid="${setupWorkspaceTestIds.gpsPortState}"]`,
    gpsDocsLink: `[data-testid="${setupWorkspaceTestIds.gpsDocsLink}"]`,
    flightModesSection: `[data-testid="${setupWorkspaceTestIds.flightModesSection}"]`,
    flightModesSummary: `[data-testid="${setupWorkspaceTestIds.flightModesSummary}"]`,
    flightModesAvailabilityState: `[data-testid="${setupWorkspaceTestIds.flightModesAvailabilityState}"]`,
    flightModesAvailabilityDetail: `[data-testid="${setupWorkspaceTestIds.flightModesAvailabilityDetail}"]`,
    flightModesCurrentMode: `[data-testid="${setupWorkspaceTestIds.flightModesCurrentMode}"]`,
    flightModesActiveSlot: `[data-testid="${setupWorkspaceTestIds.flightModesActiveSlot}"]`,
    flightModesDocsLink: `[data-testid="${setupWorkspaceTestIds.flightModesDocsLink}"]`,
    failsafeSection: `[data-testid="${setupWorkspaceTestIds.failsafeSection}"]`,
    failsafeSummary: `[data-testid="${setupWorkspaceTestIds.failsafeSummary}"]`,
    failsafeDefaultsState: `[data-testid="${setupWorkspaceTestIds.failsafeDefaultsState}"]`,
    failsafeDocsLink: `[data-testid="${setupWorkspaceTestIds.failsafeDocsLink}"]`,
    failsafeRecovery: `[data-testid="${setupWorkspaceTestIds.failsafeRecovery}"]`,
    failsafePreview: `[data-testid="${setupWorkspaceTestIds.failsafePreview}"]`,
    armingSection: `[data-testid="${setupWorkspaceTestIds.armingSection}"]`,
    armingReadiness: `[data-testid="${setupWorkspaceTestIds.armingReadiness}"]`,
    armingBlockers: `[data-testid="${setupWorkspaceTestIds.armingBlockers}"]`,
    armingDocsLink: `[data-testid="${setupWorkspaceTestIds.armingDocsLink}"]`,
    prearmDocsLink: `[data-testid="${setupWorkspaceTestIds.prearmDocsLink}"]`,
    initialParamsSection: `[data-testid="${setupWorkspaceTestIds.initialParamsSection}"]`,
    initialParamsSummary: `[data-testid="${setupWorkspaceTestIds.initialParamsSummary}"]`,
    initialParamsFamilyState: `[data-testid="${setupWorkspaceTestIds.initialParamsFamilyState}"]`,
    initialParamsPreviewState: `[data-testid="${setupWorkspaceTestIds.initialParamsPreviewState}"]`,
    initialParamsDocsLink: `[data-testid="${setupWorkspaceTestIds.initialParamsDocsLink}"]`,
    initialParamsRecovery: `[data-testid="${setupWorkspaceTestIds.initialParamsRecovery}"]`,
    peripheralsSection: `[data-testid="${setupWorkspaceTestIds.peripheralsSection}"]`,
    peripheralsSummary: `[data-testid="${setupWorkspaceTestIds.peripheralsSummary}"]`,
    peripheralsFilter: `[data-testid="${setupWorkspaceTestIds.peripheralsFilter}"]`,
    peripheralsDocsLink: `[data-testid="${setupWorkspaceTestIds.peripheralsDocsLink}"]`,
    peripheralsEmpty: `[data-testid="${setupWorkspaceTestIds.peripheralsEmpty}"]`,
    peripheralsRecovery: `[data-testid="${setupWorkspaceTestIds.peripheralsRecovery}"]`,
    frameSummary: `[data-testid="${setupWorkspaceTestIds.frameSummary}"]`,
    frameVehicleState: `[data-testid="${setupWorkspaceTestIds.frameVehicleState}"]`,
    frameLayoutState: `[data-testid="${setupWorkspaceTestIds.frameLayoutState}"]`,
    frameOrientationState: `[data-testid="${setupWorkspaceTestIds.frameOrientationState}"]`,
    frameRecovery: `[data-testid="${setupWorkspaceTestIds.frameRecovery}"]`,
    frameFailure: `[data-testid="${setupWorkspaceTestIds.frameFailure}"]`,
    frameDocsLink: `[data-testid="${setupWorkspaceTestIds.frameDocsLink}"]`,
    rcSection: `[data-testid="${setupWorkspaceTestIds.rcSection}"]`,
    rcSignal: `[data-testid="${setupWorkspaceTestIds.rcSignal}"]`,
    rcRssi: `[data-testid="${setupWorkspaceTestIds.rcRssi}"]`,
    rcDetail: `[data-testid="${setupWorkspaceTestIds.rcDetail}"]`,
    rcFailure: `[data-testid="${setupWorkspaceTestIds.rcFailure}"]`,
    motorsEscSection: `[data-testid="${setupWorkspaceTestIds.motorsEscSection}"]`,
    motorsEscSummary: `[data-testid="${setupWorkspaceTestIds.motorsEscSummary}"]`,
    motorsEscLayoutState: `[data-testid="${setupWorkspaceTestIds.motorsEscLayoutState}"]`,
    motorsEscSafetyState: `[data-testid="${setupWorkspaceTestIds.motorsEscSafetyState}"]`,
    motorsEscReversalState: `[data-testid="${setupWorkspaceTestIds.motorsEscReversalState}"]`,
    motorsEscDocsLink: `[data-testid="${setupWorkspaceTestIds.motorsEscDocsLink}"]`,
    motorsEscFailure: `[data-testid="${setupWorkspaceTestIds.motorsEscFailure}"]`,
    motorsEscUnlock: `[data-testid="${setupWorkspaceTestIds.motorsEscUnlock}"]`,
    servoOutputsSection: `[data-testid="${setupWorkspaceTestIds.servoOutputsSection}"]`,
    servoOutputsSummary: `[data-testid="${setupWorkspaceTestIds.servoOutputsSummary}"]`,
    servoOutputsTesterState: `[data-testid="${setupWorkspaceTestIds.servoOutputsTesterState}"]`,
    servoOutputsSafetyState: `[data-testid="${setupWorkspaceTestIds.servoOutputsSafetyState}"]`,
    servoOutputsReadbackState: `[data-testid="${setupWorkspaceTestIds.servoOutputsReadbackState}"]`,
    servoOutputsReversalState: `[data-testid="${setupWorkspaceTestIds.servoOutputsReversalState}"]`,
    servoOutputsDocsLink: `[data-testid="${setupWorkspaceTestIds.servoOutputsDocsLink}"]`,
    servoOutputsFailure: `[data-testid="${setupWorkspaceTestIds.servoOutputsFailure}"]`,
    servoOutputsUnlock: `[data-testid="${setupWorkspaceTestIds.servoOutputsUnlock}"]`,
    servoOutputsSelectedTarget: `[data-testid="${setupWorkspaceTestIds.servoOutputsSelectedTarget}"]`,
    calibrationSection: `[data-testid="${setupWorkspaceTestIds.calibrationSection}"]`,
    calibrationNotices: `[data-testid="${setupWorkspaceTestIds.calibrationNotices}"]`,
    fullParameters: `[data-testid="${setupWorkspaceTestIds.fullParameters}"]`,
    fullParametersNav: `[data-testid="${setupWorkspaceTestIds.navPrefix}-full_parameters"]`,
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

export const logsWorkspaceSelectors = {
    root: '[data-testid="logs-workspace-root"]',
    libraryPanel: '[data-testid="logs-library-panel"]',
    importPathInput: '[data-testid="logs-import-path-input"]',
    importButton: '[data-testid="logs-import-button"]',
    importPickerButton: '[data-testid="logs-import-picker-button"]',
    libraryList: '[data-testid="logs-library-list"]',
    libraryEmpty: '[data-testid="logs-library-empty"]',
    progressBanner: '[data-testid="logs-progress-banner"]',
    detailsPanel: '[data-testid="logs-details-panel"]',
    selectedStatusPill: '[data-testid="logs-selected-status-pill"]',
    selectedMessage: '[data-testid="logs-selected-message"]',
    relinkPathInput: '[data-testid="logs-relink-path-input"]',
    relinkButton: '[data-testid="logs-relink-button"]',
    reindexButton: '[data-testid="logs-reindex-button"]',
    removeButton: '[data-testid="logs-remove-button"]',
    replayPanel: '[data-testid="logs-replay-panel"]',
    playbackStatusPill: '[data-testid="logs-playback-status-pill"]',
    preparePlayback: '[data-testid="logs-prepare-playback"]',
    playButton: '[data-testid="logs-play-button"]',
    pauseButton: '[data-testid="logs-pause-button"]',
    stopButton: '[data-testid="logs-stop-button"]',
    speedSelect: '[data-testid="logs-speed-select"]',
    timelineRange: '[data-testid="logs-timeline-range"]',
    mapPathButton: '[data-testid="logs-map-path-button"]',
    mapMarkerButton: '[data-testid="logs-map-marker-button"]',
    chartsPanel: '[data-testid="logs-charts-panel"]',
    chartExport: '[data-testid="logs-chart-export"]',
    chartClearRange: '[data-testid="logs-chart-clear-range"]',
    chartExportPath: '[data-testid="logs-chart-export-path"]',
    chartExportButton: '[data-testid="logs-chart-export-button"]',
    chartExportResult: '[data-testid="logs-chart-export-result"]',
    chartExportError: '[data-testid="logs-chart-export-error"]',
    rawPanel: '[data-testid="logs-raw-messages-panel"]',
    rawRunQuery: '[data-testid="logs-raw-run-query"]',
    rawPreviousPage: '[data-testid="logs-raw-previous-page"]',
    rawNextPage: '[data-testid="logs-raw-next-page"]',
    rawExportDestination: '[data-testid="logs-raw-export-destination"]',
    rawExportButton: '[data-testid="logs-raw-export"]',
    rawMessagesTable: '[data-testid="logs-raw-messages-table"]',
    rawTypeFilter: '[data-testid="logs-raw-type-filter"]',
    rawTextFilter: '[data-testid="logs-raw-text-filter"]',
    rawLimitFilter: '[data-testid="logs-raw-limit-filter"]',
    recordingPanel: '[data-testid="logs-recording-panel"]',
    recordingStatus: '[data-testid="logs-recording-status"]',
    recordingToggle: '[data-testid="logs-recording-toggle"]',
    recordingPathInput: '[data-testid="logs-recording-path-input"]',
    autoRecordToggle: '[data-testid="logs-auto-record-toggle"]',
    recordingOverlap: '[data-testid="logs-recording-replay-overlap"]',
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
    attachment: `[data-testid="${missionWorkspaceTestIds.attachment}"]`,
    attachmentDetail: `[data-testid="${missionWorkspaceTestIds.attachmentDetail}"]`,
    scope: `[data-testid="${missionWorkspaceTestIds.scope}"]`,
    summary: `[data-testid="${missionWorkspaceTestIds.summary}"]`,
    inlineStatus: `[data-testid="${missionWorkspaceTestIds.inlineStatus}"]`,
    inlineStatusMessage: `[data-testid="${missionWorkspaceTestIds.inlineStatusMessage}"]`,
    inlineStatusDetail: `[data-testid="${missionWorkspaceTestIds.inlineStatusDetail}"]`,
    error: `[data-testid="${missionWorkspaceTestIds.error}"]`,
    warningRegister: `[data-testid="${missionWorkspaceTestIds.warningRegister}"]`,
    warningFile: `[data-testid="${missionWorkspaceTestIds.warningFile}"]`,
    warningValidation: `[data-testid="${missionWorkspaceTestIds.warningValidation}"]`,
    countsMission: `[data-testid="${missionWorkspaceTestIds.countsMission}"]`,
    countsSurvey: `[data-testid="${missionWorkspaceTestIds.countsSurvey}"]`,
    countsFence: `[data-testid="${missionWorkspaceTestIds.countsFence}"]`,
    countsRally: `[data-testid="${missionWorkspaceTestIds.countsRally}"]`,
    countsValidation: `[data-testid="${missionWorkspaceTestIds.countsValidation}"]`,
    countsWarnings: `[data-testid="${missionWorkspaceTestIds.countsWarnings}"]`,
    empty: `[data-testid="${missionWorkspaceTestIds.empty}"]`,
    ready: `[data-testid="${missionWorkspaceTestIds.ready}"]`,
    modeMission: `[data-testid="${missionWorkspaceTestIds.modeMission}"]`,
    modeFence: `[data-testid="${missionWorkspaceTestIds.modeFence}"]`,
    modeRally: `[data-testid="${missionWorkspaceTestIds.modeRally}"]`,
    entryRead: `[data-testid="${missionWorkspaceTestIds.entryRead}"]`,
    entryImport: `[data-testid="${missionWorkspaceTestIds.entryImport}"]`,
    entryImportKml: `[data-testid="${missionWorkspaceTestIds.entryImportKml}"]`,
    entryNew: `[data-testid="${missionWorkspaceTestIds.entryNew}"]`,
    toolbarRead: `[data-testid="${missionWorkspaceTestIds.toolbarRead}"]`,
    toolbarImport: `[data-testid="${missionWorkspaceTestIds.toolbarImport}"]`,
    toolbarNew: `[data-testid="${missionWorkspaceTestIds.toolbarNew}"]`,
    toolbarUndo: `[data-testid="${missionWorkspaceTestIds.toolbarUndo}"]`,
    toolbarRedo: `[data-testid="${missionWorkspaceTestIds.toolbarRedo}"]`,
    toolbarExport: `[data-testid="${missionWorkspaceTestIds.toolbarExport}"]`,
    toolbarUpload: `[data-testid="${missionWorkspaceTestIds.toolbarUpload}"]`,
    toolbarCancel: `[data-testid="${missionWorkspaceTestIds.toolbarCancel}"]`,
    prompt: `[data-testid="${missionWorkspaceTestIds.prompt}"]`,
    promptKind: `[data-testid="${missionWorkspaceTestIds.promptKind}"]`,
    promptConfirm: `[data-testid="${missionWorkspaceTestIds.promptConfirm}"]`,
    promptDismiss: `[data-testid="${missionWorkspaceTestIds.promptDismiss}"]`,
    importReview: `[data-testid="${missionWorkspaceTestIds.importReview}"]`,
    importReviewTitle: `[data-testid="${missionWorkspaceTestIds.importReviewTitle}"]`,
    importReviewConfirm: `[data-testid="${missionWorkspaceTestIds.importReviewConfirm}"]`,
    importReviewDismiss: `[data-testid="${missionWorkspaceTestIds.importReviewDismiss}"]`,
    exportReview: `[data-testid="${missionWorkspaceTestIds.exportReview}"]`,
    exportReviewTitle: `[data-testid="${missionWorkspaceTestIds.exportReviewTitle}"]`,
    exportReviewConfirm: `[data-testid="${missionWorkspaceTestIds.exportReviewConfirm}"]`,
    exportReviewDismiss: `[data-testid="${missionWorkspaceTestIds.exportReviewDismiss}"]`,
    homeCard: `[data-testid="${missionWorkspaceTestIds.homeCard}"]`,
    homeLatitude: `[data-testid="${missionWorkspaceTestIds.homeLatitude}"]`,
    homeLongitude: `[data-testid="${missionWorkspaceTestIds.homeLongitude}"]`,
    homeAltitude: `[data-testid="${missionWorkspaceTestIds.homeAltitude}"]`,
    homeSummary: `[data-testid="${missionWorkspaceTestIds.homeSummary}"]`,
    homeSync: `[data-testid="${missionWorkspaceTestIds.homeSync}"]`,
    homeReadOnly: `[data-testid="${missionWorkspaceTestIds.homeReadOnly}"]`,
    replayOverlayBanner: `[data-testid="${missionWorkspaceTestIds.replayOverlayBanner}"]`,
    replayOverlayDismiss: `[data-testid="${missionWorkspaceTestIds.replayOverlayDismiss}"]`,
    map: `[data-testid="${missionWorkspaceTestIds.map}"]`,
    mapSurface: `[data-testid="${missionWorkspaceTestIds.mapSurface}"]`,
    mapDrawSurface: `[data-testid="${missionWorkspaceTestIds.mapDrawSurface}"]`,
    mapStatus: `[data-testid="${missionWorkspaceTestIds.mapStatus}"]`,
    mapSelection: `[data-testid="${missionWorkspaceTestIds.mapSelection}"]`,
    mapDrawMode: `[data-testid="${missionWorkspaceTestIds.mapDrawMode}"]`,
    mapDragState: `[data-testid="${missionWorkspaceTestIds.mapDragState}"]`,
    mapMarkerCount: `[data-testid="${missionWorkspaceTestIds.mapMarkerCount}"]`,
    mapSurveyCount: `[data-testid="${missionWorkspaceTestIds.mapSurveyCount}"]`,
    mapPreviewCount: `[data-testid="${missionWorkspaceTestIds.mapPreviewCount}"]`,
    mapReplayPath: `[data-testid="${missionWorkspaceTestIds.mapReplayPath}"]`,
    mapReplayMarker: `[data-testid="${missionWorkspaceTestIds.mapReplayMarker}"]`,
    mapFenceCount: `[data-testid="${missionWorkspaceTestIds.mapFenceCount}"]`,
    mapFenceVertexCount: `[data-testid="${missionWorkspaceTestIds.mapFenceVertexCount}"]`,
    mapFenceReturnPointState: `[data-testid="${missionWorkspaceTestIds.mapFenceReturnPointState}"]`,
    mapRallyCount: `[data-testid="${missionWorkspaceTestIds.mapRallyCount}"]`,
    mapDebug: `[data-testid="${missionWorkspaceTestIds.mapDebug}"]`,
    mapDrawStartGrid: `[data-testid="${missionWorkspaceTestIds.mapDrawStartGrid}"]`,
    mapDrawStartCorridor: `[data-testid="${missionWorkspaceTestIds.mapDrawStartCorridor}"]`,
    mapDrawStartStructure: `[data-testid="${missionWorkspaceTestIds.mapDrawStartStructure}"]`,
    mapDrawEdit: `[data-testid="${missionWorkspaceTestIds.mapDrawEdit}"]`,
    mapDrawFinish: `[data-testid="${missionWorkspaceTestIds.mapDrawFinish}"]`,
    mapDrawCancel: `[data-testid="${missionWorkspaceTestIds.mapDrawCancel}"]`,
    listAdd: `[data-testid="${missionWorkspaceTestIds.listAdd}"]`,
    listAddSurveyGrid: `[data-testid="${missionWorkspaceTestIds.listAddSurveyGrid}"]`,
    listAddSurveyCorridor: `[data-testid="${missionWorkspaceTestIds.listAddSurveyCorridor}"]`,
    listAddSurveyStructure: `[data-testid="${missionWorkspaceTestIds.listAddSurveyStructure}"]`,
    fenceList: `[data-testid="${missionWorkspaceTestIds.fenceList}"]`,
    fenceAddInclusionPolygon: `[data-testid="${missionWorkspaceTestIds.fenceAddInclusionPolygon}"]`,
    fenceAddExclusionPolygon: `[data-testid="${missionWorkspaceTestIds.fenceAddExclusionPolygon}"]`,
    fenceAddInclusionCircle: `[data-testid="${missionWorkspaceTestIds.fenceAddInclusionCircle}"]`,
    fenceAddExclusionCircle: `[data-testid="${missionWorkspaceTestIds.fenceAddExclusionCircle}"]`,
    fenceReturnPointCard: `[data-testid="${missionWorkspaceTestIds.fenceReturnPointCard}"]`,
    fenceReturnPointClear: `[data-testid="${missionWorkspaceTestIds.fenceReturnPointClear}"]`,
    rallyList: `[data-testid="${missionWorkspaceTestIds.rallyList}"]`,
    rallyAdd: `[data-testid="${missionWorkspaceTestIds.rallyAdd}"]`,
    inspectorSelectionKind: `[data-testid="${missionWorkspaceTestIds.inspectorSelectionKind}"]`,
    inspectorReadonly: `[data-testid="${missionWorkspaceTestIds.inspectorReadonly}"]`,
    inspectorSurvey: `[data-testid="${missionWorkspaceTestIds.inspectorSurvey}"]`,
    inspectorCommandSelect: `[data-testid="${missionWorkspaceTestIds.inspectorCommandSelect}"]`,
    inspectorLatitude: `[data-testid="${missionWorkspaceTestIds.inspectorLatitude}"]`,
    inspectorLongitude: `[data-testid="${missionWorkspaceTestIds.inspectorLongitude}"]`,
    inspectorAltitude: `[data-testid="${missionWorkspaceTestIds.inspectorAltitude}"]`,
    fenceInspectorSelectionKind: `[data-testid="${missionWorkspaceTestIds.fenceInspectorSelectionKind}"]`,
    fenceInspectorType: `[data-testid="${missionWorkspaceTestIds.fenceInspectorType}"]`,
    fenceCircleRadius: `[data-testid="${missionWorkspaceTestIds.fenceCircleRadius}"]`,
    rallyInspectorSelectionKind: `[data-testid="${missionWorkspaceTestIds.rallyInspectorSelectionKind}"]`,
    rallyLatitude: `[data-testid="${missionWorkspaceTestIds.rallyLatitude}"]`,
    rallyLongitude: `[data-testid="${missionWorkspaceTestIds.rallyLongitude}"]`,
    rallyAltitude: `[data-testid="${missionWorkspaceTestIds.rallyAltitude}"]`,
    rallyAltitudeFrame: `[data-testid="${missionWorkspaceTestIds.rallyAltitudeFrame}"]`,
    surveyPrompt: `[data-testid="${missionWorkspaceTestIds.surveyPrompt}"]`,
    surveyPromptKind: `[data-testid="${missionWorkspaceTestIds.surveyPromptKind}"]`,
    surveyPromptConfirm: `[data-testid="${missionWorkspaceTestIds.surveyPromptConfirm}"]`,
    surveyPromptDismiss: `[data-testid="${missionWorkspaceTestIds.surveyPromptDismiss}"]`,
    cameraPicker: `[data-testid="${missionWorkspaceTestIds.cameraPicker}"]`,
    cameraCurrent: `[data-testid="${missionWorkspaceTestIds.cameraCurrent}"]`,
    cameraWarning: `[data-testid="${missionWorkspaceTestIds.cameraWarning}"]`,
    cameraSearch: `[data-testid="${missionWorkspaceTestIds.cameraSearch}"]`,
    surveyGenerate: `[data-testid="${missionWorkspaceTestIds.surveyGenerate}"]`,
    surveyDissolve: `[data-testid="${missionWorkspaceTestIds.surveyDissolve}"]`,
    surveyDelete: `[data-testid="${missionWorkspaceTestIds.surveyDelete}"]`,
    surveyGeneratedLatitude: `[data-testid="${missionWorkspaceTestIds.surveyGeneratedLatitude}"]`,
    surveyGeneratedLongitude: `[data-testid="${missionWorkspaceTestIds.surveyGeneratedLongitude}"]`,
    surveyGeneratedAltitude: `[data-testid="${missionWorkspaceTestIds.surveyGeneratedAltitude}"]`,
    missionMarker: `[data-testid^="${missionWorkspaceTestIds.mapMarkerPrefix}-"]`,
    surveyHandle: `[data-testid^="${missionWorkspaceTestIds.mapSurveyPrefix}-"]`,
} as const;

export const missionWorkspaceLayoutSelectors = {
    layoutDiagnostics: `[data-testid="${missionWorkspaceTestIds.layoutDiagnostics}"]`,
    layoutMode: `[data-testid="${missionWorkspaceTestIds.layoutMode}"]`,
    layoutTier: `[data-testid="${missionWorkspaceTestIds.layoutTier}"]`,
    layoutTierMismatch: `[data-testid="${missionWorkspaceTestIds.layoutTierMismatch}"]`,
    detailColumns: `[data-testid="${missionWorkspaceTestIds.detailColumns}"]`,
    supportPlacement: `[data-testid="${missionWorkspaceTestIds.supportPlacement}"]`,
    phoneSegmentBar: `[data-testid="${missionWorkspaceTestIds.phoneSegmentBar}"]`,
    phoneSegmentState: `[data-testid="${missionWorkspaceTestIds.phoneSegmentState}"]`,
    phoneSegmentMap: `[data-testid="${missionWorkspaceTestIds.phoneSegmentMap}"]`,
    phoneSegmentPlan: `[data-testid="${missionWorkspaceTestIds.phoneSegmentPlan}"]`,
    mapPane: `[data-testid="${missionWorkspaceTestIds.mapPane}"]`,
    planPane: `[data-testid="${missionWorkspaceTestIds.planPane}"]`,
} as const;

export const missionSupportPanelSelectors = {
    planningStatsPanel: `[data-testid="${missionWorkspaceTestIds.planningStatsPanel}"]`,
    planningStatsMissionState: `[data-testid="${missionWorkspaceTestIds.planningStatsMissionState}"]`,
    planningStatsMissionDistance: `[data-testid="${missionWorkspaceTestIds.planningStatsMissionDistance}"]`,
    planningStatsSpeedStatus: `[data-testid="${missionWorkspaceTestIds.planningStatsSpeedStatus}"]`,
    planningStatsCruiseInput: `[data-testid="${missionWorkspaceTestIds.planningStatsCruiseInput}"]`,
    terrainPanel: `[data-testid="${missionWorkspaceTestIds.terrainPanel}"]`,
    terrainStatus: `[data-testid="${missionWorkspaceTestIds.terrainStatus}"]`,
    terrainStatusDetail: `[data-testid="${missionWorkspaceTestIds.terrainStatusDetail}"]`,
    terrainWarningCount: `[data-testid="${missionWorkspaceTestIds.terrainWarningCount}"]`,
    terrainRetry: `[data-testid="${missionWorkspaceTestIds.terrainRetry}"]`,
} as const;

export const firmwareWorkspaceSelectors = {
    root: `[data-testid="${firmwareWorkspaceTestIds.root}"]`,
    mode: `[data-testid="${firmwareWorkspaceTestIds.mode}"]`,
    modeInstall: `[data-testid="${firmwareWorkspaceTestIds.modeInstall}"]`,
    modeRecovery: `[data-testid="${firmwareWorkspaceTestIds.modeRecovery}"]`,
    returnGuidance: `[data-testid="${firmwareWorkspaceTestIds.returnGuidance}"]`,
    layoutMode: `[data-testid="${firmwareWorkspaceTestIds.layoutMode}"]`,
    layoutTier: `[data-testid="${firmwareWorkspaceTestIds.layoutTier}"]`,
    layoutTierMismatch: `[data-testid="${firmwareWorkspaceTestIds.layoutTierMismatch}"]`,
    blockedReason: `[data-testid="${firmwareWorkspaceTestIds.blockedReason}"]`,
    blockedCopy: `[data-testid="${firmwareWorkspaceTestIds.blockedCopy}"]`,
    serialPanel: `[data-testid="${firmwareWorkspaceTestIds.serialPanel}"]`,
    serialState: `[data-testid="${firmwareWorkspaceTestIds.serialState}"]`,
    serialPort: `[data-testid="${firmwareWorkspaceTestIds.serialPort}"]`,
    serialPortRefresh: `[data-testid="${firmwareWorkspaceTestIds.serialPortRefresh}"]`,
    serialBaud: `[data-testid="${firmwareWorkspaceTestIds.serialBaud}"]`,
    selectedTargetState: `[data-testid="${firmwareWorkspaceTestIds.selectedTargetState}"]`,
    selectedSourceState: `[data-testid="${firmwareWorkspaceTestIds.selectedSourceState}"]`,
    manualTargetToggle: `[data-testid="${firmwareWorkspaceTestIds.manualTargetToggle}"]`,
    manualTargetRequired: `[data-testid="${firmwareWorkspaceTestIds.manualTargetRequired}"]`,
    manualTargetSearch: `[data-testid="${firmwareWorkspaceTestIds.manualTargetSearch}"]`,
    manualTargetVehicleFilter: `[data-testid="${firmwareWorkspaceTestIds.manualTargetVehicleFilter}"]`,
    manualTargetResults: `[data-testid="${firmwareWorkspaceTestIds.manualTargetResults}"]`,
    manualTargetEmpty: `[data-testid="${firmwareWorkspaceTestIds.manualTargetEmpty}"]`,
    manualTargetNoMatches: `[data-testid="${firmwareWorkspaceTestIds.manualTargetNoMatches}"]`,
    manualTargetSelected: `[data-testid="${firmwareWorkspaceTestIds.manualTargetSelected}"]`,
    manualTargetHidden: `[data-testid="${firmwareWorkspaceTestIds.manualTargetHidden}"]`,
    targetListError: `[data-testid="${firmwareWorkspaceTestIds.targetListError}"]`,
    targetListRetry: `[data-testid="${firmwareWorkspaceTestIds.targetListRetry}"]`,
    catalogEntryState: `[data-testid="${firmwareWorkspaceTestIds.catalogEntryState}"]`,
    catalogEntryError: `[data-testid="${firmwareWorkspaceTestIds.catalogEntryError}"]`,
    catalogEntryRetry: `[data-testid="${firmwareWorkspaceTestIds.catalogEntryRetry}"]`,
    catalogEntrySelect: `[data-testid="${firmwareWorkspaceTestIds.catalogEntrySelect}"]`,
    sourceCatalog: `[data-testid="${firmwareWorkspaceTestIds.sourceCatalog}"]`,
    sourceLocal: `[data-testid="${firmwareWorkspaceTestIds.sourceLocal}"]`,
    sourceBrowse: `[data-testid="${firmwareWorkspaceTestIds.sourceBrowse}"]`,
    sourceError: `[data-testid="${firmwareWorkspaceTestIds.sourceError}"]`,
    fullChipErase: `[data-testid="${firmwareWorkspaceTestIds.fullChipErase}"]`,
    paramBackup: `[data-testid="${firmwareWorkspaceTestIds.paramBackup}"]`,
    paramBackupState: `[data-testid="${firmwareWorkspaceTestIds.paramBackupState}"]`,
    serialReadiness: `[data-testid="${firmwareWorkspaceTestIds.serialReadiness}"]`,
    serialReadinessState: `[data-testid="${firmwareWorkspaceTestIds.serialReadinessState}"]`,
    serialBlockedReason: `[data-testid="${firmwareWorkspaceTestIds.serialBlockedReason}"]`,
    serialBootloaderTransition: `[data-testid="${firmwareWorkspaceTestIds.serialBootloaderTransition}"]`,
    serialValidationPending: `[data-testid="${firmwareWorkspaceTestIds.serialValidationPending}"]`,
    startSerial: `[data-testid="${firmwareWorkspaceTestIds.startSerial}"]`,
    cancelSerial: `[data-testid="${firmwareWorkspaceTestIds.cancelSerial}"]`,
    serialProgress: `[data-testid="${firmwareWorkspaceTestIds.serialProgress}"]`,
    recoveryPanel: `[data-testid="${firmwareWorkspaceTestIds.recoveryPanel}"]`,
    recoveryState: `[data-testid="${firmwareWorkspaceTestIds.recoveryState}"]`,
    recoveryDeviceSelect: `[data-testid="${firmwareWorkspaceTestIds.recoveryDeviceSelect}"]`,
    recoveryDeviceRefresh: `[data-testid="${firmwareWorkspaceTestIds.recoveryDeviceRefresh}"]`,
    recoveryDeviceState: `[data-testid="${firmwareWorkspaceTestIds.recoveryDeviceState}"]`,
    recoveryTargetSelect: `[data-testid="${firmwareWorkspaceTestIds.recoveryTargetSelect}"]`,
    recoveryTargetState: `[data-testid="${firmwareWorkspaceTestIds.recoveryTargetState}"]`,
    recoveryTargetError: `[data-testid="${firmwareWorkspaceTestIds.recoveryTargetError}"]`,
    recoveryTargetRetry: `[data-testid="${firmwareWorkspaceTestIds.recoveryTargetRetry}"]`,
    recoveryTargetEmpty: `[data-testid="${firmwareWorkspaceTestIds.recoveryTargetEmpty}"]`,
    recoveryOfficialAction: `[data-testid="${firmwareWorkspaceTestIds.recoveryOfficialAction}"]`,
    recoverySourceState: `[data-testid="${firmwareWorkspaceTestIds.recoverySourceState}"]`,
    recoveryAdvancedToggle: `[data-testid="${firmwareWorkspaceTestIds.recoveryAdvancedToggle}"]`,
    recoveryManualPanel: `[data-testid="${firmwareWorkspaceTestIds.recoveryManualPanel}"]`,
    recoveryManualWarning: `[data-testid="${firmwareWorkspaceTestIds.recoveryManualWarning}"]`,
    recoveryManualApj: `[data-testid="${firmwareWorkspaceTestIds.recoveryManualApj}"]`,
    recoveryManualBin: `[data-testid="${firmwareWorkspaceTestIds.recoveryManualBin}"]`,
    recoveryBrowse: `[data-testid="${firmwareWorkspaceTestIds.recoveryBrowse}"]`,
    recoverySourceError: `[data-testid="${firmwareWorkspaceTestIds.recoverySourceError}"]`,
    recoverySafetyConfirm: `[data-testid="${firmwareWorkspaceTestIds.recoverySafetyConfirm}"]`,
    recoveryManualConfirm: `[data-testid="${firmwareWorkspaceTestIds.recoveryManualConfirm}"]`,
    recoveryBlockedReason: `[data-testid="${firmwareWorkspaceTestIds.recoveryBlockedReason}"]`,
    recoveryGuidance: `[data-testid="${firmwareWorkspaceTestIds.recoveryGuidance}"]`,
    startRecovery: `[data-testid="${firmwareWorkspaceTestIds.startRecovery}"]`,
    cancelRecovery: `[data-testid="${firmwareWorkspaceTestIds.cancelRecovery}"]`,
    recoveryProgress: `[data-testid="${firmwareWorkspaceTestIds.recoveryProgress}"]`,
    outcomePanel: `[data-testid="${firmwareWorkspaceTestIds.outcomePanel}"]`,
    outcomeState: `[data-testid="${firmwareWorkspaceTestIds.outcomeState}"]`,
    outcomeResult: `[data-testid="${firmwareWorkspaceTestIds.outcomeResult}"]`,
    outcomeSummary: `[data-testid="${firmwareWorkspaceTestIds.outcomeSummary}"]`,
    outcomeEmpty: `[data-testid="${firmwareWorkspaceTestIds.outcomeEmpty}"]`,
    outcomeDismiss: `[data-testid="${firmwareWorkspaceTestIds.outcomeDismiss}"]`,
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

export type MockOpenFileState = {
    mode: "resolve" | "cancel" | "reject";
    name: string;
    type: string;
    kind: "text" | "binary";
    size: number;
    openCount: number;
};

export type MockSavedFile = {
    name: string;
    contents: string;
    size: number;
};

export type MockPlatformFixture = {
    reset: () => Promise<void>;
    setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
    clearCommandBehavior: (cmd: string) => Promise<void>;
    resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => Promise<boolean>;
    rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => Promise<boolean>;
    emit: (event: string, payload: unknown) => Promise<void>;
    emitLiveSessionState: (vehicleState: MockLiveVehicleState) => Promise<void>;
    emitLiveTelemetryDomain: (telemetry: OpenSessionSnapshot["telemetry"]) => Promise<void>;
    emitLiveSupportDomain: (support: OpenSessionSnapshot["support"]) => Promise<void>;
    emitLiveConfigurationFactsDomain: (facts: OpenSessionSnapshot["configuration_facts"]) => Promise<void>;
    emitLiveCalibrationDomain: (calibration: OpenSessionSnapshot["calibration"]) => Promise<void>;
    emitLiveStatusTextDomain: (statusText: OpenSessionSnapshot["status_text"]) => Promise<void>;
    emitMissionState: (missionState: MockMissionState) => Promise<void>;
    emitMissionProgress: (missionProgress: MockMissionProgressState) => Promise<void>;
    emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
    emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
    emitLiveGuidedState: (guidedState: MockGuidedStateValue) => Promise<void>;
    emitLogProgress: (progress: LogProgress) => Promise<void>;
    emitPlaybackState: (playbackState: PlaybackStateSnapshot) => Promise<void>;
    setLogLibraryCatalog: (catalog: LogLibraryCatalog) => Promise<LogLibraryCatalog>;
    seedLogLibrary: (presets?: MockLogSeedPreset[]) => Promise<LogLibraryCatalog>;
    getLogLibraryCatalog: () => Promise<LogLibraryCatalog>;
    getSeededLogEntry: (preset: MockLogSeedPreset) => Promise<LogLibraryCatalog["entries"][number]>;
    setRecordingStatus: (status: RecordingStatus) => Promise<RecordingStatus>;
    setRecordingSettings: (settings: RecordingSettings) => Promise<{ operation_id: "recording_settings_write"; settings: RecordingSettings }>;
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
    setOpenLogFilePreset: (preset: Extract<MockLogSeedPreset, "ready_tlog" | "ready_bin" | "corrupt_tlog" | "corrupt_bin">) => Promise<void>;
    setOpenFile: (contents: string, name?: string, type?: string) => Promise<void>;
    setOpenBinaryFile: (contents: Uint8Array | ArrayBuffer | number[], name?: string, type?: string) => Promise<void>;
    getOpenFileState: () => Promise<MockOpenFileState>;
    cancelOpenFile: (message?: string) => Promise<void>;
    failOpenFile: (message: string) => Promise<void>;
    setSaveFileName: (name: string) => Promise<void>;
    cancelSaveFile: (message?: string) => Promise<void>;
    failSaveFile: (message: string) => Promise<void>;
    clearSavedFiles: () => Promise<void>;
    getSavedFiles: () => Promise<MockSavedFile[]>;
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
        type MockSavedFileRecord = {
            name: string;
            contents: string;
            size: number;
        };

        type FilePickerState = {
            openMode: "resolve" | "cancel" | "reject";
            openKind: "text" | "binary";
            openText: string;
            openBytes: number[];
            openName: string;
            openType: string;
            openMessage: string;
            openCount: number;
            saveMode: "resolve" | "cancel" | "reject";
            saveName: string;
            saveMessage: string;
            savedFiles: MockSavedFileRecord[];
            setOpenFile: (contents: string, name?: string, type?: string) => void;
            setOpenBinaryFile: (contents: Uint8Array | ArrayBuffer | number[], name?: string, type?: string) => void;
            getOpenFileState: () => MockOpenFileState;
            cancelOpenFile: (message?: string) => void;
            failOpenFile: (message: string) => void;
            setSaveFileName: (name: string) => void;
            cancelSaveFile: (message?: string) => void;
            failSaveFile: (message: string) => void;
            clearSavedFiles: () => void;
            getSavedFiles: () => MockSavedFileRecord[];
        };

        const mockWindow = window as typeof window & {
            __IRONWING_FILE_PICKER__?: FilePickerState;
            showOpenFilePicker?: (options?: { suggestedName?: string }) => Promise<Array<{ getFile: () => Promise<File> }>>;
            showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
                name?: string;
                createWritable: () => Promise<{ write: (contents: unknown) => Promise<void>; close: () => Promise<void> }>;
            }>;
        };

        const normalizeBinaryContents = (contents: Uint8Array | ArrayBuffer | number[]): number[] => {
            if (Array.isArray(contents)) {
                return contents.map((value) => Number(value) & 0xff);
            }
            if (contents instanceof Uint8Array) {
                return Array.from(contents);
            }
            if (contents instanceof ArrayBuffer) {
                return Array.from(new Uint8Array(contents));
            }

            throw new Error("Mock binary file contents must be provided as number[], Uint8Array, or ArrayBuffer.");
        };

        const coerceWritableContents = async (contents: unknown): Promise<string> => {
            if (typeof contents === "string") {
                return contents;
            }
            if (contents instanceof Uint8Array) {
                return new TextDecoder().decode(contents);
            }
            if (contents instanceof ArrayBuffer) {
                return new TextDecoder().decode(new Uint8Array(contents));
            }
            if (typeof Blob !== "undefined" && contents instanceof Blob) {
                return contents.text();
            }

            return String(contents);
        };

        const state: FilePickerState = {
            openMode: "resolve",
            openKind: "text",
            openText: "",
            openBytes: [],
            openName: "import.param",
            openType: "text/plain",
            openMessage: "The user aborted a request.",
            openCount: 0,
            saveMode: "resolve" as const,
            saveName: "ironwing-parameters.param",
            saveMessage: "The user aborted a request.",
            savedFiles: [] as MockSavedFileRecord[],
            setOpenFile(contents: string, name = "import.param", type = "text/plain") {
                state.openMode = "resolve";
                state.openKind = "text";
                state.openText = contents;
                state.openBytes = [];
                state.openName = name;
                state.openType = type;
            },
            setOpenBinaryFile(contents: Uint8Array | ArrayBuffer | number[], name = "import.bin", type = "application/octet-stream") {
                state.openMode = "resolve";
                state.openKind = "binary";
                state.openBytes = normalizeBinaryContents(contents);
                state.openText = "";
                state.openName = name;
                state.openType = type;
            },
            getOpenFileState() {
                return {
                    mode: state.openMode,
                    name: state.openName,
                    type: state.openType,
                    kind: state.openKind,
                    size: state.openKind === "binary" ? state.openBytes.length : state.openText.length,
                    openCount: state.openCount,
                };
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
            state.openCount += 1;

            if (state.openMode === "cancel") {
                throw new DOMException(state.openMessage, "AbortError");
            }
            if (state.openMode === "reject") {
                throw new Error(state.openMessage);
            }

            const file = new File(
                [state.openKind === "binary" ? new Uint8Array(state.openBytes) : state.openText],
                state.openName,
                { type: state.openType },
            );
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
                createWritable: async () => {
                    let buffer = "";
                    let closed = false;

                    return {
                        write: async (contents: unknown) => {
                            buffer += await coerceWritableContents(contents);
                        },
                        close: async () => {
                            if (closed) {
                                return;
                            }

                            closed = true;
                            state.savedFiles.push({ name, contents: buffer, size: buffer.length });
                        },
                    };
                },
            };
        };
    });
}

async function emitLiveScopedDomain<T>(
    page: Page,
    event:
        | "telemetry://state"
        | "support://state"
        | "configuration_facts://state"
        | "calibration://state"
        | "status_text://state",
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

export async function openSetupWorkspace(page: Page): Promise<void> {
    const setupButton = page.getByRole("button", { name: "Setup" });
    await expect(
        setupButton,
        "Setup workspace entry point is missing; keep the shared shell workspace labels aligned with the shipped header tabs.",
    ).toBeVisible();
    await setupButton.click();
    await expectSetupWorkspace(page);
}

export async function expectSetupWorkspace(page: Page): Promise<void> {
    await expect(
        page.locator(setupWorkspaceSelectors.root),
        "The setup workspace root is missing; keep the shared setup selectors in e2e/fixtures/mock-platform.ts aligned with the shipped setup markup.",
    ).toBeVisible();
}

export async function openLogsWorkspace(page: Page): Promise<void> {
    const logsButton = page.getByRole("button", { name: "Logs" });
    await expect(
        logsButton,
        "Logs workspace entry point is missing; keep the shared shell workspace labels aligned with the shipped header tabs.",
    ).toBeVisible();
    await logsButton.click();
    await expectLogsWorkspace(page);
}

export async function expectLogsWorkspace(page: Page): Promise<void> {
    await expect(
        page.locator(logsWorkspaceSelectors.root),
        "The logs workspace root is missing; keep the shared logs selectors in e2e/fixtures/mock-platform.ts aligned with the shipped logs markup.",
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

type MissionHistoryKind = "undo" | "redo";

type MissionHistoryButtonState = {
    count: number;
    disabled: boolean;
    label: string;
    title: string;
};

type MissionHistoryState = {
    undo: MissionHistoryButtonState;
    redo: MissionHistoryButtonState;
};

function missionHistoryKindLabel(kind: MissionHistoryKind): string {
    return kind === "undo" ? "Undo" : "Redo";
}

async function readMissionHistoryButtonState(locator: Locator, kind: MissionHistoryKind): Promise<MissionHistoryButtonState> {
    const labelPrefix = missionHistoryKindLabel(kind);
    const count = await locator.count();
    if (count !== 1) {
        throw new Error(
            `Mission ${kind} control count drifted to ${count}. Keep e2e/fixtures/mock-platform.ts aligned with the shipped Mission workspace controls instead of scraping fallback DOM.`,
        );
    }

    const [label, title, disabled] = await Promise.all([
        locator.getAttribute("aria-label"),
        locator.getAttribute("title"),
        locator.isDisabled(),
    ]);

    if (!label) {
        throw new Error(
            `Mission ${kind} control is missing its aria-label. The shipped header must expose the count-bearing ${labelPrefix} label for stable browser proof.`,
        );
    }
    if (!title) {
        throw new Error(
            `Mission ${kind} control is missing its title attribute. The shipped header should mirror the ${labelPrefix} count label there as well.`,
        );
    }

    const match = label.match(new RegExp(`^${labelPrefix} \\((\\d+) available\\)$`));
    if (!match) {
        throw new Error(
            `Mission ${kind} control reported malformed label \"${label}\". Expected \"${labelPrefix} (N available)\" so browser proof can reject selector drift instead of guessing state.`,
        );
    }
    if (title !== label) {
        throw new Error(
            `Mission ${kind} control title \"${title}\" drifted from aria-label \"${label}\". Keep the shipped Mission header history copy aligned for stable proof.`,
        );
    }

    return {
        count: Number(match[1]),
        disabled,
        label,
        title,
    };
}

export function missionHistoryButtonLocator(page: Page, kind: MissionHistoryKind): Locator {
    return missionWorkspaceLocator(page, kind === "undo" ? "toolbarUndo" : "toolbarRedo");
}

export async function readMissionHistoryState(page: Page): Promise<MissionHistoryState> {
    const undo = missionHistoryButtonLocator(page, "undo");
    const redo = missionHistoryButtonLocator(page, "redo");

    return {
        undo: await readMissionHistoryButtonState(undo, "undo"),
        redo: await readMissionHistoryButtonState(redo, "redo"),
    };
}

export async function expectMissionHistoryState(
    page: Page,
    expected: {
        undo: Pick<MissionHistoryButtonState, "count" | "disabled">;
        redo: Pick<MissionHistoryButtonState, "count" | "disabled">;
    },
    context: string,
): Promise<void> {
    await expect.poll(
        async () => {
            try {
                const state = await readMissionHistoryState(page);
                return {
                    undo: { count: state.undo.count, disabled: state.undo.disabled },
                    redo: { count: state.redo.count, disabled: state.redo.disabled },
                };
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        },
        {
            message: context,
        },
    ).toEqual(expected);
}

export async function readMissionMapDebugSnapshot(page: Page): Promise<unknown> {
    return page.evaluate(() => {
        return (window as Window & { __IRONWING_MISSION_MAP_DEBUG__?: unknown }).__IRONWING_MISSION_MAP_DEBUG__ ?? null;
    });
}

export async function requireMissionMapDebugSnapshot(page: Page, context: string): Promise<MissionMapDebugSnapshot> {
    const snapshot = await readMissionMapDebugSnapshot(page);
    if (!isMissionMapDebugSnapshot(snapshot)) {
        throw new Error(
            `Mission map debug snapshot was missing or malformed while ${context}. Keep mock-only map diagnostics aligned with src/components/mission/mission-map-debug.ts instead of guessing from the DOM.`,
        );
    }

    return snapshot;
}

function isMissionMapDebugSnapshot(value: unknown): value is MissionMapDebugSnapshot {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const snapshot = value as Partial<MissionMapDebugSnapshot>;
    const counts = snapshot.counts as Record<string, unknown> | undefined;

    return typeof snapshot.mode === "string"
        && typeof snapshot.state === "string"
        && Boolean(snapshot.selection && typeof snapshot.selection === "object")
        && Boolean(snapshot.fenceSelection && typeof snapshot.fenceSelection === "object")
        && counts !== undefined
        && typeof counts.markers === "number"
        && typeof counts.fenceFeatures === "number"
        && typeof counts.rallyMarkers === "number"
        && Array.isArray(snapshot.warnings)
        && snapshot.warnings.every((warning) => typeof warning === "string")
        && typeof snapshot.drawMode === "string"
        && typeof snapshot.drawPointCount === "number"
        && (snapshot.readOnlyReason === null || typeof snapshot.readOnlyReason === "string")
        && (snapshot.selectedRallyPointUiId === null || typeof snapshot.selectedRallyPointUiId === "number")
        && typeof snapshot.selectedSurveyGenerationBlocked === "boolean"
        && typeof snapshot.activeFenceVertexCount === "number"
        && typeof snapshot.activeFenceRadiusCount === "number"
        && typeof snapshot.rallyMarkerCount === "number"
        && typeof snapshot.updateCount === "number";
}

export function operatorWorkspaceLocator(page: Page, selector: keyof typeof operatorWorkspaceSelectors): Locator {
    return page.locator(operatorWorkspaceSelectors[selector]);
}

export function setupWorkspaceLocator(page: Page, selector: keyof typeof setupWorkspaceSelectors): Locator {
    return page.locator(setupWorkspaceSelectors[selector]);
}

export function setupNavLocator(page: Page, sectionId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.navPrefix}-${sectionId}"]`);
}

export function setupNavGroupProgressLocator(page: Page, groupId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.navGroupProgressPrefix}-${groupId}"]`);
}

export function setupStatusNoticeLocator(page: Page, noticeId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.statusNoticePrefix}-${noticeId}"]`);
}

export function setupOverviewCardLocator(page: Page, sectionId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewCardPrefix}-${sectionId}"]`);
}

export function setupOverviewMetricLocator(page: Page, metricId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewMetricPrefix}-${metricId}"]`);
}

export function setupOverviewDocLinkLocator(page: Page, docId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewDocLinkPrefix}-${docId}"]`);
}

export function setupOverviewGroupCountLocator(page: Page, groupId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewGroupCountPrefix}-${groupId}"]`);
}

export function setupOverviewGroupProgressLocator(page: Page, groupId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewGroupProgressPrefix}-${groupId}"]`);
}

export function setupOverviewQuickActionLocator(page: Page, actionId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.overviewQuickActionPrefix}-${actionId}"]`);
}

export function setupRcBarLocator(page: Page, channel: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.rcBarPrefix}-${channel}"]`);
}

export function setupRcPresetLocator(page: Page, presetId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.rcPresetPrefix}-${presetId}"]`);
}

export function setupRcInputLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.rcInputPrefix}-${name}"]`);
}

export function setupRcStageButtonLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.rcStageButtonPrefix}-${name}"]`);
}

export function setupFrameBannerLocator(page: Page, bannerId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.frameBannerPrefix}-${bannerId}"]`);
}

export function setupFrameInputLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.frameInputPrefix}-${name}"]`);
}

export function setupFrameStageButtonLocator(page: Page, name: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.frameStageButtonPrefix}-${name}"]`);
}

export function setupMotorsEscBannerLocator(page: Page, bannerId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscBannerPrefix}-${bannerId}"]`);
}

export function setupMotorsEscRowLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowPrefix}-${motorNumber}"]`);
}

export function setupMotorsEscRowAvailabilityLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowAvailabilityPrefix}-${motorNumber}"]`);
}

export function setupMotorsEscRowTestLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowTestPrefix}-${motorNumber}"]`);
}

export function setupMotorsEscRowReversedLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowReversedPrefix}-${motorNumber}"]`);
}

export function setupMotorsEscRowReverseLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowReversePrefix}-${motorNumber}"]`);
}

export function setupMotorsEscRowResultLocator(page: Page, motorNumber: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.motorsEscRowResultPrefix}-${motorNumber}"]`);
}

export function setupServoOutputsBannerLocator(page: Page, bannerId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsBannerPrefix}-${bannerId}"]`);
}

export function setupServoOutputsFunctionGroupLocator(page: Page, functionValue: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsFunctionGroupPrefix}-${functionValue}"]`);
}

export function setupServoOutputsRowLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRowPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRowMinLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRowMinPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRowReversedLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRowReversedPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRowReverseLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRowReversePrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRowResultLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRowResultPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRawGroupLocator(page: Page, groupId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawGroupPrefix}-${groupId}"]`);
}

export function setupServoOutputsRawRowLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawRowPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRawAvailabilityLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawAvailabilityPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRawReadbackLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawReadbackPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRawInputLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawInputPrefix}-${outputIndex}"]`);
}

export function setupServoOutputsRawSendLocator(page: Page, outputIndex: number): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.servoOutputsRawSendPrefix}-${outputIndex}"]`);
}

export function setupCalibrationCardLocator(page: Page, cardId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.calibrationCardPrefix}-${cardId}"]`);
}

export function setupCalibrationActionLocator(page: Page, cardId: string): Locator {
    return page.locator(`[data-testid="${setupWorkspaceTestIds.calibrationActionPrefix}-${cardId}"]`);
}

export function liveSurfaceLocator(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
    return page.locator(liveSurfaceSelectors[selector]);
}

export function liveSurfaceValueLocator(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
    return liveSurfaceLocator(page, selector).locator(".metric-card__value");
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
    await openSetupWorkspace(page);

    const fullParametersButton = page.locator(setupWorkspaceSelectors.fullParametersNav);
    await expect(
        fullParametersButton,
        "Full Parameters recovery entry is missing from Setup; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the setup workspace navigation.",
    ).toBeVisible();
    await fullParametersButton.click();

    await expect(
        page.locator(parameterWorkspaceSelectors.root),
        "Parameter workspace did not mount after selecting the Full Parameters recovery section.",
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

type MissionLayoutExpectations = {
    mode: "wide" | "compact-wide" | "desktop" | "phone-segmented" | "phone-stack";
    tier: "wide" | "desktop" | "tablet" | "phone";
    detailColumns: "split" | "stacked";
    supportPlacement: "sidebar" | "below";
    showPhoneSegments: boolean;
    phoneSegmentState: "map" | "plan" | "all-visible";
    mapVisible: boolean;
    planVisible: boolean;
    tierMismatch?: boolean;
};

type MissionSupportPanelExpectations = {
    planningStatsVisible: boolean;
    terrainVisible: boolean;
};

const NO_DATA_TERRAIN_TILE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAABFUlEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBPAAB2ClDBAAAAABJRU5ErkJggg==",
    "base64",
);

export async function mockTerrainNoData(page: Page): Promise<void> {
    await page.route("**/elevation-tiles-prod/terrarium/**/*.png", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: NO_DATA_TERRAIN_TILE_PNG,
        });
    });
}

export async function expectMissionLayoutState(page: Page, expected: MissionLayoutExpectations): Promise<void> {
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.layoutDiagnostics),
        "Mission layout diagnostics are missing; keep the responsive proof aligned with the shipped Mission workspace diagnostics instead of scraping layout classes.",
    ).toHaveCount(1);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.layoutMode),
        `Mission layout mode drifted; expected ${expected.mode}.`,
    ).toContainText(expected.mode);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.layoutTier),
        `Mission layout tier drifted; expected ${expected.tier}.`,
    ).toContainText(expected.tier);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.detailColumns),
        `Mission detail panel columns drifted; expected ${expected.detailColumns}.`,
    ).toContainText(expected.detailColumns);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.supportPlacement),
        `Mission support panel placement drifted; expected ${expected.supportPlacement}.`,
    ).toContainText(expected.supportPlacement);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.phoneSegmentState),
        `Mission phone segment diagnostics drifted; expected ${expected.phoneSegmentState}.`,
    ).toContainText(expected.phoneSegmentState);
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.layoutTierMismatch),
        "Mission layout tier-sync diagnostics are missing.",
    ).toContainText((expected.tierMismatch ?? false) ? "mismatch" : "match");
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.mapPane),
        `Mission map pane visibility drifted; expected data-visible=${expected.mapVisible}.`,
    ).toHaveAttribute("data-visible", expected.mapVisible ? "true" : "false");
    await expect(
        page.locator(missionWorkspaceLayoutSelectors.planPane),
        `Mission plan pane visibility drifted; expected data-visible=${expected.planVisible}.`,
    ).toHaveAttribute("data-visible", expected.planVisible ? "true" : "false");

    if (expected.showPhoneSegments) {
        await expect(
            page.locator(missionWorkspaceLayoutSelectors.phoneSegmentBar),
            "Phone-segmented Mission layout should keep the segment bar visible.",
        ).toBeVisible();
    } else {
        await expect(
            page.locator(missionWorkspaceLayoutSelectors.phoneSegmentBar),
            "Non-phone Mission layouts should not render the phone-only segment bar.",
        ).toHaveCount(0);
    }
}

export async function selectMissionPhoneSegment(page: Page, segment: "map" | "plan"): Promise<void> {
    const segmentBar = page.locator(missionWorkspaceLayoutSelectors.phoneSegmentBar);
    const targetButton = page.locator(
        segment === "map"
            ? missionWorkspaceLayoutSelectors.phoneSegmentMap
            : missionWorkspaceLayoutSelectors.phoneSegmentPlan,
    );

    await expect(
        segmentBar,
        "Mission phone segment bar is missing; keep the responsive proof aligned with the mounted segmented shell instead of clicking hidden controls.",
    ).toBeVisible();
    await expect(
        targetButton,
        `Mission ${segment} segment button is missing; the segmented shell must expose explicit Map/Plan controls on phone.`,
    ).toBeVisible();
    await targetButton.click();
    await expect(
        targetButton,
        `Mission ${segment} segment button never reported itself active after the segment switch.`,
    ).toHaveAttribute("data-active", "true");
    await expectMissionLayoutState(page, {
        mode: "phone-segmented",
        tier: "phone",
        detailColumns: "stacked",
        supportPlacement: "below",
        showPhoneSegments: true,
        phoneSegmentState: segment,
        mapVisible: segment === "map",
        planVisible: segment === "plan",
    });
}

export async function expectMissionSupportPanels(
    page: Page,
    expected: MissionSupportPanelExpectations,
): Promise<void> {
    const planningStats = page.locator(missionSupportPanelSelectors.planningStatsPanel);
    const terrainPanel = page.locator(missionSupportPanelSelectors.terrainPanel);

    await expect(
        planningStats,
        "Mission planning stats panel is missing; keep the shared responsive proof selectors aligned with the shipped support panel test ids.",
    ).toHaveCount(1);
    await expect(
        terrainPanel,
        "Mission terrain panel is missing; keep the shared responsive proof selectors aligned with the shipped support panel test ids.",
    ).toHaveCount(1);

    if (expected.planningStatsVisible) {
        await expect(
            planningStats,
            "Mission planning stats should be visible in the current layout segment.",
        ).toBeVisible();
        await expect(
            page.locator(missionSupportPanelSelectors.planningStatsSpeedStatus),
            "Mission planning stats status badge is missing; selector drift should fail loudly instead of hiding the panel behind generic markup.",
        ).toBeVisible();
    } else {
        await expect(
            planningStats,
            "Mission planning stats should stay mounted but hidden in the inactive phone segment.",
        ).toBeHidden();
    }

    if (expected.terrainVisible) {
        await expect(
            terrainPanel,
            "Mission terrain panel should be visible in the current layout segment.",
        ).toBeVisible();
        await expect(
            page.locator(missionSupportPanelSelectors.terrainStatus),
            "Mission terrain status badge is missing; selector drift should fail loudly instead of masking support-panel regressions.",
        ).toBeVisible();
    } else {
        await expect(
            terrainPanel,
            "Mission terrain panel should stay mounted but hidden in the inactive phone segment.",
        ).toBeHidden();
    }
}

export function missionTerrainWarningActionLocator(page: Page, index: number): Locator {
    return page.locator(`[data-testid="${missionWorkspaceTestIds.terrainWarningActionPrefix}-${index}"]`);
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
            emitLiveConfigurationFactsDomain: (facts) => emitLiveScopedDomain(page, "configuration_facts://state", facts),
            emitLiveCalibrationDomain: (calibration) => emitLiveScopedDomain(page, "calibration://state", calibration),
            emitLiveStatusTextDomain: (statusText) => emitLiveScopedDomain(page, "status_text://state", statusText),
            emitMissionState: (missionState) => withMockController(page, "emitMissionState", missionState),
            emitMissionProgress: (missionProgress) => withMockController(page, "emitMissionProgress", missionProgress),
    emitParamStore: (paramStore) => withMockController(page, "emitParamStore", paramStore),
    emitParamProgress: (paramProgress) => withMockController(page, "emitParamProgress", paramProgress),
    emitLiveGuidedState: (guidedState) => withMockController(page, "emitLiveGuidedState", guidedState),
    emitLogProgress: (progress) => withMockController(page, "emitLogProgress", progress),
    emitPlaybackState: (playbackState) => withMockController(page, "emitPlaybackState", playbackState),
    setLogLibraryCatalog: (catalog) => withMockController(page, "setLogLibraryCatalog", catalog),
    seedLogLibrary: (presets) => presets ? withMockController(page, "seedLogLibrary", presets) : withMockController(page, "seedLogLibrary"),
    getLogLibraryCatalog: () => withMockController(page, "getLogLibraryCatalog"),
    getSeededLogEntry: (preset) => withMockController(page, "getSeededLogEntry", preset),
    setRecordingStatus: (status) => withMockController(page, "setRecordingStatus", status),
    setRecordingSettings: (settings) => withMockController(page, "setRecordingSettings", settings),
    resolveDeferredConnectLink: (params) => withMockController(page, "resolveDeferredConnectLink", params),
    getInvocations: () => withMockController(page, "getInvocations"),
    getLiveEnvelope: () => withMockController(page, "getLiveEnvelope"),
    setOpenLogFilePreset: async (preset) => {
        const seeded = await withMockController<{ name: string; type: string; bytes: number[] }>(page, "getSeededLogPickerFile", preset);
        await withMockFilePicker(page, "setOpenBinaryFile", seeded.bytes, seeded.name, seeded.type);
    },
    setOpenFile: (contents, name, type) => withMockFilePicker(page, "setOpenFile", contents, name, type),
            setOpenBinaryFile: (contents, name, type) => withMockFilePicker(page, "setOpenBinaryFile", contents, name, type),
            getOpenFileState: () => withMockFilePicker(page, "getOpenFileState"),
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

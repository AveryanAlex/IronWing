import { writable, type Readable } from "svelte/store";

import type { CalibrationLifecycle } from "../../calibration";
import type { SessionEnvelope, SourceKind } from "../../session";
import type { CompactStatusNotice } from "../../statustext";
import { selectCompactStatusNotices } from "../../statustext";
import { deriveSetupSectionStatuses } from "../configuration-facts";
import { selectTelemetryView } from "../telemetry-selectors";
import {
  SECTION_IDS,
  SETUP_SECTION_CATALOG,
  computeOverallProgress,
  getSetupSectionDefinition,
  getSetupSectionGroupDefinition,
  groupSetupSections,
  type OverallProgress,
  type SectionStatus,
  type SetupSectionId,
} from "../setup-sections";
import type { ParamsMetadataState, ParamsStoreState } from "./params";
import type { SessionStorePhase, SessionStoreState } from "./session";

type SetupCheckpointSeed = {
  resumeSectionId: SetupSectionId;
  scopeKey: string | null;
  scopeFamilyKey: string | null;
  resumeRevision: number | null;
};

type CalibrationCardId = "accel" | "gyro" | "compass" | "radio";

type RcSignalState = "disconnected" | "waiting" | "live" | "stale" | "degraded";

type CalibrationActionAvailability = "available" | "blocked" | "unsupported";

type ScopedSectionConfirmations = Partial<Record<SetupSectionId, boolean>>;

type SetupWorkspaceConfirmationPayload = {
  scopeKey?: unknown;
  confirmedSections?: unknown;
};

const IMPLEMENTED_SECTION_ID_SET = new Set<SetupSectionId>([
  "overview",
  "frame_orientation",
  "calibration",
  "gps",
  "battery_monitor",
  "motors_esc",
  "servo_outputs",
  "serial_ports",
  "flight_modes",
  "failsafe",
  "rtl_return",
  "geofence",
  "arming",
  "initial_params",
  "pid_tuning",
  "peripherals",
  "rc_receiver",
  "full_parameters",
]);

export type SetupWorkspaceReadiness = "bootstrapping" | "unavailable" | "ready" | "degraded";
export type SetupWorkspaceSectionAvailability = "available" | "blocked";
export type SetupWorkspaceCheckpointPhase = "idle" | "resume_pending" | "resume_complete" | "scope_changed";

export type SetupWorkspaceCheckpointState = {
  phase: SetupWorkspaceCheckpointPhase;
  resumeSectionId: SetupSectionId | null;
  scopeKey: string | null;
  scopeFamilyKey: string | null;
  resumeRevision: number | null;
  reason: string | null;
  title: string | null;
  detailText: string | null;
  blocksActions: boolean;
};

export type SetupWorkspaceSection = {
  id: SetupSectionId;
  title: string;
  description: string;
  kind: "overview" | "guided" | "recovery";
  groupId: string;
  groupTitle: string;
  availability: SetupWorkspaceSectionAvailability;
  status: SectionStatus | null;
  statusText: string;
  confidenceText: string | null;
  gateText: string | null;
  detailText: string;
  trackable: boolean;
  implemented: boolean;
};

export type SetupWorkspaceSectionGroup = {
  id: string;
  title: string;
  description: string;
  sections: SetupWorkspaceSection[];
  progress: OverallProgress;
  progressText: string;
  blockedCount: number;
  unconfirmedCount: number;
  implementedCount: number;
};

export type SetupWorkspaceRcChannel = {
  channel: number;
  pwm: number;
  percent: number;
  stale: boolean;
};

export type SetupWorkspaceRcReceiverState = {
  signalState: RcSignalState;
  statusText: string;
  detailText: string;
  rssi: number | null;
  rssiText: string;
  channels: SetupWorkspaceRcChannel[];
  hasMalformedChannels: boolean;
};

export type SetupWorkspaceCalibrationLifecycle = CalibrationLifecycle | "unavailable";

export type SetupWorkspaceCalibrationCard = {
  id: CalibrationCardId;
  title: string;
  lifecycle: SetupWorkspaceCalibrationLifecycle;
  statusText: string;
  detailText: string;
  actionLabel: string | null;
  actionAvailability: CalibrationActionAvailability;
};

export type SetupWorkspaceCalibrationSummary = {
  cards: SetupWorkspaceCalibrationCard[];
};

export type SetupWorkspaceStoreState = {
  readiness: SetupWorkspaceReadiness;
  stateText: string;
  activeEnvelope: SessionEnvelope | null;
  activeSource: SourceKind | null;
  activeScopeKey: string | null;
  lastAcceptedScopeKey: string | null;
  sessionPhase: SessionStorePhase;
  liveSessionConnected: boolean;
  scopeText: string;
  metadataState: ParamsMetadataState;
  metadataText: string;
  metadataGateActive: boolean;
  metadataGateText: string | null;
  noticeText: string | null;
  progress: OverallProgress;
  progressText: string;
  selectedSectionId: SetupSectionId;
  sections: SetupWorkspaceSection[];
  sectionGroups: SetupWorkspaceSectionGroup[];
  sectionStatuses: Record<SetupSectionId, SectionStatus>;
  sectionConfirmations: Record<SetupSectionId, boolean>;
  confirmationScopeKey: string | null;
  checkpoint: SetupWorkspaceCheckpointState;
  statusNotices: CompactStatusNotice[];
  rcReceiver: SetupWorkspaceRcReceiverState;
  calibrationSummary: SetupWorkspaceCalibrationSummary;
  canOpenFullParameters: boolean;
};

export type SetupWorkspaceCheckpointInput = {
  phase?: SetupWorkspaceCheckpointPhase;
  resumeSectionId?: string | null;
  scopeKey?: string | null;
  reason?: string | null;
};

function createIdleCheckpoint(): SetupWorkspaceCheckpointState {
  return {
    phase: "idle",
    resumeSectionId: null,
    scopeKey: null,
    scopeFamilyKey: null,
    resumeRevision: null,
    reason: null,
    title: null,
    detailText: null,
    blocksActions: false,
  };
}

function createInitialRcReceiverState(): SetupWorkspaceRcReceiverState {
  return {
    signalState: "waiting",
    statusText: "Waiting for RC signal",
    detailText: "Connect to a live session to inspect truthful RC input.",
    rssi: null,
    rssiText: "RSSI --",
    channels: [],
    hasMalformedChannels: false,
  };
}

function createCalibrationCard(
  input: Omit<SetupWorkspaceCalibrationCard, "actionLabel" | "actionAvailability"> & {
    actionLabel?: string | null;
    actionAvailability?: CalibrationActionAvailability;
  },
): SetupWorkspaceCalibrationCard {
  return {
    ...input,
    actionLabel: input.actionLabel ?? null,
    actionAvailability: input.actionAvailability ?? "blocked",
  };
}

function createInitialCalibrationSummary(): SetupWorkspaceCalibrationSummary {
  return {
    cards: [
      createCalibrationCard({
        id: "accel",
        title: "Accelerometer",
        lifecycle: "not_started",
        statusText: "Not started",
        detailText: "Dedicated accelerometer workflow lands later in Setup.",
      }),
      createCalibrationCard({
        id: "gyro",
        title: "Gyroscope",
        lifecycle: "not_started",
        statusText: "Not started",
        detailText: "Quick gyro calibration stays outside this workspace for now.",
      }),
      createCalibrationCard({
        id: "compass",
        title: "Compass",
        lifecycle: "not_started",
        statusText: "Not started",
        detailText: "Compass lifecycle will appear here when the vehicle reports it.",
        actionLabel: "Start compass calibration",
      }),
      createCalibrationCard({
        id: "radio",
        title: "Radio",
        lifecycle: "unavailable",
        statusText: "Unavailable",
        detailText: "Radio calibration availability has not been confirmed yet.",
        actionAvailability: "unsupported",
      }),
    ],
  };
}

function createUnknownSectionStatusRecord(): Record<SetupSectionId, SectionStatus> {
  return Object.fromEntries(SECTION_IDS.map((id) => [id, "unknown"])) as Record<SetupSectionId, SectionStatus>;
}

function createEmptySectionConfirmationRecord(): Record<SetupSectionId, boolean> {
  return Object.fromEntries(SECTION_IDS.map((id) => [id, false])) as Record<SetupSectionId, boolean>;
}

function isSetupSectionId(value: string): value is SetupSectionId {
  return SECTION_IDS.includes(value as SetupSectionId);
}

function normalizeScopedSectionConfirmations(input: unknown): ScopedSectionConfirmations {
  if (Array.isArray(input)) {
    return Object.fromEntries(
      input.filter((value): value is SetupSectionId => typeof value === "string" && isSetupSectionId(value)).map((id) => [id, true]),
    ) as ScopedSectionConfirmations;
  }

  if (!input || typeof input !== "object") {
    return {};
  }

  const confirmations: ScopedSectionConfirmations = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSetupSectionId(key) && value === true) {
      confirmations[key] = true;
    }
  }

  return confirmations;
}

function normalizeSectionConfirmationPayload(input: unknown): {
  scopeKey: string | null;
  confirmedSections: ScopedSectionConfirmations;
} {
  const payload = (input ?? {}) as SetupWorkspaceConfirmationPayload;
  const scopeKey = typeof payload.scopeKey === "string" && payload.scopeKey.trim().length > 0
    ? payload.scopeKey
    : null;

  return {
    scopeKey,
    confirmedSections: normalizeScopedSectionConfirmations(payload.confirmedSections),
  };
}

function toSectionConfirmationRecord(input: ScopedSectionConfirmations | null | undefined): Record<SetupSectionId, boolean> {
  const record = createEmptySectionConfirmationRecord();

  if (!input) {
    return record;
  }

  for (const id of SECTION_IDS) {
    record[id] = input[id] === true;
  }

  return record;
}

function scopeKey(envelope: SessionEnvelope | null): string | null {
  if (!envelope) {
    return null;
  }

  return [
    envelope.session_id,
    envelope.source_kind,
    envelope.seek_epoch,
    envelope.reset_revision,
  ].join(":");
}

function scopeFamilyKey(envelope: SessionEnvelope | null): string | null {
  if (!envelope) {
    return null;
  }

  return [
    envelope.session_id,
    envelope.source_kind,
    envelope.seek_epoch,
  ].join(":");
}

function formatReadinessText(readiness: SetupWorkspaceReadiness): string {
  switch (readiness) {
    case "ready":
      return "Setup ready";
    case "degraded":
      return "Setup degraded";
    case "unavailable":
      return "Setup unavailable";
    case "bootstrapping":
    default:
      return "Bootstrapping setup";
  }
}

function formatScopeText(envelope: SessionEnvelope | null): string {
  if (!envelope) {
    return "No active setup scope";
  }

  return `${envelope.session_id} · ${envelope.source_kind} · rev ${envelope.reset_revision}`;
}

function formatMetadataText(state: ParamsMetadataState, error: string | null): string {
  switch (state) {
    case "ready":
      return "Metadata ready";
    case "loading":
      return "Loading metadata";
    case "unavailable":
      return error ? `Metadata unavailable · ${error}` : "Metadata unavailable";
    case "idle":
    default:
      return "Metadata idle";
  }
}

function resolveSetupReadiness(
  sessionState: SessionStoreState,
  paramsState: ParamsStoreState,
): SetupWorkspaceReadiness {
  if (
    !sessionState.hydrated
    || sessionState.lastPhase === "subscribing"
    || sessionState.lastPhase === "bootstrapping"
    || !paramsState.hydrated
    || paramsState.phase === "subscribing"
  ) {
    return "bootstrapping";
  }

  if (!sessionState.activeEnvelope) {
    return "unavailable";
  }

  if (sessionState.activeSource === "playback") {
    return "degraded";
  }

  if (paramsState.streamError || paramsState.metadataState === "unavailable") {
    return "degraded";
  }

  if (!paramsState.paramStore && !paramsState.paramProgress) {
    return "bootstrapping";
  }

  return "ready";
}

function resolveMetadataGateText(paramsState: Pick<ParamsStoreState, "metadataState">): string | null {
  switch (paramsState.metadataState) {
    case "loading":
      return "Purpose-built setup sections stay limited until parameter metadata finishes loading.";
    case "unavailable":
      return "Parameter metadata is unavailable. Overview stays truthful and Full Parameters is the recovery path.";
    case "idle":
      return "Setup is still waiting for parameter metadata before enabling purpose-built sections.";
    case "ready":
    default:
      return null;
  }
}

function resolveNoticeText(input: {
  sessionState: SessionStoreState;
  paramsState: ParamsStoreState;
  readiness: SetupWorkspaceReadiness;
  metadataGateText: string | null;
}): string | null {
  if (input.paramsState.scopeClearWarning) {
    return input.paramsState.scopeClearWarning;
  }

  if (input.sessionState.activeSource === "playback") {
    return "Setup remains read-only during playback. Live actions and raw recovery stay disabled.";
  }

  if (!input.sessionState.activeEnvelope) {
    return "Connect to a live session to load truthful setup state.";
  }

  if (input.paramsState.streamError) {
    return "Live parameter updates are unavailable right now. Overview stays mounted with explicit degraded state.";
  }

  if (input.metadataGateText) {
    return input.metadataGateText;
  }

  if (input.readiness === "bootstrapping") {
    return "Waiting for session and parameter domains to finish bootstrapping.";
  }

  if (input.sessionState.lastError) {
    return input.sessionState.lastError;
  }

  if (input.paramsState.lastNotice) {
    return input.paramsState.lastNotice;
  }

  return null;
}

function formatProgressText(progress: OverallProgress): string {
  return `${progress.completed}/${progress.total} confirmed`;
}

function formatSectionStatusText(status: SectionStatus): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In progress";
    case "failed":
      return "Failed";
    case "not_started":
      return "Not started";
    case "unknown":
    default:
      return "Unknown";
  }
}

function describeGuidedSectionStatus(status: SectionStatus, sectionId: SetupSectionId): string {
  if (sectionId === "motors_esc") {
    switch (status) {
      case "complete":
        return "Motor and ESC facts are confirmed for this scope.";
      case "in_progress":
        return "Motor and ESC setup is in progress. Keep ownership, direction, and reboot truth explicit before testing again.";
      case "failed":
        return "Motor or ESC setup reported a failed state that still needs attention.";
      case "not_started":
        return "Motor and ESC setup has not been confirmed yet.";
      case "unknown":
      default:
        return "Motor and ESC truth is still partial because the active configuration-facts contract does not yet prove output ownership globally.";
    }
  }

  if (sectionId === "servo_outputs") {
    switch (status) {
      case "complete":
        return "Servo output configuration is confirmed for this scope.";
      case "in_progress":
        return "Servo output setup is in progress. Keep staged reversal changes in the shared review tray until the scope refreshes.";
      case "failed":
        return "Servo output setup reported a failed state that still needs attention.";
      case "not_started":
        return "Servo outputs are visible as an expert section, but this workspace does not claim global completion for them yet.";
      case "unknown":
      default:
        return "Servo output truth is still partial, so the section stays explicit instead of bluffing configured state.";
    }
  }

  if (sectionId === "rc_receiver") {
    switch (status) {
      case "complete":
        return "Receiver facts and calibration state are confirmed for this scope.";
      case "in_progress":
        return "Receiver setup is in progress. Check live bars and the shared review tray before applying more changes.";
      case "failed":
        return "Receiver setup reported a failed state that still needs attention.";
      case "not_started":
        return "Receiver setup has not been confirmed yet.";
      case "unknown":
      default:
        return "Receiver truth is still partial, so the section stays explicit instead of guessing live RC state.";
    }
  }

  if (sectionId === "calibration") {
    switch (status) {
      case "complete":
        return "Current calibration facts report complete state for the visible setup steps.";
      case "in_progress":
        return "Calibration is in progress. Keep the lifecycle visible until the vehicle reports the next scoped update.";
      case "failed":
        return "Calibration reported a failed state. Review status text before retrying.";
      case "not_started":
        return "Calibration has not started yet for this scope.";
      case "unknown":
      default:
        return "Calibration truth is partial, so the lifecycle stays unconfirmed instead of bluffing readiness.";
    }
  }

  switch (status) {
    case "complete":
      return "Live facts confirm this section is complete.";
    case "in_progress":
      return "Live facts show this section is partially complete.";
    case "failed":
      return "Live facts show a failed step that still needs attention.";
    case "not_started":
      return "Live facts do not confirm this section yet.";
    case "unknown":
    default:
      return "Live facts are partial, so this section stays unconfirmed instead of bluffing completion.";
  }
}

function resolveGuidedSectionGateText(input: {
  sessionState: SessionStoreState;
  metadataGateText: string | null;
  liveSessionConnected: boolean;
}): string | null {
  if (!input.sessionState.activeEnvelope) {
    return "Connect to a live session to inspect this section.";
  }

  if (input.sessionState.activeSource === "playback") {
    return "Purpose-built setup sections stay blocked during playback, but the section remains inspectable.";
  }

  if (input.metadataGateText) {
    return input.metadataGateText;
  }

  if (!input.liveSessionConnected) {
    return "This section stays blocked until the live vehicle connection is active.";
  }

  return null;
}

function resolveFullParametersAvailability(sessionState: SessionStoreState): {
  availability: SetupWorkspaceSectionAvailability;
  gateText: string | null;
} {
  if (sessionState.activeSource === "playback") {
    return {
      availability: "blocked",
      gateText: "Full Parameters recovery stays disabled during playback, but the recovery section remains visible.",
    };
  }

  return {
    availability: "available",
    gateText: null,
  };
}

function describePlannedSectionStatus(status: SectionStatus, sectionId: SetupSectionId): string {
  const definition = getSetupSectionDefinition(sectionId);

  switch (status) {
    case "complete":
      return `${definition.title} is confirmed for this scope. The purpose-built editor lands later in this slice, so the workspace keeps the section visible without inventing controls.`;
    case "in_progress":
      return `${definition.title} is partially confirmed for this scope. Keep progress conservative until the dedicated editor lands and can prove the next step.`;
    case "failed":
      return `${definition.title} reported a failed or blocked state. Review the current vehicle values or recover through Full Parameters before retrying.`;
    case "not_started":
      return `${definition.title} is visible in the expert catalog, but the current scope has not confirmed it yet.`;
    case "unknown":
    default:
      return `${definition.title} truth is still partial for this scope, so the workspace keeps it visible and unconfirmed instead of bluffing completion.`;
  }
}

function buildCatalogSections(input: {
  sessionState: SessionStoreState;
  sectionStatuses: Record<SetupSectionId, SectionStatus>;
  metadataGateText: string | null;
  liveSessionConnected: boolean;
}): SetupWorkspaceSection[] {
  const guidedGateText = resolveGuidedSectionGateText({
    sessionState: input.sessionState,
    metadataGateText: input.metadataGateText,
    liveSessionConnected: input.liveSessionConnected,
  });
  const fullParametersState = resolveFullParametersAvailability(input.sessionState);

  return SETUP_SECTION_CATALOG.map((definition) => {
    const group = getSetupSectionGroupDefinition(definition.groupId);
    const implemented = IMPLEMENTED_SECTION_ID_SET.has(definition.id);

    if (definition.id === "overview") {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        kind: definition.kind,
        groupId: group.id,
        groupTitle: group.title,
        availability: "available",
        status: null,
        statusText: "Dashboard",
        confidenceText: null,
        gateText: null,
        detailText: "Use the grouped dashboard to inspect truthful setup status before opening a section.",
        trackable: definition.trackable,
        implemented,
      } satisfies SetupWorkspaceSection;
    }

    if (definition.id === "full_parameters") {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        kind: definition.kind,
        groupId: group.id,
        groupTitle: group.title,
        availability: fullParametersState.availability,
        status: null,
        statusText: "Recovery",
        confidenceText: null,
        gateText: fullParametersState.gateText,
        detailText: fullParametersState.gateText
          ?? "Open the shared parameter workspace when metadata is degraded or you need raw access.",
        trackable: definition.trackable,
        implemented,
      } satisfies SetupWorkspaceSection;
    }

    const status = input.sectionStatuses[definition.id];
    const gateText = guidedGateText;

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      kind: definition.kind,
      groupId: group.id,
      groupTitle: group.title,
      availability: gateText ? "blocked" : "available",
      status,
      statusText: formatSectionStatusText(status),
      confidenceText: status === "unknown" ? "Unconfirmed" : null,
      gateText,
      detailText: gateText
        ? `${gateText} ${implemented ? describeGuidedSectionStatus(status, definition.id) : describePlannedSectionStatus(status, definition.id)}`
        : implemented
          ? describeGuidedSectionStatus(status, definition.id)
          : describePlannedSectionStatus(status, definition.id),
      trackable: definition.trackable,
      implemented,
    } satisfies SetupWorkspaceSection;
  });
}

function buildSectionGroups(sections: SetupWorkspaceSection[]): SetupWorkspaceSectionGroup[] {
  return groupSetupSections(sections).map(({ group, sections: groupedSections }) => {
    const progress = computeOverallProgress(new Map(
      groupedSections
        .filter((section) => section.status !== null)
        .map((section) => [section.id, section.status ?? "unknown"]),
    ));

    let progressText = `${progress.completed}/${progress.total} confirmed`;
    if (progress.total === 0) {
      progressText = group.id === "workspace"
        ? "Dashboard"
        : group.id === "recovery"
          ? "Recovery"
          : "Status only";
    }

    return {
      id: group.id,
      title: group.title,
      description: group.description,
      sections: groupedSections,
      progress,
      progressText,
      blockedCount: groupedSections.filter((section) => section.availability === "blocked").length,
      unconfirmedCount: groupedSections.filter((section) => section.status === "unknown" || section.status === "not_started").length,
      implementedCount: groupedSections.filter((section) => section.implemented).length,
    } satisfies SetupWorkspaceSectionGroup;
  });
}

function deriveSectionStatuses(
  sessionState: SessionStoreState,
  previousStatuses: Record<SetupSectionId, SectionStatus> | null,
  sameScope: boolean,
  currentScopeConfirmations: ScopedSectionConfirmations,
): Record<SetupSectionId, SectionStatus> {
  if (!sessionState.activeEnvelope) {
    return createUnknownSectionStatusRecord();
  }

  const next = deriveSetupSectionStatuses({
    vehicle_type: sessionState.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
    confirmed_sections: currentScopeConfirmations,
    support: sessionState.support,
    sensor_health: sessionState.sensorHealth,
    configuration_facts: sessionState.configurationFacts,
    calibration: sessionState.calibration,
  });

  const resolved = createUnknownSectionStatusRecord();
  for (const id of SECTION_IDS) {
    resolved[id] = next.get(id) ?? "unknown";
  }

  if (!sameScope || previousStatuses === null) {
    return resolved;
  }

  for (const id of SECTION_IDS) {
    if (resolved[id] === "unknown" && previousStatuses[id] !== "unknown") {
      resolved[id] = previousStatuses[id];
    }
  }

  return resolved;
}

function resolveStatusNotices(
  entries: CompactStatusNotice[],
  previous: CompactStatusNotice[],
  sameScope: boolean,
): CompactStatusNotice[] {
  if (entries.length > 0) {
    return entries;
  }

  return sameScope ? previous : [];
}

function clampPercent(value: number, min = 800, max = 2200): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function normalizeRssi(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function formatRssiText(value: number | null): string {
  return value === null ? "RSSI --" : `RSSI ${value}%`;
}

function normalizeRcChannels(value: unknown, stale = false): {
  channels: SetupWorkspaceRcChannel[];
  malformed: boolean;
} {
  if (!Array.isArray(value)) {
    return {
      channels: [],
      malformed: value != null,
    };
  }

  let malformed = false;
  const channels: SetupWorkspaceRcChannel[] = [];

  for (const [index, entry] of value.slice(0, 18).entries()) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry >= 500 && entry <= 3000) {
      channels.push({
        channel: index + 1,
        pwm: Math.round(entry),
        percent: clampPercent(entry),
        stale,
      });
      continue;
    }

    malformed = true;
  }

  return { channels, malformed };
}

function deriveRcReceiverState(input: {
  sessionState: SessionStoreState;
  sameScope: boolean;
  previous: SetupWorkspaceRcReceiverState | null;
}): SetupWorkspaceRcReceiverState {
  const connected = input.sessionState.sessionDomain.value?.connection.kind === "connected";
  const telemetry = selectTelemetryView(input.sessionState.telemetryDomain);
  const current = normalizeRcChannels(telemetry.rc_channels);
  const previousChannels = input.sameScope ? input.previous?.channels ?? [] : [];
  const previousRssi = input.sameScope ? input.previous?.rssi ?? null : null;
  const currentRssi = normalizeRssi(telemetry.rc_rssi);

  if (current.channels.length > 0) {
    if (!connected) {
      return {
        signalState: "stale",
        statusText: "Last good sample",
        detailText: "The vehicle link is not connected. Showing the last truthful RC sample from this scope.",
        rssi: currentRssi,
        rssiText: formatRssiText(currentRssi),
        channels: current.channels.map((channel) => ({ ...channel, stale: true })),
        hasMalformedChannels: current.malformed,
      };
    }

    if (current.malformed) {
      return {
        signalState: "degraded",
        statusText: `${current.channels.length} valid channels`,
        detailText: "Dropped invalid PWM samples and kept only the valid live RC channels.",
        rssi: currentRssi,
        rssiText: formatRssiText(currentRssi),
        channels: current.channels,
        hasMalformedChannels: true,
      };
    }

    return {
      signalState: "live",
      statusText: `${current.channels.length} live`,
      detailText: "Live RC input is visible. Use presets or manual mapping to queue channel-order changes through the shared review tray.",
      rssi: currentRssi,
      rssiText: formatRssiText(currentRssi),
      channels: current.channels,
      hasMalformedChannels: false,
    };
  }

  if (current.malformed) {
    return {
      signalState: "degraded",
      statusText: "Malformed RC signal",
      detailText: "The latest RC payload was malformed, so Setup dropped it instead of drawing fake bars.",
      rssi: currentRssi,
      rssiText: formatRssiText(currentRssi),
      channels: [],
      hasMalformedChannels: true,
    };
  }

  if (input.sameScope && previousChannels.length > 0) {
    const shouldRetain = !connected || input.sessionState.telemetryDomain.complete === false || telemetry.rc_channels == null;
    if (shouldRetain) {
      return {
        signalState: "stale",
        statusText: "Last good sample",
        detailText: "Last good sample retained while RC telemetry settles for the current scope.",
        rssi: currentRssi ?? previousRssi,
        rssiText: formatRssiText(currentRssi ?? previousRssi),
        channels: previousChannels.map((channel) => ({ ...channel, stale: true })),
        hasMalformedChannels: false,
      };
    }
  }

  if (!connected) {
    return {
      signalState: "disconnected",
      statusText: "Disconnected",
      detailText: "Connect to a live vehicle to inspect truthful RC input.",
      rssi: null,
      rssiText: "RSSI --",
      channels: [],
      hasMalformedChannels: false,
    };
  }

  return {
    signalState: "waiting",
    statusText: "Waiting for RC signal",
    detailText: "Move the transmitter sticks or switches once the receiver link is active. Manual channel mapping stays available without fake live bars.",
    rssi: currentRssi,
    rssiText: formatRssiText(currentRssi),
    channels: [],
    hasMalformedChannels: false,
  };
}

function normalizeLifecycle(step: unknown): {
  lifecycle: CalibrationLifecycle | null;
  malformed: boolean;
  progressPct: number | null;
  autosaved: boolean | null;
} {
  if (!step || typeof step !== "object") {
    return {
      lifecycle: null,
      malformed: false,
      progressPct: null,
      autosaved: null,
    };
  }

  const lifecycle = (step as { lifecycle?: unknown }).lifecycle;
  const progressPct = typeof (step as { progress?: { completion_pct?: unknown } }).progress?.completion_pct === "number"
    && Number.isFinite((step as { progress?: { completion_pct?: number } }).progress?.completion_pct)
    ? Math.round((step as { progress?: { completion_pct?: number } }).progress?.completion_pct ?? 0)
    : null;
  const autosaved = typeof (step as { report?: { autosaved?: unknown } }).report?.autosaved === "boolean"
    ? Boolean((step as { report?: { autosaved?: boolean } }).report?.autosaved)
    : null;

  switch (lifecycle) {
    case "not_started":
    case "running":
    case "complete":
    case "failed":
      return {
        lifecycle,
        malformed: false,
        progressPct,
        autosaved,
      };
    default:
      return {
        lifecycle: null,
        malformed: true,
        progressPct: null,
        autosaved: null,
      };
  }
}

function statusTextFromLifecycle(lifecycle: SetupWorkspaceCalibrationLifecycle, progressPct: number | null): string {
  switch (lifecycle) {
    case "running":
      return progressPct === null ? "Running" : `Running · ${progressPct}%`;
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "unavailable":
      return "Unavailable";
    case "not_started":
    default:
      return "Not started";
  }
}

function buildAccelCard(input: {
  supported: boolean | null;
  step: unknown;
  previous: SetupWorkspaceCalibrationCard | null;
  sameScope: boolean;
}): SetupWorkspaceCalibrationCard {
  const normalized = normalizeLifecycle(input.step);
  const preserve = input.sameScope && !normalized.malformed && normalized.lifecycle === null && input.previous !== null && input.supported !== false;
  const lifecycle = preserve
    ? input.previous?.lifecycle ?? "not_started"
    : input.supported === false
      ? "unavailable"
      : normalized.malformed
        ? "not_started"
        : normalized.lifecycle ?? "not_started";

  const detailText = preserve
    ? input.previous?.detailText ?? "Accelerometer lifecycle is still waiting for a scoped update."
    : input.supported === false
      ? "This vehicle does not expose accelerometer calibration support on the active shell contract."
      : normalized.malformed
        ? "Accelerometer lifecycle payload was malformed, so Setup fell back to a truthful not-started state."
        : lifecycle === "complete"
          ? "The vehicle reports accelerometer calibration complete. Dedicated step-by-step controls land later in Setup."
          : lifecycle === "running"
            ? "Accelerometer calibration is already running on the vehicle. Keep the lifecycle visible until the next scoped update arrives."
            : lifecycle === "failed"
              ? "Accelerometer calibration failed. Review status text before retrying it elsewhere."
              : "Dedicated accelerometer workflow lands later in Setup, but the current lifecycle stays visible here.";

  return createCalibrationCard({
    id: "accel",
    title: "Accelerometer",
    lifecycle,
    statusText: preserve
      ? input.previous?.statusText ?? statusTextFromLifecycle(lifecycle, normalized.progressPct)
      : statusTextFromLifecycle(lifecycle, normalized.progressPct),
    detailText,
  });
}

function buildGyroCard(checkpoint: SetupWorkspaceCheckpointState): SetupWorkspaceCalibrationCard {
  return createCalibrationCard({
    id: "gyro",
    title: "Gyroscope",
    lifecycle: "not_started",
    statusText: "Not started",
    detailText: checkpoint.blocksActions
      ? "Gyroscope quick calibration remains blocked while the reboot/reconnect checkpoint is unresolved."
      : "Gyroscope quick calibration stays outside this slice. Keep the vehicle still and level when you run it elsewhere.",
  });
}

function buildCompassCard(input: {
  supported: boolean | null;
  step: unknown;
  previous: SetupWorkspaceCalibrationCard | null;
  sameScope: boolean;
  liveSessionConnected: boolean;
  checkpoint: SetupWorkspaceCheckpointState;
}): SetupWorkspaceCalibrationCard {
  const normalized = normalizeLifecycle(input.step);
  const preserve = input.sameScope && !normalized.malformed && normalized.lifecycle === null && input.previous !== null && input.supported !== false;
  const lifecycle = preserve
    ? input.previous?.lifecycle ?? "not_started"
    : input.supported === false
      ? "unavailable"
      : normalized.malformed
        ? "not_started"
        : normalized.lifecycle ?? "not_started";
  const actionAvailability: CalibrationActionAvailability = input.supported === false
    ? "unsupported"
    : input.checkpoint.blocksActions || !input.liveSessionConnected
      ? "blocked"
      : "available";
  const actionLabel = input.supported === false
    ? null
    : lifecycle === "running"
      ? "Cancel compass calibration"
      : lifecycle === "complete"
        ? "Accept calibration"
        : "Start compass calibration";
  const detailText = preserve
    ? input.previous?.detailText ?? "Compass lifecycle is still waiting for a scoped update."
    : input.supported === false
      ? "Compass calibration is unavailable for this vehicle on the active shell contract."
      : normalized.malformed
        ? "Compass lifecycle payload was malformed, so Setup fell back to a truthful not-started state while keeping status text visible."
        : lifecycle === "running"
          ? "Compass calibration is running. Keep rotating the vehicle until the lifecycle advances."
          : lifecycle === "complete"
            ? normalized.autosaved === true
              ? "Compass calibration completed and the vehicle reported autosave. Accept it to clear the active lifecycle."
              : "Compass calibration completed. Accept it once you are ready to confirm the result."
            : lifecycle === "failed"
              ? "Compass calibration failed. Review status text and restart when the vehicle is ready."
              : input.checkpoint.blocksActions
                ? "Compass actions stay blocked until the reboot/reconnect checkpoint is resolved."
                : "Start compass calibration from this card when the live vehicle link is stable.";

  return createCalibrationCard({
    id: "compass",
    title: "Compass",
    lifecycle,
    statusText: preserve
      ? input.previous?.statusText ?? statusTextFromLifecycle(lifecycle, normalized.progressPct)
      : statusTextFromLifecycle(lifecycle, normalized.progressPct),
    detailText,
    actionLabel,
    actionAvailability,
  });
}

function buildRadioCard(input: {
  supported: boolean | null;
  step: unknown;
  previous: SetupWorkspaceCalibrationCard | null;
  sameScope: boolean;
}): SetupWorkspaceCalibrationCard {
  const normalized = normalizeLifecycle(input.step);
  const preserve = input.sameScope && !normalized.malformed && normalized.lifecycle === null && input.previous !== null && input.supported !== false;
  const lifecycle = preserve
    ? input.previous?.lifecycle ?? "not_started"
    : input.supported === false
      ? "unavailable"
      : normalized.malformed
        ? "not_started"
        : normalized.lifecycle ?? "not_started";
  const detailText = preserve
    ? input.previous?.detailText ?? "Radio lifecycle is still waiting for a scoped update."
    : input.supported === false
      ? "Radio calibration is unavailable because the active support contract reports can_calibrate_radio=false."
      : normalized.malformed
        ? "Radio lifecycle payload was malformed, so Setup fell back to a truthful not-started state."
        : "Radio calibration stays visible for inventory truth, but the dedicated workflow is not exposed in this workspace yet.";

  return createCalibrationCard({
    id: "radio",
    title: "Radio",
    lifecycle,
    statusText: preserve
      ? input.previous?.statusText ?? statusTextFromLifecycle(lifecycle, normalized.progressPct)
      : statusTextFromLifecycle(lifecycle, normalized.progressPct),
    detailText,
    actionAvailability: input.supported === false ? "unsupported" : "blocked",
  });
}

function deriveCalibrationSummary(input: {
  sessionState: SessionStoreState;
  sameScope: boolean;
  previous: SetupWorkspaceCalibrationSummary | null;
  checkpoint: SetupWorkspaceCheckpointState;
  liveSessionConnected: boolean;
}): SetupWorkspaceCalibrationSummary {
  const support = input.sessionState.support.value;
  const calibration = input.sessionState.calibration.value;
  const previousById = new Map(input.previous?.cards.map((card) => [card.id, card]) ?? []);

  return {
    cards: [
      buildAccelCard({
        supported: typeof support?.can_calibrate_accel === "boolean" ? support.can_calibrate_accel : null,
        step: calibration?.accel ?? null,
        previous: previousById.get("accel") ?? null,
        sameScope: input.sameScope,
      }),
      buildGyroCard(input.checkpoint),
      buildCompassCard({
        supported: typeof support?.can_calibrate_compass === "boolean" ? support.can_calibrate_compass : null,
        step: calibration?.compass ?? null,
        previous: previousById.get("compass") ?? null,
        sameScope: input.sameScope,
        liveSessionConnected: input.liveSessionConnected,
        checkpoint: input.checkpoint,
      }),
      buildRadioCard({
        supported: typeof support?.can_calibrate_radio === "boolean" ? support.can_calibrate_radio : null,
        step: calibration?.radio ?? null,
        previous: previousById.get("radio") ?? null,
        sameScope: input.sameScope,
      }),
    ],
  };
}

function normalizeCheckpointInput(input: SetupWorkspaceCheckpointInput): SetupWorkspaceCheckpointState {
  const resumeSectionId = input.resumeSectionId && isSetupSectionId(input.resumeSectionId)
    ? input.resumeSectionId
    : null;
  const phase = input.phase ?? (resumeSectionId ? "resume_pending" : "idle");

  if (phase === "idle") {
    return createIdleCheckpoint();
  }

  return {
    phase,
    resumeSectionId,
    scopeKey: typeof input.scopeKey === "string" && input.scopeKey.trim().length > 0 ? input.scopeKey : null,
    scopeFamilyKey: null,
    resumeRevision: null,
    reason: typeof input.reason === "string" && input.reason.trim().length > 0 ? input.reason : null,
    title:
      phase === "resume_complete"
        ? "Setup resumed"
        : phase === "scope_changed"
          ? "Setup scope changed"
          : "Reconnect required",
    detailText: input.reason ?? null,
    blocksActions: phase !== "resume_complete",
  };
}

function resolveSelectedSectionId(
  requested: SetupSectionId,
  sections: SetupWorkspaceSection[],
): SetupSectionId {
  return sections.some((section) => section.id === requested) ? requested : "overview";
}

function createInitialWorkspaceState(): SetupWorkspaceStoreState {
  const sectionStatuses = createUnknownSectionStatusRecord();
  const sections = SETUP_SECTION_CATALOG.map((definition) => {
    const group = getSetupSectionGroupDefinition(definition.groupId);
    const implemented = IMPLEMENTED_SECTION_ID_SET.has(definition.id);

    if (definition.id === "overview") {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        kind: definition.kind,
        groupId: group.id,
        groupTitle: group.title,
        availability: "available",
        status: null,
        statusText: "Dashboard",
        confidenceText: null,
        gateText: null,
        detailText: "Use the grouped dashboard to inspect truthful setup status before opening a section.",
        trackable: definition.trackable,
        implemented,
      } satisfies SetupWorkspaceSection;
    }

    if (definition.id === "full_parameters") {
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        kind: definition.kind,
        groupId: group.id,
        groupTitle: group.title,
        availability: "available",
        status: null,
        statusText: "Recovery",
        confidenceText: null,
        gateText: null,
        detailText: "Open the shared parameter workspace when metadata is degraded or you need raw access.",
        trackable: definition.trackable,
        implemented,
      } satisfies SetupWorkspaceSection;
    }

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      kind: definition.kind,
      groupId: group.id,
      groupTitle: group.title,
      availability: "blocked",
      status: sectionStatuses[definition.id],
      statusText: "Unknown",
      confidenceText: "Unconfirmed",
      gateText: "Connect to a live session to inspect this section.",
      detailText: implemented
        ? describeGuidedSectionStatus(sectionStatuses[definition.id], definition.id)
        : describePlannedSectionStatus(sectionStatuses[definition.id], definition.id),
      trackable: definition.trackable,
      implemented,
    } satisfies SetupWorkspaceSection;
  });
  const progress = computeOverallProgress(new Map(SECTION_IDS.map((id) => [id, sectionStatuses[id]])));

  return {
    readiness: "bootstrapping",
    stateText: "Bootstrapping setup",
    activeEnvelope: null,
    activeSource: null,
    activeScopeKey: null,
    lastAcceptedScopeKey: null,
    sessionPhase: "idle",
    liveSessionConnected: false,
    scopeText: "No active setup scope",
    metadataState: "idle",
    metadataText: "Metadata idle",
    metadataGateActive: true,
    metadataGateText: "Setup is still waiting for parameter metadata before enabling purpose-built sections.",
    noticeText: "Waiting for session and parameter domains to finish bootstrapping.",
    progress,
    progressText: formatProgressText(progress),
    selectedSectionId: "overview",
    sections,
    sectionGroups: buildSectionGroups(sections),
    sectionStatuses,
    sectionConfirmations: createEmptySectionConfirmationRecord(),
    confirmationScopeKey: null,
    checkpoint: createIdleCheckpoint(),
    statusNotices: [],
    rcReceiver: createInitialRcReceiverState(),
    calibrationSummary: createInitialCalibrationSummary(),
    canOpenFullParameters: true,
  };
}

export function createSetupWorkspaceStore(
  sessionStore: Readable<SessionStoreState>,
  paramsStore: Readable<ParamsStoreState>,
) {
  const state = writable<SetupWorkspaceStoreState>(createInitialWorkspaceState());
  let sessionState: SessionStoreState | null = null;
  let paramsState: ParamsStoreState | null = null;
  let selectedSectionId: SetupSectionId = "overview";
  let checkpointState = createIdleCheckpoint();
  let pendingCheckpointSeed: SetupCheckpointSeed | null = null;
  let previous: SetupWorkspaceStoreState | null = null;
  let previousScopeKey: string | null = null;
  let previousApplyPhase: ParamsStoreState["applyPhase"] = "idle";
  let currentActiveScopeKey: string | null = null;
  const sectionConfirmationsByScope = new Map<string, ScopedSectionConfirmations>();

  function recompute() {
    if (!sessionState || !paramsState) {
      return;
    }

    const activeScopeKey = scopeKey(sessionState.activeEnvelope);
    const activeFamily = scopeFamilyKey(sessionState.activeEnvelope);
    const activeRevision = sessionState.activeEnvelope?.reset_revision ?? null;
    const sameScope = activeScopeKey !== null && activeScopeKey === previousScopeKey;
    currentActiveScopeKey = activeScopeKey;
    const currentScopeConfirmations = activeScopeKey ? sectionConfirmationsByScope.get(activeScopeKey) ?? {} : {};
    const readiness = resolveSetupReadiness(sessionState, paramsState);
    const metadataGateText = resolveMetadataGateText(paramsState);
    const liveSessionConnected = sessionState.sessionDomain.value?.connection.kind === "connected";
    const sectionStatuses = deriveSectionStatuses(
      sessionState,
      previous?.sectionStatuses ?? null,
      sameScope,
      currentScopeConfirmations,
    );

    const hasRebootRequiredEdits = Object.values(paramsState.stagedEdits).some((edit) => edit.rebootRequired);
    if (paramsState.applyPhase === "applying" && hasRebootRequiredEdits && pendingCheckpointSeed === null) {
      pendingCheckpointSeed = {
        resumeSectionId: selectedSectionId,
        scopeKey: activeScopeKey,
        scopeFamilyKey: activeFamily,
        resumeRevision: activeRevision,
      };
    }

    if (previousApplyPhase === "applying" && paramsState.applyPhase !== "applying") {
      if (pendingCheckpointSeed && paramsState.applyPhase === "idle") {
        const resumeLabel = getSetupSectionDefinition(pendingCheckpointSeed.resumeSectionId).title;
        checkpointState = {
          phase: "resume_pending",
          resumeSectionId: pendingCheckpointSeed.resumeSectionId,
          scopeKey: pendingCheckpointSeed.scopeKey,
          scopeFamilyKey: pendingCheckpointSeed.scopeFamilyKey,
          resumeRevision: pendingCheckpointSeed.resumeRevision,
          reason: `Reboot and reconnect to resume ${resumeLabel}.`,
          title: "Reconnect required",
          detailText: `Reboot-required setup changes were confirmed through the shared review tray. Dependent actions stay locked until the same setup scope reconnects or you reset this checkpoint.`,
          blocksActions: true,
        };
      }

      pendingCheckpointSeed = null;
    }

    if (checkpointState.phase === "resume_pending") {
      if (checkpointState.scopeFamilyKey && activeFamily && checkpointState.scopeFamilyKey !== activeFamily) {
        checkpointState = {
          phase: "scope_changed",
          resumeSectionId: null,
          scopeKey: null,
          scopeFamilyKey: null,
          resumeRevision: null,
          reason: "Setup scope changed before reconnect completed.",
          title: "Setup scope changed",
          detailText: "The active session scope changed while the reboot checkpoint was pending; review current values before restaging any dependent setup changes.",
          blocksActions: true,
        };
        selectedSectionId = "overview";
      } else if (
        checkpointState.scopeFamilyKey
        && activeFamily
        && checkpointState.scopeFamilyKey === activeFamily
        && checkpointState.resumeRevision !== null
        && activeRevision !== null
        && checkpointState.resumeRevision !== activeRevision
        && liveSessionConnected
      ) {
        const resumeSection = checkpointState.resumeSectionId && isSetupSectionId(checkpointState.resumeSectionId)
          ? checkpointState.resumeSectionId
          : "overview";
        selectedSectionId = resumeSection;
        checkpointState = {
          phase: "resume_complete",
          resumeSectionId: resumeSection,
          scopeKey: activeScopeKey,
          scopeFamilyKey: activeFamily,
          resumeRevision: activeRevision,
          reason: `Resumed ${getSetupSectionDefinition(resumeSection).title}.`,
          title: "Setup resumed",
          detailText: `Reconnected to the same setup scope. Resumed ${getSetupSectionDefinition(resumeSection).title} so you can continue from the last guided section.`,
          blocksActions: false,
        };
      }
    }

    const sections = buildCatalogSections({
      sessionState,
      sectionStatuses,
      metadataGateText,
      liveSessionConnected,
    });
    selectedSectionId = resolveSelectedSectionId(selectedSectionId, sections);

    const progress = computeOverallProgress(new Map(SECTION_IDS.map((id) => [id, sectionStatuses[id]])));
    const statusNotices = resolveStatusNotices(
      selectCompactStatusNotices(sessionState.statusText),
      previous?.statusNotices ?? [],
      sameScope,
    );
    const rcReceiver = deriveRcReceiverState({
      sessionState,
      sameScope,
      previous: previous?.rcReceiver ?? null,
    });
    const calibrationSummary = deriveCalibrationSummary({
      sessionState,
      sameScope,
      previous: previous?.calibrationSummary ?? null,
      checkpoint: checkpointState,
      liveSessionConnected,
    });
    const sectionConfirmations = toSectionConfirmationRecord(currentScopeConfirmations);

    const next: SetupWorkspaceStoreState = {
      readiness,
      stateText: formatReadinessText(readiness),
      activeEnvelope: sessionState.activeEnvelope,
      activeSource: sessionState.activeSource,
      activeScopeKey,
      lastAcceptedScopeKey: activeScopeKey ?? previous?.lastAcceptedScopeKey ?? null,
      sessionPhase: sessionState.lastPhase,
      liveSessionConnected,
      scopeText: formatScopeText(sessionState.activeEnvelope),
      metadataState: paramsState.metadataState,
      metadataText: formatMetadataText(paramsState.metadataState, paramsState.metadataError),
      metadataGateActive: paramsState.metadataState !== "ready",
      metadataGateText,
      noticeText: resolveNoticeText({
        sessionState,
        paramsState,
        readiness,
        metadataGateText,
      }),
      progress,
      progressText: formatProgressText(progress),
      selectedSectionId,
      sections,
      sectionGroups: buildSectionGroups(sections),
      sectionStatuses,
      sectionConfirmations,
      confirmationScopeKey: activeScopeKey,
      checkpoint: checkpointState,
      statusNotices,
      rcReceiver,
      calibrationSummary,
      canOpenFullParameters: sections.some(
        (section) => section.id === "full_parameters" && section.availability === "available",
      ),
    };

    state.set(next);
    previous = next;
    previousScopeKey = activeScopeKey;
    previousApplyPhase = paramsState.applyPhase;
  }

  sessionStore.subscribe((value) => {
    sessionState = value;
    recompute();
  });

  paramsStore.subscribe((value) => {
    paramsState = value;
    recompute();
  });

  return {
    subscribe: state.subscribe,
    selectSection(nextSectionId: string) {
      if (!isSetupSectionId(nextSectionId)) {
        return;
      }

      selectedSectionId = nextSectionId;
      recompute();
    },
    confirmSection(sectionId: string) {
      if (!isSetupSectionId(sectionId) || !currentActiveScopeKey) {
        return;
      }

      const definition = getSetupSectionDefinition(sectionId);
      if (definition.kind !== "guided") {
        return;
      }

      const next = {
        ...(sectionConfirmationsByScope.get(currentActiveScopeKey) ?? {}),
        [sectionId]: true,
      } satisfies ScopedSectionConfirmations;
      sectionConfirmationsByScope.set(currentActiveScopeKey, next);
      recompute();
    },
    clearSectionConfirmation(sectionId: string) {
      if (!isSetupSectionId(sectionId) || !currentActiveScopeKey) {
        return;
      }

      const next = {
        ...(sectionConfirmationsByScope.get(currentActiveScopeKey) ?? {}),
      } satisfies ScopedSectionConfirmations;
      delete next[sectionId];
      sectionConfirmationsByScope.set(currentActiveScopeKey, next);
      recompute();
    },
    replaceSectionConfirmations(input: unknown) {
      const normalized = normalizeSectionConfirmationPayload(input);

      if (!normalized.scopeKey) {
        if (currentActiveScopeKey) {
          sectionConfirmationsByScope.set(currentActiveScopeKey, {});
          recompute();
        }
        return;
      }

      sectionConfirmationsByScope.set(normalized.scopeKey, normalized.confirmedSections);
      recompute();
    },
    setCheckpointPlaceholder(input: SetupWorkspaceCheckpointInput) {
      checkpointState = normalizeCheckpointInput(input);
      recompute();
    },
    clearCheckpointPlaceholder() {
      checkpointState = createIdleCheckpoint();
      pendingCheckpointSeed = null;
      recompute();
    },
  };
}

export type SetupWorkspaceStore = ReturnType<typeof createSetupWorkspaceStore>;

export function createSetupWorkspaceViewStore(store: Readable<SetupWorkspaceStoreState>) {
  return store;
}

export type SetupWorkspaceViewStore = ReturnType<typeof createSetupWorkspaceViewStore>;

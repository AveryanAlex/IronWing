import { writable, type Readable } from "svelte/store";

import type { AccelCalibrationPosition, CalibrationLifecycle } from "../../calibration";
import type { SessionEnvelope, SourceKind } from "../../session";
import type { CompactStatusNotice } from "../../statustext";
import { selectCompactStatusNotices } from "../../statustext";
import {
  SETUP_SECTION_CATALOG,
  getSetupSectionDefinition,
  getSetupSectionGroupDefinition,
  groupSetupSections,
  isSetupSectionId,
  type SetupSectionId,
} from "../setup-sections";
import { selectTelemetryView } from "../telemetry-selectors";
import { createUiStateStore, type UiStateStore } from "../ui-state/ui-state";
import type { ParamsMetadataState, ParamsStoreState } from "./params";
import type { SessionStorePhase, SessionStoreState } from "./session";

type CalibrationCardId = "accel" | "gyro" | "compass" | "radio";

type RcSignalState = "disconnected" | "waiting" | "live" | "stale" | "degraded";

type CalibrationActionAvailability = "available" | "blocked" | "unsupported";

export type SetupWorkspaceReadiness = "bootstrapping" | "unavailable" | "ready" | "degraded";
export type SetupWorkspaceCheckpointPhase = "idle" | "reboot_required";

export type SetupWorkspaceCheckpointState = {
  phase: SetupWorkspaceCheckpointPhase;
  resumeSectionId: SetupSectionId | null;
  scopeKey: string | null;
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
  detailText: string;
  implemented: boolean;
};

export type SetupWorkspaceSectionGroup = {
  id: string;
  title: string;
  description: string;
  sections: SetupWorkspaceSection[];
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
  requestedPosition: AccelCalibrationPosition | null;
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
  noticeText: string | null;
  selectedSectionId: SetupSectionId;
  sections: SetupWorkspaceSection[];
  sectionGroups: SetupWorkspaceSectionGroup[];
  checkpoint: SetupWorkspaceCheckpointState;
  statusNotices: CompactStatusNotice[];
  rcReceiver: SetupWorkspaceRcReceiverState;
  calibrationSummary: SetupWorkspaceCalibrationSummary;
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
    detailText: "Connect to a live session to inspect RC input.",
    rssi: null,
    rssiText: "RSSI --",
    channels: [],
    hasMalformedChannels: false,
  };
}

function createCalibrationCard(
  input: Omit<SetupWorkspaceCalibrationCard, "requestedPosition" | "actionLabel" | "actionAvailability"> & {
    requestedPosition?: AccelCalibrationPosition | null;
    actionLabel?: string | null;
    actionAvailability?: CalibrationActionAvailability;
  },
): SetupWorkspaceCalibrationCard {
  return {
    ...input,
    requestedPosition: input.requestedPosition ?? null,
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
        detailText: "Run the guided six-position calibration with the vehicle disarmed on a stable surface.",
        actionLabel: "Start accelerometer calibration",
      }),
      createCalibrationCard({
        id: "gyro",
        title: "Gyroscope",
        lifecycle: "not_started",
        statusText: "Not started",
        detailText: "Keep the disarmed vehicle still and level throughout the quick calibration.",
        actionLabel: "Calibrate gyroscope",
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
        detailText: "Radio calibration availability is not available yet.",
        actionAvailability: "unsupported",
      }),
    ],
  };
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

function hasReadyParamStore(paramsState: Pick<ParamsStoreState, "paramStore">): boolean {
  return paramsState.paramStore !== null;
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

  if (!hasReadyParamStore(paramsState)) {
    return "bootstrapping";
  }

  if (paramsState.streamError || paramsState.metadataState === "unavailable") {
    return "degraded";
  }

  return "ready";
}

function resolveNoticeText(input: {
  sessionState: SessionStoreState;
  paramsState: ParamsStoreState;
  readiness: SetupWorkspaceReadiness;
}): string | null {
  if (input.paramsState.scopeClearWarning) {
    return input.paramsState.scopeClearWarning;
  }

  if (input.sessionState.activeSource === "playback") {
    return "Setup is read-only during playback.";
  }

  if (input.paramsState.streamError) {
    return "Live parameter updates are unavailable right now.";
  }

  if (input.readiness === "bootstrapping") {
    return "Preparing setup workspace.";
  }

  if (input.sessionState.lastError) {
    return input.sessionState.lastError;
  }

  if (input.paramsState.lastNotice) {
    return input.paramsState.lastNotice;
  }

  return null;
}

function detailTextForSection(sectionId: SetupSectionId, implemented: boolean): string {
  if (sectionId === "overview") {
    return "Use the grouped dashboard to review setup areas before opening a section.";
  }

  if (sectionId === "parameters") {
    return "Open Parameters to search and edit the complete vehicle catalog.";
  }

  if (!implemented) {
    return "Direct editing for this section is not available in this workspace yet.";
  }

  return "Open this section to inspect settings and queue changes for review.";
}

function buildCatalogSections(): SetupWorkspaceSection[] {
  return SETUP_SECTION_CATALOG.map((definition) => {
    const group = getSetupSectionGroupDefinition(definition.groupId);

    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      kind: definition.kind,
      groupId: group.id,
      groupTitle: group.title,
      detailText: detailTextForSection(definition.id, definition.implemented),
      implemented: definition.implemented,
    } satisfies SetupWorkspaceSection;
  });
}

function buildSectionGroups(sections: SetupWorkspaceSection[]): SetupWorkspaceSectionGroup[] {
  return groupSetupSections(sections).map(({ group, sections: groupedSections }) => {
    return {
      id: group.id,
      title: group.title,
      description: group.description,
      sections: groupedSections,
      implementedCount: groupedSections.filter((section) => section.implemented).length,
    } satisfies SetupWorkspaceSectionGroup;
  });
}

function freezeCatalogSections(sections: SetupWorkspaceSection[]): SetupWorkspaceSection[] {
  return Object.freeze(sections.map((section) => Object.freeze(section))) as unknown as SetupWorkspaceSection[];
}

function freezeSectionGroups(groups: SetupWorkspaceSectionGroup[]): SetupWorkspaceSectionGroup[] {
  return Object.freeze(groups.map((group) => Object.freeze({
    ...group,
    sections: Object.freeze(group.sections),
  }))) as unknown as SetupWorkspaceSectionGroup[];
}

const CATALOG_SECTIONS = freezeCatalogSections(buildCatalogSections());
const CATALOG_SECTION_GROUPS = freezeSectionGroups(buildSectionGroups(CATALOG_SECTIONS));

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
        detailText: "The vehicle link is not connected. Showing the last RC sample from this scope.",
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
      detailText: "Live RC input is available. Use presets or manual mapping to stage channel-order changes.",
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
        detailText: "The latest RC payload was malformed, so Setup dropped it instead of drawing the RC bars.",
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
      detailText: "Connect to a live vehicle to inspect RC input.",
      rssi: null,
      rssiText: "RSSI --",
      channels: [],
      hasMalformedChannels: false,
    };
  }

  return {
    signalState: "waiting",
    statusText: "Waiting for RC signal",
    detailText: "Move the transmitter sticks or switches once the receiver link is active. Manual channel mapping stays available before live RC bars appear.",
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
  requestedPosition: AccelCalibrationPosition | null;
} {
  if (!step || typeof step !== "object") {
    return {
      lifecycle: null,
      malformed: false,
      progressPct: null,
      autosaved: null,
      requestedPosition: null,
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
  const requestedPositionValue = (step as { requested_position?: unknown }).requested_position;
  const requestedPosition = isAccelCalibrationPosition(requestedPositionValue)
    ? requestedPositionValue
    : null;
  const requestedPositionMalformed = requestedPositionValue !== undefined
    && requestedPositionValue !== null
    && requestedPosition === null;

  switch (lifecycle) {
    case "not_started":
    case "running":
    case "complete":
    case "failed":
      return {
        lifecycle,
        malformed: requestedPositionMalformed,
        progressPct,
        autosaved,
        requestedPosition,
      };
    default:
      return {
        lifecycle: null,
        malformed: true,
        progressPct: null,
        autosaved: null,
        requestedPosition: null,
      };
  }
}

const ACCEL_CALIBRATION_POSITIONS: AccelCalibrationPosition[] = [
  "level",
  "left",
  "right",
  "nose_down",
  "nose_up",
  "back",
];

function isAccelCalibrationPosition(value: unknown): value is AccelCalibrationPosition {
  return typeof value === "string"
    && ACCEL_CALIBRATION_POSITIONS.includes(value as AccelCalibrationPosition);
}

function accelPositionLabel(position: AccelCalibrationPosition): string {
  switch (position) {
    case "level":
      return "Level";
    case "left":
      return "Left side";
    case "right":
      return "Right side";
    case "nose_down":
      return "Nose down";
    case "nose_up":
      return "Nose up";
    case "back":
      return "On its back";
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
  liveSessionConnected: boolean;
  vehicleArmed: boolean;
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

  const requestedPosition = preserve
    ? input.previous?.requestedPosition ?? null
    : normalized.requestedPosition;
  const actionAvailability: CalibrationActionAvailability = input.supported === false
    ? "unsupported"
    : input.checkpoint.blocksActions || !input.liveSessionConnected || input.vehicleArmed
      ? "blocked"
      : lifecycle === "running" && requestedPosition === null
        ? "blocked"
        : "available";
  const actionLabel = input.supported === false
    ? null
    : lifecycle === "running" && requestedPosition
      ? `Capture ${accelPositionLabel(requestedPosition).toLowerCase()}`
      : lifecycle === "complete"
        ? "Recalibrate accelerometer"
        : lifecycle === "failed"
          ? "Retry accelerometer calibration"
          : "Start accelerometer calibration";
  const detailText = preserve
    ? input.previous?.detailText ?? "Accelerometer lifecycle is still waiting for a scoped update."
    : input.supported === false
      ? "This vehicle does not expose accelerometer calibration support on the active shell contract."
        : normalized.malformed
          ? "Accelerometer lifecycle payload was malformed, so Setup fell back to a not-started state."
        : lifecycle === "complete"
          ? "The vehicle reports that all six accelerometer positions calibrated successfully."
          : lifecycle === "running"
            ? requestedPosition
              ? `Rest the vehicle ${accelPositionLabel(requestedPosition).toLowerCase()} on a stable surface, keep it completely still, then capture this position.`
              : "Calibration started. Waiting for the vehicle to request the next position."
            : lifecycle === "failed"
              ? "Accelerometer calibration failed. Review vehicle status text, stabilize the vehicle, and retry."
              : input.vehicleArmed
                ? "Disarm the vehicle before starting accelerometer calibration."
                : input.checkpoint.blocksActions
                  ? "Accelerometer calibration is blocked until the reboot/reconnect checkpoint is resolved."
                  : "Run the guided six-position calibration with the vehicle disarmed on a stable surface.";
  const requestedStep = requestedPosition
    ? ACCEL_CALIBRATION_POSITIONS.indexOf(requestedPosition) + 1
    : null;

  return createCalibrationCard({
    id: "accel",
    title: "Accelerometer",
    lifecycle,
    statusText: lifecycle === "running" && requestedPosition && requestedStep
      ? `Step ${requestedStep} of ${ACCEL_CALIBRATION_POSITIONS.length} · ${accelPositionLabel(requestedPosition)}`
      : preserve
      ? input.previous?.statusText ?? statusTextFromLifecycle(lifecycle, normalized.progressPct)
      : statusTextFromLifecycle(lifecycle, normalized.progressPct),
    detailText,
    requestedPosition,
    actionLabel,
    actionAvailability,
  });
}

function buildGyroCard(input: {
  supported: boolean | null;
  liveSessionConnected: boolean;
  vehicleArmed: boolean;
  checkpoint: SetupWorkspaceCheckpointState;
}): SetupWorkspaceCalibrationCard {
  const actionAvailability: CalibrationActionAvailability = input.supported === false
    ? "unsupported"
    : input.checkpoint.blocksActions || !input.liveSessionConnected || input.vehicleArmed
      ? "blocked"
      : "available";

  return createCalibrationCard({
    id: "gyro",
    title: "Gyroscope",
    lifecycle: input.supported === false ? "unavailable" : "not_started",
    statusText: input.supported === false ? "Unavailable" : "Not started",
    detailText: input.supported === false
      ? "This vehicle does not expose inertial-sensor calibration on the active shell contract."
      : input.vehicleArmed
        ? "Disarm the vehicle before calibrating the gyroscope."
        : input.checkpoint.blocksActions
          ? "Gyroscope calibration is blocked until the reboot/reconnect checkpoint is resolved."
          : "Place the vehicle on a stable, level surface and do not move it during the quick calibration.",
    actionLabel: input.supported === false ? null : "Calibrate gyroscope",
    actionAvailability,
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
        ? "Compass lifecycle payload was malformed, so Setup fell back to a not-started state while keeping the current status text available."
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
        ? "Radio lifecycle payload was malformed, so Setup fell back to a not-started state."
        : "Radio calibration remains listed here, but the dedicated workflow is not exposed in this workspace yet.";

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
  const vehicleArmed = input.sessionState.sessionDomain.value?.vehicle_state?.armed === true;
  const previousById = new Map(input.previous?.cards.map((card) => [card.id, card]) ?? []);

  return {
    cards: [
      buildAccelCard({
        supported: typeof support?.can_calibrate_accel === "boolean" ? support.can_calibrate_accel : null,
        step: calibration?.accel ?? null,
        previous: previousById.get("accel") ?? null,
        sameScope: input.sameScope,
        liveSessionConnected: input.liveSessionConnected,
        vehicleArmed,
        checkpoint: input.checkpoint,
      }),
      buildGyroCard({
        supported: typeof support?.can_calibrate_accel === "boolean" ? support.can_calibrate_accel : null,
        liveSessionConnected: input.liveSessionConnected,
        vehicleArmed,
        checkpoint: input.checkpoint,
      }),
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
  const phase = input.phase ?? (resumeSectionId ? "reboot_required" : "idle");

  if (phase === "idle") {
    return createIdleCheckpoint();
  }

  return {
    phase,
    resumeSectionId,
    scopeKey: typeof input.scopeKey === "string" && input.scopeKey.trim().length > 0 ? input.scopeKey : null,
    reason: typeof input.reason === "string" && input.reason.trim().length > 0 ? input.reason : null,
    title: "Reboot required",
    detailText: input.reason ?? null,
    blocksActions: true,
  };
}

function createInitialWorkspaceState(): SetupWorkspaceStoreState {
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
    noticeText: "Preparing setup workspace.",
    selectedSectionId: "overview",
    sections: CATALOG_SECTIONS,
    sectionGroups: CATALOG_SECTION_GROUPS,
    checkpoint: createIdleCheckpoint(),
    statusNotices: [],
    rcReceiver: createInitialRcReceiverState(),
    calibrationSummary: createInitialCalibrationSummary(),
  };
}

export type CreateSetupWorkspaceStoreOptions = {
  uiState?: UiStateStore | null;
};

export function createSetupWorkspaceStore(
  sessionStore: Readable<SessionStoreState>,
  paramsStore: Readable<ParamsStoreState>,
  options: CreateSetupWorkspaceStoreOptions = {},
) {
  const state = writable<SetupWorkspaceStoreState>(createInitialWorkspaceState());
  let sessionState: SessionStoreState | null = null;
  let paramsState: ParamsStoreState | null = null;
  const uiState: UiStateStore | null =
    options.uiState === undefined
      ? createUiStateStore({ storage: typeof localStorage === "undefined" ? null : localStorage })
      : options.uiState;
  let selectedSectionId: SetupSectionId = "overview";
  let previousFamilyForRestore: string | null = null;
  let checkpointState = createIdleCheckpoint();
  let checkpointTracksPendingReboot = false;
  let previous: SetupWorkspaceStoreState | null = null;
  let previousScopeKey: string | null = null;
  let currentActiveScopeKey: string | null = null;

  function recompute() {
    if (!sessionState || !paramsState) {
      return;
    }

    const activeScopeKey = scopeKey(sessionState.activeEnvelope);
    const activeFamily = scopeFamilyKey(sessionState.activeEnvelope);
    const sameScope = activeScopeKey !== null && activeScopeKey === previousScopeKey;
    currentActiveScopeKey = activeScopeKey;
    const readiness = resolveSetupReadiness(sessionState, paramsState);
    const liveSessionConnected = sessionState.sessionDomain.value?.connection.kind === "connected";

    const hasPendingReboot = (paramsState.pendingRebootIds ?? []).length > 0;
    if (hasPendingReboot && checkpointState.phase === "idle") {
      const resumeLabel = getSetupSectionDefinition(selectedSectionId).title;
      checkpointState = {
        phase: "reboot_required",
        resumeSectionId: selectedSectionId,
        scopeKey: activeScopeKey,
        reason: `Reboot to finish applying changes before returning to ${resumeLabel}.`,
        title: "Reboot required",
        detailText: "Reboot-required setup changes were applied. Reboot the vehicle before continuing setup.",
        blocksActions: true,
      };
      checkpointTracksPendingReboot = true;
    } else if (
      !hasPendingReboot
      && checkpointState.phase === "reboot_required"
      && checkpointTracksPendingReboot
    ) {
      checkpointState = createIdleCheckpoint();
      checkpointTracksPendingReboot = false;
    }

    const sections = CATALOG_SECTIONS;
    if (uiState && activeFamily && activeFamily !== previousFamilyForRestore) {
      const storedSectionId = uiState.getSetupSection(activeFamily);
      if (storedSectionId && isSetupSectionId(storedSectionId) && sections.some((section) => section.id === storedSectionId)) {
        selectedSectionId = storedSectionId;
      }
    }
    previousFamilyForRestore = activeFamily;
    if (!sections.some((section) => section.id === selectedSectionId)) {
      selectedSectionId = "overview";
    }

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
      noticeText: resolveNoticeText({
        sessionState,
        paramsState,
        readiness,
      }),
      selectedSectionId,
      sections,
      sectionGroups: CATALOG_SECTION_GROUPS,
      checkpoint: checkpointState,
      statusNotices,
      rcReceiver,
      calibrationSummary,
    };

    state.set(next);
    previous = next;
    previousScopeKey = activeScopeKey;
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
      if (uiState && currentActiveScopeKey) {
        const activeFamily = scopeFamilyKey(sessionState?.activeEnvelope ?? null);
        if (activeFamily) {
          uiState.setSetupSection(activeFamily, nextSectionId);
        }
      }
      recompute();
    },
    setCheckpointPlaceholder(input: SetupWorkspaceCheckpointInput) {
      checkpointState = normalizeCheckpointInput(input);
      checkpointTracksPendingReboot = false;
      recompute();
    },
    clearCheckpointPlaceholder() {
      checkpointState = createIdleCheckpoint();
      checkpointTracksPendingReboot = false;
      recompute();
    },
  };
}

export type SetupWorkspaceStore = ReturnType<typeof createSetupWorkspaceStore>;

export function createSetupWorkspaceViewStore(store: Readable<SetupWorkspaceStoreState>) {
  return store;
}

export type SetupWorkspaceViewStore = ReturnType<typeof createSetupWorkspaceViewStore>;

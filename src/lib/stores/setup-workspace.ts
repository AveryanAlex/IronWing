import { derived, writable, type Readable } from "svelte/store";

import type { SessionEnvelope, SourceKind } from "../../session";
import type { CompactStatusNotice, StatusTextDomain } from "../../statustext";
import { selectCompactStatusNotices } from "../../statustext";
import { deriveSetupSectionStatuses } from "../configuration-facts";
import {
  SECTION_IDS,
  computeOverallProgress,
  type OverallProgress,
  type SectionStatus,
  type SetupSectionId,
} from "../setup-sections";
import type { ParamsMetadataState, ParamsStoreState } from "./params";
import type { SessionStorePhase, SessionStoreState } from "./session";

const NAVIGABLE_SECTION_IDS = [
  "overview",
  "frame_orientation",
  "rc_receiver",
  "calibration",
  "full_parameters",
] as const satisfies readonly SetupSectionId[];

type NavigableSetupSectionId = (typeof NAVIGABLE_SECTION_IDS)[number];

const NAVIGABLE_SECTION_ID_SET = new Set<SetupSectionId>(NAVIGABLE_SECTION_IDS);

const SECTION_META: Record<NavigableSetupSectionId, {
  title: string;
  description: string;
  kind: "overview" | "guided" | "recovery";
}> = {
  overview: {
    title: "Overview",
    description: "Truthful setup landing with live section status and recovery guidance.",
    kind: "overview",
  },
  frame_orientation: {
    title: "Frame & orientation",
    description: "Vehicle layout, frame class, and orientation confirmation.",
    kind: "guided",
  },
  rc_receiver: {
    title: "RC receiver",
    description: "Live channel mapping, preset order, and receiver truth.",
    kind: "guided",
  },
  calibration: {
    title: "Calibration",
    description: "Sensor and compass lifecycle status with explicit action gating.",
    kind: "guided",
  },
  full_parameters: {
    title: "Full Parameters",
    description: "Shared raw-parameter recovery surface with the shell-owned review tray.",
    kind: "recovery",
  },
};

export type SetupWorkspaceReadiness = "bootstrapping" | "unavailable" | "ready" | "degraded";
export type SetupWorkspaceSectionAvailability = "available" | "gated";
export type SetupWorkspaceCheckpointPhase = "idle" | "resume_pending";

export type SetupWorkspaceCheckpointState = {
  phase: SetupWorkspaceCheckpointPhase;
  resumeSectionId: SetupSectionId | null;
  scopeKey: string | null;
  reason: string | null;
};

export type SetupWorkspaceSection = {
  id: NavigableSetupSectionId;
  title: string;
  description: string;
  kind: "overview" | "guided" | "recovery";
  availability: SetupWorkspaceSectionAvailability;
  status: SectionStatus | null;
  statusText: string;
  confidenceText: string | null;
  gateText: string | null;
  detailText: string;
  implemented: boolean;
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
  selectedSectionId: NavigableSetupSectionId;
  sections: SetupWorkspaceSection[];
  sectionStatuses: Record<SetupSectionId, SectionStatus>;
  checkpoint: SetupWorkspaceCheckpointState;
  statusNotices: CompactStatusNotice[];
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
    reason: null,
  };
}

function isSetupSectionId(value: string): value is SetupSectionId {
  return SECTION_IDS.includes(value as SetupSectionId);
}

function isNavigableSectionId(value: string): value is NavigableSetupSectionId {
  return NAVIGABLE_SECTION_ID_SET.has(value as SetupSectionId);
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

function createUnknownSectionStatusRecord(): Record<SetupSectionId, SectionStatus> {
  return Object.fromEntries(SECTION_IDS.map((id) => [id, "unknown"])) as Record<SetupSectionId, SectionStatus>;
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

function resolveMetadataGateText(paramsState: Pick<ParamsStoreState, "metadataState" | "metadataError">): string | null {
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

function describeGuidedSectionStatus(status: SectionStatus): string {
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
    return "Connect to a live session to open this section.";
  }

  if (input.sessionState.activeSource === "playback") {
    return "Purpose-built setup sections stay disabled during playback.";
  }

  if (input.metadataGateText) {
    return input.metadataGateText;
  }

  if (!input.liveSessionConnected) {
    return "This section stays limited until the live vehicle connection is active.";
  }

  return null;
}

function resolveFullParametersAvailability(sessionState: SessionStoreState): {
  availability: SetupWorkspaceSectionAvailability;
  gateText: string | null;
} {
  if (sessionState.activeSource === "playback") {
    return {
      availability: "gated",
      gateText: "Full Parameters recovery stays disabled during playback.",
    };
  }

  return {
    availability: "available",
    gateText: null,
  };
}

function buildNavigableSections(input: {
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

  return NAVIGABLE_SECTION_IDS.map((id) => {
    const meta = SECTION_META[id];
    if (id === "overview") {
      return {
        id,
        ...meta,
        availability: "available",
        status: null,
        statusText: "Dashboard",
        confidenceText: null,
        gateText: null,
        detailText: "Use the dashboard to inspect truthful setup status before opening a section.",
        implemented: true,
      } satisfies SetupWorkspaceSection;
    }

    if (id === "full_parameters") {
      return {
        id,
        ...meta,
        availability: fullParametersState.availability,
        status: null,
        statusText: "Recovery",
        confidenceText: null,
        gateText: fullParametersState.gateText,
        detailText: fullParametersState.gateText
          ?? "Open the shared parameter workspace when metadata is degraded or you need raw access.",
        implemented: true,
      } satisfies SetupWorkspaceSection;
    }

    const status = input.sectionStatuses[id];
    return {
      id,
      ...meta,
      availability: guidedGateText ? "gated" : "available",
      status,
      statusText: formatSectionStatusText(status),
      confidenceText: status === "unknown" ? "Unconfirmed" : null,
      gateText: guidedGateText,
      detailText: guidedGateText ?? describeGuidedSectionStatus(status),
      implemented: false,
    } satisfies SetupWorkspaceSection;
  });
}

function deriveSectionStatuses(
  sessionState: SessionStoreState,
  previousStatuses: Record<SetupSectionId, SectionStatus> | null,
  sameScope: boolean,
): Record<SetupSectionId, SectionStatus> {
  if (!sessionState.activeEnvelope) {
    return createUnknownSectionStatusRecord();
  }

  const next = deriveSetupSectionStatuses({
    vehicle_type: sessionState.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
    confirmed_sections: {},
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
  domain: StatusTextDomain,
  previous: CompactStatusNotice[],
): CompactStatusNotice[] {
  const entries = domain?.value?.entries;
  if (!Array.isArray(entries)) {
    return previous;
  }

  const next = selectCompactStatusNotices(domain);
  if (next.length > 0) {
    return next;
  }

  return entries.length === 0 ? [] : previous;
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
    reason: typeof input.reason === "string" && input.reason.trim().length > 0 ? input.reason : null,
  };
}

function resolveCheckpoint(
  checkpoint: SetupWorkspaceCheckpointState,
  activeScopeKey: string | null,
): SetupWorkspaceCheckpointState {
  if (checkpoint.phase === "idle") {
    return checkpoint;
  }

  if (!checkpoint.resumeSectionId || !checkpoint.scopeKey || !activeScopeKey || checkpoint.scopeKey !== activeScopeKey) {
    return createIdleCheckpoint();
  }

  return checkpoint;
}

function resolveSelectedSectionId(
  requested: SetupSectionId,
  sections: SetupWorkspaceSection[],
): NavigableSetupSectionId {
  const requestedSection = sections.find((section) => section.id === requested);
  if (requestedSection && requestedSection.availability === "available") {
    return requestedSection.id;
  }

  return "overview";
}

export function createSetupWorkspaceStore(
  sessionStore: Readable<SessionStoreState>,
  paramsStore: Readable<ParamsStoreState>,
) {
  const selectedSectionId = writable<SetupSectionId>("overview");
  const checkpoint = writable<SetupWorkspaceCheckpointState>(createIdleCheckpoint());
  let previous: SetupWorkspaceStoreState | null = null;
  let previousScopeKey: string | null = null;

  const view = derived(
    [sessionStore, paramsStore, selectedSectionId, checkpoint],
    ([$session, $params, $selectedSectionId, $checkpoint]): SetupWorkspaceStoreState => {
      const activeScopeKey = scopeKey($session.activeEnvelope);
      const sameScope = activeScopeKey !== null && activeScopeKey === previousScopeKey;
      const readiness = resolveSetupReadiness($session, $params);
      const sectionStatuses = deriveSectionStatuses($session, previous?.sectionStatuses ?? null, sameScope);
      const sections = buildNavigableSections({
        sessionState: $session,
        sectionStatuses,
        metadataGateText: resolveMetadataGateText($params),
        liveSessionConnected: $session.sessionDomain.value?.connection.kind === "connected",
      });
      const resolvedSelectedSectionId = resolveSelectedSectionId($selectedSectionId, sections);
      const resolvedCheckpoint = resolveCheckpoint($checkpoint, activeScopeKey);
      const progress = computeOverallProgress(new Map(SECTION_IDS.map((id) => [id, sectionStatuses[id]])));
      const next: SetupWorkspaceStoreState = {
        readiness,
        stateText: formatReadinessText(readiness),
        activeEnvelope: $session.activeEnvelope,
        activeSource: $session.activeSource,
        activeScopeKey,
        lastAcceptedScopeKey: activeScopeKey ?? previous?.lastAcceptedScopeKey ?? null,
        sessionPhase: $session.lastPhase,
        liveSessionConnected: $session.sessionDomain.value?.connection.kind === "connected",
        scopeText: formatScopeText($session.activeEnvelope),
        metadataState: $params.metadataState,
        metadataText: formatMetadataText($params.metadataState, $params.metadataError),
        metadataGateActive: $params.metadataState !== "ready",
        metadataGateText: resolveMetadataGateText($params),
        noticeText: resolveNoticeText({
          sessionState: $session,
          paramsState: $params,
          readiness,
          metadataGateText: resolveMetadataGateText($params),
        }),
        progress,
        progressText: formatProgressText(progress),
        selectedSectionId: resolvedSelectedSectionId,
        sections,
        sectionStatuses,
        checkpoint: resolvedCheckpoint,
        statusNotices: resolveStatusNotices($session.statusText, sameScope ? previous?.statusNotices ?? [] : []),
        canOpenFullParameters: sections.some(
          (section) => section.id === "full_parameters" && section.availability === "available",
        ),
      };

      previous = next;
      previousScopeKey = activeScopeKey;
      return next;
    },
  );

  return {
    subscribe: view.subscribe,
    selectSection(nextSectionId: string) {
      if (!isNavigableSectionId(nextSectionId)) {
        return;
      }

      selectedSectionId.set(nextSectionId);
    },
    setCheckpointPlaceholder(input: SetupWorkspaceCheckpointInput) {
      checkpoint.set(normalizeCheckpointInput(input));
    },
    clearCheckpointPlaceholder() {
      checkpoint.set(createIdleCheckpoint());
    },
  };
}

export type SetupWorkspaceStore = ReturnType<typeof createSetupWorkspaceStore>;

export function createSetupWorkspaceViewStore(store: Readable<SetupWorkspaceStoreState>) {
  return derived(store, ($store) => $store);
}

export type SetupWorkspaceViewStore = ReturnType<typeof createSetupWorkspaceViewStore>;

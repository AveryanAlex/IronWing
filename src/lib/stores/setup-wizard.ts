import { get, writable, type Readable } from "svelte/store";

import type { SectionStatus, SetupSectionId } from "../setup-sections";
import {
  WIZARD_STEP_CATALOG,
  resolveStepTier,
  scopeFamilyKey,
  type WizardFactsView,
  type WizardStepDefinition,
  type WizardStepId,
  type WizardStepTier,
} from "../setup/wizard-catalog";

export type WizardPhase =
  | "idle"
  | "active"
  | "paused_detour"
  | "paused_scope_change"
  | "paused_checkpoint"
  | "complete";

export type WizardStepStatus =
  | "pending"
  | "current"
  | "skipped"
  | "done_by_wizard"
  | "done_by_detour";

export type WizardStepSnapshot = {
  id: WizardStepId;
  tier: WizardStepTier;
  status: WizardStepStatus;
  title: string;
  description: string;
  sectionId: SetupSectionId;
};

export type WizardHandoffSummary = {
  configuredSteps: WizardStepId[];
  skippedSteps: WizardStepId[];
  remainingRequired: WizardStepId[];
};

export type WizardStoreState = {
  phase: WizardPhase;
  currentStepId: WizardStepId | null;
  steps: WizardStepSnapshot[];
  scopeFamilyKey: string | null;
  resumeSectionId: SetupSectionId | null;
  requiredRemaining: number;
  recommendedRemaining: number;
  handoffSummary: WizardHandoffSummary | null;
};

export type WizardScopeEnvelope = {
  session_id: string;
  source_kind: string;
  seek_epoch: number;
  reset_revision: number;
};

export type WorkspaceSnapshot = {
  sectionStatuses: Record<SetupSectionId, SectionStatus>;
  activeEnvelope: WizardScopeEnvelope | null;
  gpsConfigured: boolean | null;
  batteryConfigured: boolean | null;
  checkpointPhase: "idle" | "resume_pending" | "resume_complete" | "scope_changed";
};

export type SetupWizardStoreOptions = {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
};

export type SetupWizardStore = Readable<WizardStoreState> & {
  updateFromWorkspace(snapshot: WorkspaceSnapshot): void;
  start(): void;
  advance(): void;
  skip(): void;
  markStepComplete(stepId: WizardStepId): void;
  pause(reason: "detour" | "checkpoint" | "scope_change"): void;
  resume(): void;
  restart(): void;
  acknowledgeHandoff(): void;
};

const STORAGE_KEY_PREFIX = "mpng_setup_wizard_";
const PERSIST_VERSION = 1;

type PersistedBlob = {
  version: number;
  familyKey: string;
  phase: WizardPhase;
  currentStepId: WizardStepId | null;
  stepStatuses: Partial<Record<WizardStepId, WizardStepStatus>>;
};

const VALID_STEP_STATUSES: ReadonlySet<WizardStepStatus> = new Set<WizardStepStatus>([
  "pending",
  "current",
  "skipped",
  "done_by_wizard",
  "done_by_detour",
]);

const VALID_PHASES: ReadonlySet<WizardPhase> = new Set<WizardPhase>([
  "idle",
  "active",
  "paused_detour",
  "paused_scope_change",
  "paused_checkpoint",
  "complete",
]);

const KNOWN_STEP_IDS: ReadonlySet<WizardStepId> = new Set<WizardStepId>(
  WIZARD_STEP_CATALOG.map((step) => step.id),
);

function createInitialState(): WizardStoreState {
  return {
    phase: "idle",
    currentStepId: null,
    steps: [],
    scopeFamilyKey: null,
    resumeSectionId: null,
    requiredRemaining: 0,
    recommendedRemaining: 0,
    handoffSummary: null,
  };
}

function buildStepSnapshots(facts: WizardFactsView): WizardStepSnapshot[] {
  return WIZARD_STEP_CATALOG.map((definition) => ({
    id: definition.id,
    tier: resolveStepTier(definition, facts),
    status: "pending" as WizardStepStatus,
    title: definition.title,
    description: definition.description,
    sectionId: definition.sectionId,
  }));
}

function findStepIndex(steps: WizardStepSnapshot[], id: WizardStepId | null): number {
  if (!id) {
    return -1;
  }
  return steps.findIndex((step) => step.id === id);
}

function getStepDefinition(id: WizardStepId): WizardStepDefinition {
  const definition = WIZARD_STEP_CATALOG.find((step) => step.id === id);
  if (!definition) {
    throw new Error(`unknown wizard step id: ${id}`);
  }
  return definition;
}

function recomputeCounts(steps: WizardStepSnapshot[]): {
  requiredRemaining: number;
  recommendedRemaining: number;
} {
  let requiredRemaining = 0;
  let recommendedRemaining = 0;
  for (const step of steps) {
    if (step.status !== "pending" && step.status !== "current") {
      continue;
    }
    if (step.tier === "required") {
      requiredRemaining += 1;
    } else {
      recommendedRemaining += 1;
    }
  }
  return { requiredRemaining, recommendedRemaining };
}

function retierPendingSteps(
  steps: WizardStepSnapshot[],
  facts: WizardFactsView,
): WizardStepSnapshot[] {
  return steps.map((step) => {
    if (step.status !== "pending") {
      return step;
    }
    const definition = getStepDefinition(step.id);
    return { ...step, tier: resolveStepTier(definition, facts) };
  });
}

function buildHandoffSummary(steps: WizardStepSnapshot[]): WizardHandoffSummary {
  const configuredSteps: WizardStepId[] = [];
  const skippedSteps: WizardStepId[] = [];
  const remainingRequired: WizardStepId[] = [];
  for (const step of steps) {
    if (step.status === "done_by_wizard" || step.status === "done_by_detour") {
      configuredSteps.push(step.id);
    } else if (step.status === "skipped") {
      skippedSteps.push(step.id);
    } else if (step.status === "pending" && step.tier === "required") {
      remainingRequired.push(step.id);
    }
  }
  return { configuredSteps, skippedSteps, remainingRequired };
}

function readPersistedBlob(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  familyKey: string,
): PersistedBlob | null {
  const raw = storage.getItem(`${STORAGE_KEY_PREFIX}${familyKey}`);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const blob = parsed as Partial<PersistedBlob>;
    if (blob.version !== PERSIST_VERSION) {
      return null;
    }
    if (blob.familyKey !== familyKey) {
      return null;
    }
    if (!blob.phase || !VALID_PHASES.has(blob.phase)) {
      return null;
    }
    const statuses: Partial<Record<WizardStepId, WizardStepStatus>> = {};
    if (blob.stepStatuses && typeof blob.stepStatuses === "object") {
      for (const [rawId, rawStatus] of Object.entries(blob.stepStatuses)) {
        if (!KNOWN_STEP_IDS.has(rawId as WizardStepId)) {
          continue;
        }
        const status =
          typeof rawStatus === "string" && VALID_STEP_STATUSES.has(rawStatus as WizardStepStatus)
            ? (rawStatus as WizardStepStatus)
            : "pending";
        statuses[rawId as WizardStepId] = status;
      }
    }
    const currentStepId =
      typeof blob.currentStepId === "string" && KNOWN_STEP_IDS.has(blob.currentStepId as WizardStepId)
        ? (blob.currentStepId as WizardStepId)
        : null;
    return {
      version: PERSIST_VERSION,
      familyKey,
      phase: blob.phase,
      currentStepId,
      stepStatuses: statuses,
    };
  } catch (error) {
    // Corrupted blob — warn and start fresh instead of crashing the wizard.
    console.warn("setup-wizard: failed to parse persisted blob", error);
    return null;
  }
}

function writePersistedBlob(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  familyKey: string,
  state: WizardStoreState,
): void {
  const stepStatuses: Partial<Record<WizardStepId, WizardStepStatus>> = {};
  for (const step of state.steps) {
    stepStatuses[step.id] = step.status;
  }
  const blob: PersistedBlob = {
    version: PERSIST_VERSION,
    familyKey,
    phase: state.phase,
    currentStepId: state.currentStepId,
    stepStatuses,
  };
  storage.setItem(`${STORAGE_KEY_PREFIX}${familyKey}`, JSON.stringify(blob));
}

function clearPersistedBlob(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  familyKey: string,
): void {
  storage.removeItem(`${STORAGE_KEY_PREFIX}${familyKey}`);
}

export function createSetupWizardStore(
  options: SetupWizardStoreOptions = {},
): SetupWizardStore {
  const { storage } = options;
  const internal = writable<WizardStoreState>(createInitialState());

  // Last family key observed from updateFromWorkspace — distinct from
  // state.scopeFamilyKey, which only flips on start/restart.
  let lastSeenFamilyKey: string | null = null;
  let lastFacts: WizardFactsView = { gpsConfigured: null, batteryConfigured: null };

  function persist(state: WizardStoreState): void {
    if (!storage) return;
    const key = state.scopeFamilyKey;
    if (!key) return;
    writePersistedBlob(storage, key, state);
  }

  function updateAndPersist(recipe: (state: WizardStoreState) => WizardStoreState): void {
    internal.update((state) => {
      const next = recipe(state);
      persist(next);
      return next;
    });
  }

  function hydrateFromStorage(familyKey: string, facts: WizardFactsView): WizardStoreState | null {
    if (!storage) return null;
    const blob = readPersistedBlob(storage, familyKey);
    if (!blob) return null;
    const baseSteps = buildStepSnapshots(facts);
    const steps: WizardStepSnapshot[] = baseSteps.map((step) => {
      const persistedStatus = blob.stepStatuses[step.id];
      if (persistedStatus && persistedStatus !== "pending") {
        return { ...step, status: persistedStatus };
      }
      return step;
    });
    const currentStepId = blob.currentStepId;
    // Ensure the step marked "current" in the blob stays marked current.
    if (currentStepId) {
      const index = findStepIndex(steps, currentStepId);
      if (index >= 0 && steps[index].status === "pending") {
        steps[index] = { ...steps[index], status: "current" };
      }
    }
    const { requiredRemaining, recommendedRemaining } = recomputeCounts(steps);
    return {
      phase: blob.phase,
      currentStepId,
      steps,
      scopeFamilyKey: familyKey,
      resumeSectionId: null,
      requiredRemaining,
      recommendedRemaining,
      handoffSummary: blob.phase === "complete" ? buildHandoffSummary(steps) : null,
    };
  }

  function updateFromWorkspace(snapshot: WorkspaceSnapshot): void {
    const newFamilyKey = scopeFamilyKey(snapshot.activeEnvelope);
    const facts: WizardFactsView = {
      gpsConfigured: snapshot.gpsConfigured,
      batteryConfigured: snapshot.batteryConfigured,
    };
    lastSeenFamilyKey = newFamilyKey;
    lastFacts = facts;

    internal.update((state) => {
      // Hydration path: idle store, first envelope seen, storage has a blob
      // for this family.
      if (state.phase === "idle" && newFamilyKey !== null && storage) {
        const hydrated = hydrateFromStorage(newFamilyKey, facts);
        if (hydrated) {
          return hydrated;
        }
      }

      // Scope change path: the family key shifted while we were mid-wizard.
      if (
        state.phase !== "idle" &&
        state.scopeFamilyKey !== null &&
        newFamilyKey !== state.scopeFamilyKey
      ) {
        return {
          ...state,
          phase: "paused_scope_change",
          resumeSectionId: findCurrentSectionId(state),
        };
      }

      // Checkpoint handling only matters when the wizard is actively running.
      let phase = state.phase;
      let resumeSectionId = state.resumeSectionId;
      if (state.phase === "active" && snapshot.checkpointPhase === "resume_pending") {
        phase = "paused_checkpoint";
        resumeSectionId = findCurrentSectionId(state);
      } else if (
        state.phase === "paused_checkpoint" &&
        snapshot.checkpointPhase === "resume_complete"
      ) {
        phase = "active";
      }

      // Re-tier pending steps against the latest facts.
      const retiered = retierPendingSteps(state.steps, facts);
      const { requiredRemaining, recommendedRemaining } = recomputeCounts(retiered);

      return {
        ...state,
        phase,
        resumeSectionId,
        steps: retiered,
        requiredRemaining,
        recommendedRemaining,
      };
    });
  }

  function findCurrentSectionId(state: WizardStoreState): SetupSectionId | null {
    const index = findStepIndex(state.steps, state.currentStepId);
    if (index < 0) return null;
    return state.steps[index].sectionId;
  }

  function start(): void {
    if (!lastSeenFamilyKey) return;
    updateAndPersist((state) => {
      if (state.phase !== "idle") return state;
      const steps = buildStepSnapshots(lastFacts);
      if (steps.length === 0) return state;
      steps[0] = { ...steps[0], status: "current" };
      const { requiredRemaining, recommendedRemaining } = recomputeCounts(steps);
      return {
        phase: "active",
        currentStepId: steps[0].id,
        steps,
        scopeFamilyKey: lastSeenFamilyKey,
        resumeSectionId: null,
        requiredRemaining,
        recommendedRemaining,
        handoffSummary: null,
      };
    });
  }

  function advanceFrom(
    state: WizardStoreState,
    currentStatus: WizardStepStatus,
  ): WizardStoreState {
    const currentIndex = findStepIndex(state.steps, state.currentStepId);
    if (currentIndex < 0) return state;
    const steps = state.steps.slice();
    steps[currentIndex] = { ...steps[currentIndex], status: currentStatus };
    const nextPendingIndex = steps.findIndex((step) => step.status === "pending");
    if (nextPendingIndex < 0) {
      const { requiredRemaining, recommendedRemaining } = recomputeCounts(steps);
      return {
        ...state,
        phase: "complete",
        currentStepId: null,
        steps,
        requiredRemaining,
        recommendedRemaining,
        handoffSummary: buildHandoffSummary(steps),
      };
    }
    steps[nextPendingIndex] = { ...steps[nextPendingIndex], status: "current" };
    const { requiredRemaining, recommendedRemaining } = recomputeCounts(steps);
    return {
      ...state,
      currentStepId: steps[nextPendingIndex].id,
      steps,
      requiredRemaining,
      recommendedRemaining,
    };
  }

  function advance(): void {
    updateAndPersist((state) => {
      if (state.phase !== "active") return state;
      return advanceFrom(state, "done_by_wizard");
    });
  }

  function skip(): void {
    updateAndPersist((state) => {
      if (state.phase !== "active") return state;
      const currentIndex = findStepIndex(state.steps, state.currentStepId);
      if (currentIndex < 0) return state;
      if (state.steps[currentIndex].tier !== "recommended") return state;
      return advanceFrom(state, "skipped");
    });
  }

  function markStepComplete(stepId: WizardStepId): void {
    updateAndPersist((state) => {
      const index = state.steps.findIndex((step) => step.id === stepId);
      if (index < 0) return state;
      if (state.steps[index].status !== "pending") return state;
      const steps = state.steps.slice();
      steps[index] = { ...steps[index], status: "done_by_detour" };
      const { requiredRemaining, recommendedRemaining } = recomputeCounts(steps);
      return {
        ...state,
        steps,
        requiredRemaining,
        recommendedRemaining,
      };
    });
  }

  function pause(reason: "detour" | "checkpoint" | "scope_change"): void {
    updateAndPersist((state) => {
      const targetPhase: WizardPhase =
        reason === "detour"
          ? "paused_detour"
          : reason === "checkpoint"
            ? "paused_checkpoint"
            : "paused_scope_change";
      return {
        ...state,
        phase: targetPhase,
        resumeSectionId: findCurrentSectionId(state),
      };
    });
  }

  function resume(): void {
    updateAndPersist((state) => {
      if (state.phase === "paused_detour") {
        // If the current step's section reports complete, treat it as a
        // detour completion and roll forward to the next pending step.
        const snapshotStatuses = lastSectionStatuses;
        const index = findStepIndex(state.steps, state.currentStepId);
        if (index >= 0 && snapshotStatuses) {
          const currentStep = state.steps[index];
          if (snapshotStatuses[currentStep.sectionId] === "complete") {
            const advanced = advanceFrom(state, "done_by_detour");
            return { ...advanced, phase: "active", resumeSectionId: null };
          }
        }
        return { ...state, phase: "active", resumeSectionId: null };
      }
      if (state.phase === "paused_checkpoint") {
        return { ...state, phase: "active", resumeSectionId: null };
      }
      return state;
    });
  }

  function restart(): void {
    // We intentionally read the state once to grab the previous family key
    // before clearing it so we can wipe the matching persisted blob.
    const previous = get(internal);
    if (storage && previous.scopeFamilyKey) {
      clearPersistedBlob(storage, previous.scopeFamilyKey);
    }
    internal.set(createInitialState());
  }

  function acknowledgeHandoff(): void {
    updateAndPersist((state) => {
      if (state.phase !== "complete") return state;
      return { ...state, phase: "idle" };
    });
  }

  // Cache of the most recent section statuses so resume() can consult them
  // without forcing the consumer to pass a snapshot again.
  let lastSectionStatuses: Record<SetupSectionId, SectionStatus> | null = null;
  const wrappedUpdate = (snapshot: WorkspaceSnapshot) => {
    lastSectionStatuses = snapshot.sectionStatuses;
    updateFromWorkspace(snapshot);
  };

  return {
    subscribe: internal.subscribe,
    updateFromWorkspace: wrappedUpdate,
    start,
    advance,
    skip,
    markStepComplete,
    pause,
    resume,
    restart,
    acknowledgeHandoff,
  };
}

<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  deriveVehicleProfile,
  type VehicleProfile,
} from "../../../lib/setup/vehicle-profile";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type EnumOption = { code: number; label: string };

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let profile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);

let frameClassItem = $derived(resolveFrameClassItem(itemIndex, profile));
let orientationItem = $derived(itemIndex.get("AHRS_ORIENTATION") ?? null);
let qEnableItem = $derived(itemIndex.get("Q_ENABLE") ?? null);

let frameClassOptions = $derived(
  resolveEnumOptions(frameClassItem ? params.metadata?.get(frameClassItem.name)?.values : undefined),
);
let orientationOptions = $derived(
  resolveEnumOptions(params.metadata?.get("AHRS_ORIENTATION")?.values),
);

// Mirror the expert section pattern: derive the draft from staged edits or the
// live value, and let `bind:value` write back through the $derived accessor.
let frameClassDraft = $derived(
  String(
    params.stagedEdits[frameClassItem?.name ?? ""]?.nextValue
      ?? frameClassItem?.value
      ?? "",
  ),
);
let orientationDraft = $derived(
  String(
    params.stagedEdits.AHRS_ORIENTATION?.nextValue
      ?? orientationItem?.value
      ?? "",
  ),
);

let currentFrameClassLabel = $derived(
  frameClassItem?.valueLabel ?? frameClassItem?.valueText ?? "Unavailable",
);
let currentOrientationLabel = $derived(
  orientationItem?.valueLabel ?? orientationItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (frameClassItem && !frameClassItem.readOnly) {
    const nextValue = resolveDraftNumber(frameClassDraft);
    if (nextValue !== null && nextValue !== frameClassItem.value) {
      paramsStore.stageParameterEdit(frameClassItem, nextValue);
      stagedNames.push(frameClassItem.name);
    } else if (params.stagedEdits[frameClassItem.name]) {
      stagedNames.push(frameClassItem.name);
    }
  }

  if (orientationItem && !orientationItem.readOnly) {
    const nextValue = resolveDraftNumber(orientationDraft);
    if (nextValue !== null && nextValue !== orientationItem.value) {
      paramsStore.stageParameterEdit(orientationItem, nextValue);
      stagedNames.push("AHRS_ORIENTATION");
    } else if (params.stagedEdits.AHRS_ORIENTATION) {
      stagedNames.push("AHRS_ORIENTATION");
    }
  }

  // No staged edits means the beginner path already matches the vehicle — just advance.
  if (stagedNames.length === 0) {
    onAdvance();
    return;
  }

  applyPending = true;
  try {
    await paramsStore.applyStagedEdits(stagedNames);
  } finally {
    applyPending = false;
  }

  const snapshot = get(paramsStore);
  const retainedFailureMessages = stagedNames
    .map((name) => snapshot.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null)
    .map((failure) => `${failure.name}: ${failure.message}`);

  const phaseFailed = snapshot.applyPhase === "failed" || snapshot.applyPhase === "partial-failure";

  if (retainedFailureMessages.length > 0 || phaseFailed) {
    failureMessage = retainedFailureMessages.length > 0
      ? retainedFailureMessages.join(" · ")
      : snapshot.applyError ?? "Applying frame or orientation edits failed.";
    return;
  }

  onAdvance();
}

function resolveFrameClassItem(
  index: Map<string, ParameterItemModel>,
  profile: VehicleProfile,
): ParameterItemModel | null {
  if (profile.frameClassParam === "Q_FRAME_CLASS") {
    return index.get("Q_FRAME_CLASS") ?? null;
  }

  if (profile.frameClassParam === "FRAME_CLASS") {
    return index.get("FRAME_CLASS") ?? null;
  }

  return index.get("FRAME_CLASS") ?? null;
}

function resolveEnumOptions(values: { code: number; label: string }[] | undefined): EnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

<div class="space-y-4">
  <p class="text-sm text-text-secondary">
    Confirm the frame family and board orientation the vehicle is reporting. We stage the edits
    into the shared review tray and apply them here before moving on.
  </p>

  <div
    class="grid gap-3 rounded-2xl border border-border bg-bg-primary/80 p-4 md:grid-cols-2"
    data-testid={setupWorkspaceTestIds.wizardStepFrameSummary}
  >
    {#if failureMessage}
      <div class="md:col-span-2 text-sm text-danger">
        Apply failed. Staged edits remain in the review tray so you can retry. {failureMessage}
      </div>
    {/if}
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Frame class</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentFrameClassLabel}</p>
      {#if frameClassItem}
        <p class="mt-1 text-[11px] text-text-muted">{frameClassItem.name}</p>
      {/if}
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Orientation</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentOrientationLabel}</p>
      <p class="mt-1 text-[11px] text-text-muted">AHRS_ORIENTATION</p>
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-2">
    {#if frameClassItem && frameClassOptions.length > 0}
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          {frameClassItem.name}
        </span>
        <select
          bind:value={frameClassDraft}
          class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class`}
          disabled={view.checkpoint.blocksActions || applyPending}
        >
          {#each frameClassOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if orientationItem && orientationOptions.length > 0}
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          AHRS_ORIENTATION
        </span>
        <select
          bind:value={orientationDraft}
          class="mt-2 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-orientation`}
          disabled={view.checkpoint.blocksActions || applyPending}
        >
          {#each orientationOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if profile.isPlane && qEnableItem}
    <p class="rounded-2xl border border-border bg-bg-primary/60 px-4 py-3 text-xs text-text-secondary">
      Plane firmware: QuadPlane toggles live in the full Frame section. Open it from the wizard footer if you need to adjust Q_ENABLE or Q_FRAME_*.
    </p>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepFrameApply}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleApply}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply and continue"}
    </button>
  </div>
</div>

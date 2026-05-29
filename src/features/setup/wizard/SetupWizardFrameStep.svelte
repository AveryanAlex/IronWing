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
import { Card, Eyebrow, Field, HelperText, NativeSelect } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";
import SetupWizardHintCard from "../shared/SetupWizardHintCard.svelte";

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
let frameClassSelectOptions = $derived(frameClassOptions.map((option) => ({ value: String(option.code), label: option.label })));
let orientationSelectOptions = $derived(orientationOptions.map((option) => ({ value: String(option.code), label: option.label })));

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
  <HelperText>
    Confirm the frame family and board orientation the vehicle is reporting. We stage the edits
    here and apply them before moving on.
  </HelperText>

  <Card.Root class="grid md:grid-cols-2" surface="primary" density="compact" gap="compact" testId={setupWorkspaceTestIds.wizardStepFrameSummary}>
    <SetupWizardApplyError message={failureMessage} class="md:col-span-2" />
    <div>
      <Eyebrow tracking="widest">Frame class</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentFrameClassLabel}</p>
      {#if frameClassItem}
        <HelperText class="mt-1" size="xs" tone="muted">{frameClassItem.name}</HelperText>
      {/if}
    </div>
    <div>
      <Eyebrow tracking="widest">Orientation</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentOrientationLabel}</p>
      <HelperText class="mt-1" size="xs" tone="muted">AHRS_ORIENTATION</HelperText>
    </div>
  </Card.Root>

  <div class="grid gap-3 md:grid-cols-2">
    {#if frameClassItem && frameClassOptions.length > 0}
      <Field.Root>
        <Field.Label>
          {frameClassItem.name}
        </Field.Label>
        <NativeSelect
          bind:value={frameClassDraft}
          disabled={view.checkpoint.blocksActions || applyPending}
          options={frameClassSelectOptions}
          testId={`${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class`}
        />
      </Field.Root>
    {/if}

    {#if orientationItem && orientationOptions.length > 0}
      <Field.Root>
        <Field.Label>
          AHRS_ORIENTATION
        </Field.Label>
        <NativeSelect
          bind:value={orientationDraft}
          disabled={view.checkpoint.blocksActions || applyPending}
          options={orientationSelectOptions}
          testId={`${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-orientation`}
        />
      </Field.Root>
    {/if}
  </div>

  {#if profile.isPlane && qEnableItem}
    <SetupWizardHintCard>
      Plane firmware: QuadPlane toggles live in the full Frame section. Open it from the wizard footer if you need to adjust Q_ENABLE or Q_FRAME_*.
    </SetupWizardHintCard>
  {/if}

  <SetupWizardActions
    primaryLabel="Apply and continue"
    primaryPendingLabel="Applying…"
    primaryPending={applyPending}
    primaryDisabled={view.checkpoint.blocksActions}
    primaryTestId={setupWorkspaceTestIds.wizardStepFrameApply}
    onPrimary={handleApply}
  />
</div>

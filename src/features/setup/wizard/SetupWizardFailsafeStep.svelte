<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  FAILSAFE_DEFAULTS_COPTER,
  FAILSAFE_DEFAULTS_PLANE,
  FAILSAFE_DEFAULTS_ROVER,
  resolveSafetyVehicleFamily,
  type SafetyDefaultsEntry,
} from "../../../lib/setup/failsafe-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Card, Eyebrow, HelperText, MonoValue } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";
import SetupWizardHintCard from "../shared/SetupWizardHintCard.svelte";

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let family = $derived(resolveSafetyVehicleFamily(vehicleType));
let defaults = $derived(selectDefaults(family));
let defaultsRows = $derived(defaults.map((entry) => ({
  paramName: entry.paramName,
  label: entry.label,
  nextValue: entry.value,
  item: itemIndex.get(entry.paramName) ?? null,
  currentValue: itemIndex.get(entry.paramName)?.value ?? null,
})));
let hasAnyWritable = $derived(
  defaultsRows.some((row) => row.item !== null && row.item.readOnly !== true),
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  for (const row of defaultsRows) {
    if (!row.item || row.item.readOnly === true) {
      continue;
    }

    if (row.item.value !== row.nextValue) {
      paramsStore.stageParameterEdit(row.item, row.nextValue);
      stagedNames.push(row.item.name);
    } else if (params.stagedEdits[row.item.name]) {
      stagedNames.push(row.item.name);
    }
  }

  if (stagedNames.length === 0) {
    // Already aligned — still treat this as an explicit confirmation.
    setupWorkspaceStore.confirmSection("failsafe");
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
      : snapshot.applyError ?? "Applying the recommended failsafe defaults failed.";
    return;
  }

  setupWorkspaceStore.confirmSection("failsafe");
  onAdvance();
}

function handleMarkReviewed() {
  setupWorkspaceStore.confirmSection("failsafe");
  onAdvance();
}

function selectDefaults(familyValue: ReturnType<typeof resolveSafetyVehicleFamily>): SafetyDefaultsEntry[] {
  switch (familyValue) {
    case "plane":
      return FAILSAFE_DEFAULTS_PLANE;
    case "rover":
      return FAILSAFE_DEFAULTS_ROVER;
    case "copter":
      return FAILSAFE_DEFAULTS_COPTER;
    default:
      // Unknown vehicle family still shows copter defaults as a baseline,
      // matching the SetupFailsafeSection fallback ordering.
      return FAILSAFE_DEFAULTS_COPTER;
  }
}
</script>

<div class="space-y-4">
  <HelperText>
    Review the recommended failsafe defaults for this vehicle family. Apply
    them here, or confirm the section if you have already tuned the rows
    elsewhere.
  </HelperText>

  <Card.Root surface="primary" density="compact" testId={setupWorkspaceTestIds.wizardStepFailsafeSummary}>
    <SetupWizardApplyError message={failureMessage} />
    <Eyebrow tracking="widest">
      Recommended defaults ({family})
    </Eyebrow>
    <ul class="mt-2 space-y-1 text-sm text-text-primary">
      {#each defaultsRows as row (row.paramName)}
        <li class="flex items-center justify-between gap-2">
          <MonoValue size="xs">{row.paramName}</MonoValue>
          <span class="text-text-secondary">
            {row.currentValue ?? "--"} → {row.nextValue}
            {#if row.item === null}
              <span class="ml-1 text-warning">(unavailable)</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </Card.Root>

  <SetupWizardHintCard>
    Need per-action tuning? Open the Failsafe section from the wizard footer
    for the expert layout.
  </SetupWizardHintCard>

  <SetupWizardActions
    primaryLabel="Apply recommended defaults"
    primaryPendingLabel="Applying…"
    primaryPending={applyPending}
    primaryDisabled={view.checkpoint.blocksActions || !hasAnyWritable}
    primaryTestId={setupWorkspaceTestIds.wizardStepFailsafeApply}
    onPrimary={handleApply}
    secondaryLabel="Mark as reviewed"
    secondaryShape="pill"
    secondaryDisabled={view.checkpoint.blocksActions || applyPending}
    secondaryTestId={setupWorkspaceTestIds.wizardStepFailsafeConfirm}
    onSecondary={handleMarkReviewed}
  />
</div>

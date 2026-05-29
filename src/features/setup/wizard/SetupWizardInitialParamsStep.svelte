<script lang="ts">
import { fromStore, get } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import { BATTERY_CHEMISTRIES } from "../../../data/battery-presets";
import {
  buildInitialParamsModel,
  createResolvedInitialParamsInputs,
} from "../../../lib/setup/initial-params-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Card, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";
import SetupWizardHintCard from "../shared/SetupWizardHintCard.svelte";

// Conservative beginner defaults: 9" prop, 4S LiPo. These match the expert
// section's initial field values so the two surfaces stay coherent.
const WIZARD_DEFAULT_PROP_INCHES = 9;
const WIZARD_DEFAULT_CELL_COUNT = 4;
const WIZARD_DEFAULT_CHEMISTRY_INDEX = 0;

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
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let model = $derived(buildInitialParamsModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
  inputs: {
    propInches: WIZARD_DEFAULT_PROP_INCHES,
    cellCount: WIZARD_DEFAULT_CELL_COUNT,
    chemistryIndex: WIZARD_DEFAULT_CHEMISTRY_INDEX,
  },
  fallbackInputs: createResolvedInitialParamsInputs({
    propInches: WIZARD_DEFAULT_PROP_INCHES,
    cellCount: WIZARD_DEFAULT_CELL_COUNT,
    chemistryIndex: WIZARD_DEFAULT_CHEMISTRY_INDEX,
  }),
}));
let chemistryLabel = $derived(
  BATTERY_CHEMISTRIES[WIZARD_DEFAULT_CHEMISTRY_INDEX]?.label ?? "LiPo",
);
let stageableBatches = $derived(model.batches.filter((batch) => batch.stageAllowed));
let hasAnyStageable = $derived(
  stageableBatches.some((batch) => batch.entries.some((entry) => entry.item.readOnly !== true)),
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  for (const batch of stageableBatches) {
    for (const entry of batch.entries) {
      if (entry.item.readOnly === true) {
        continue;
      }

      if (entry.item.value !== entry.nextValue) {
        paramsStore.stageParameterEdit(entry.item, entry.nextValue);
        stagedNames.push(entry.name);
      } else if (params.stagedEdits[entry.name]) {
        stagedNames.push(entry.name);
      }
    }
  }

  if (stagedNames.length === 0) {
    // Already aligned — treat as an explicit confirmation.
    setupWorkspaceStore.confirmSection("initial_params");
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
      : snapshot.applyError ?? "Applying the recommended starter baseline failed.";
    return;
  }

  setupWorkspaceStore.confirmSection("initial_params");
  onAdvance();
}

function handleMarkReviewed() {
  setupWorkspaceStore.confirmSection("initial_params");
  onAdvance();
}
</script>

<div class="space-y-4">
  <HelperText>
    The wizard can stage Mission Planner's calculator-style starter values
    for a {WIZARD_DEFAULT_PROP_INCHES}" prop on a {WIZARD_DEFAULT_CELL_COUNT}S {chemistryLabel} pack. Open the Initial Parameters
    section for the expert calculator if your build differs.
  </HelperText>

  <Card.Root surface="primary" density="compact" testId={setupWorkspaceTestIds.wizardStepInitialParamsSummary}>
    <SetupWizardApplyError message={failureMessage} />
    <Eyebrow tracking="widest">
      {model.family.headline}
    </Eyebrow>
    <HelperText class="mt-1">{model.previewStateText}</HelperText>
    {#if model.batches.length > 0}
      <ul class="mt-3 space-y-2">
        {#each model.batches as batch (batch.id)}
          <li>
            <Card.Root density="compact" surface="secondary">
              <Eyebrow tracking="widest">
                {batch.title}
              </Eyebrow>
              <HelperText class="mt-1" size="xs">
                {batch.changedCount} recommended change{batch.changedCount === 1 ? "" : "s"}
              </HelperText>
            </Card.Root>
          </li>
        {/each}
      </ul>
    {:else}
      <HelperText class="mt-3">{model.previewDetailText}</HelperText>
    {/if}
  </Card.Root>

  <SetupWizardHintCard>
    Tuning continues after the wizard — this step only primes a beginner
    baseline. Full PID tuning lives in its own setup section.
  </SetupWizardHintCard>

  <SetupWizardActions
    primaryLabel="Apply recommended baseline"
    primaryPendingLabel="Applying…"
    primaryPending={applyPending}
    primaryDisabled={view.checkpoint.blocksActions || !hasAnyStageable}
    primaryTestId={setupWorkspaceTestIds.wizardStepInitialParamsApply}
    onPrimary={handleApply}
    secondaryLabel="Mark as reviewed"
    secondaryShape="pill"
    secondaryDisabled={view.checkpoint.blocksActions || applyPending}
    secondaryTestId={setupWorkspaceTestIds.wizardStepInitialParamsConfirm}
    onSecondary={handleMarkReviewed}
  />
</div>

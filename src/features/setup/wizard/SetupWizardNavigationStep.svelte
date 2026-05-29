<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Card, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";
import SetupWizardHintCard from "../shared/SetupWizardHintCard.svelte";

// GPS_TYPE=1 is the ArduPilot "Auto" detector — the beginner-safe default the
// Navigation section leans on. Staging it through the shared params store keeps
// the wizard aligned with the expert detour instead of minting a separate path.
const GPS_TYPE_AUTO = 1;

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let applyPending = $state(false);
let failureMessage = $state<string | null>(null);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let receiverTypeItem = $derived(resolvePrimaryReceiverTypeItem(itemIndex));

let currentReceiverTypeLabel = $derived(
  receiverTypeItem?.valueLabel ?? receiverTypeItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (receiverTypeItem && !receiverTypeItem.readOnly && receiverTypeItem.value !== GPS_TYPE_AUTO) {
    paramsStore.stageParameterEdit(receiverTypeItem, GPS_TYPE_AUTO);
    stagedNames.push(receiverTypeItem.name);
  } else if (receiverTypeItem && params.stagedEdits[receiverTypeItem.name]) {
    stagedNames.push(receiverTypeItem.name);
  }

  // Beginner path already matches auto-detect — advance without touching the store.
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
      : snapshot.applyError ?? "Applying the recommended navigation defaults failed.";
    return;
  }

  onAdvance();
}

function resolvePrimaryReceiverTypeItem(
  index: Map<string, ParameterItemModel>,
): ParameterItemModel | null {
  return index.get("GPS1_TYPE") ?? index.get("GPS_TYPE") ?? null;
}
</script>

<div class="space-y-4">
  <HelperText>
    Tell the vehicle which GNSS receiver to use. The beginner path stages
    auto-detect so most wired receivers start working without extra tuning.
  </HelperText>

  <Card.Root surface="primary" density="compact" gap="compact" testId={setupWorkspaceTestIds.wizardStepNavigationSummary}>
    <SetupWizardApplyError message={failureMessage} class="md:col-span-2" />
    <div>
      <Eyebrow tracking="widest">Primary GNSS type</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentReceiverTypeLabel}</p>
      <HelperText class="mt-1" size="xs" tone="muted">{receiverTypeItem?.name ?? "GPS_TYPE"}</HelperText>
    </div>
  </Card.Root>

  <SetupWizardHintCard>
    Need a specific driver or GNSS constellation mask? Open the Navigation section
    from the wizard footer for the expert layout.
  </SetupWizardHintCard>

  <SetupWizardActions
    primaryLabel="Apply and continue"
    primaryPendingLabel="Applying…"
    primaryPending={applyPending}
    primaryDisabled={view.checkpoint.blocksActions}
    primaryTestId={setupWorkspaceTestIds.wizardStepNavigationApply}
    onPrimary={handleApply}
  />
</div>

<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Alert, Button, Card, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

// GPS_TYPE=1 is the ArduPilot "Auto" detector — the beginner-safe default the
// real section leans on. Staging it through the shared params store keeps the
// wizard aligned with the expert detour instead of minting a separate path.
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
let gpsTypeItem = $derived(resolvePrimaryGpsTypeItem(itemIndex));
let autoSwitchItem = $derived(itemIndex.get("GPS_AUTO_SWITCH") ?? null);

let currentGpsTypeLabel = $derived(
  gpsTypeItem?.valueLabel ?? gpsTypeItem?.valueText ?? "Unavailable",
);
let currentAutoSwitchLabel = $derived(
  autoSwitchItem?.valueLabel ?? autoSwitchItem?.valueText ?? "Unavailable",
);

async function handleApply() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  const stagedNames: string[] = [];

  if (gpsTypeItem && !gpsTypeItem.readOnly && gpsTypeItem.value !== GPS_TYPE_AUTO) {
    paramsStore.stageParameterEdit(gpsTypeItem, GPS_TYPE_AUTO);
    stagedNames.push(gpsTypeItem.name);
  } else if (gpsTypeItem && params.stagedEdits[gpsTypeItem.name]) {
    stagedNames.push(gpsTypeItem.name);
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
      : snapshot.applyError ?? "Applying the recommended GPS defaults failed.";
    return;
  }

  onAdvance();
}

function resolvePrimaryGpsTypeItem(
  index: Map<string, ParameterItemModel>,
): ParameterItemModel | null {
  return index.get("GPS1_TYPE") ?? index.get("GPS_TYPE") ?? null;
}
</script>

<div class="space-y-4">
  <HelperText>
    Tell the vehicle which GPS receiver to use. The beginner path stages
    auto-detect so most wired receivers start working without extra tuning.
  </HelperText>

  <Card.Root class="grid md:grid-cols-2" surface="primary" density="compact" gap="compact" testId={setupWorkspaceTestIds.wizardStepGpsSummary}>
    {#if failureMessage}
      <Alert variant="danger" density="compact" shadow={false} class="md:col-span-2" description={`Apply failed. Staged edits remain in the review tray so you can retry. ${failureMessage}`} />
    {/if}
    <div>
      <Eyebrow tracking="widest">Primary GPS type</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentGpsTypeLabel}</p>
      <HelperText class="mt-1" size="xs" tone="muted">{gpsTypeItem?.name ?? "GPS_TYPE"}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Auto switch</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{currentAutoSwitchLabel}</p>
      <HelperText class="mt-1" size="xs" tone="muted">GPS_AUTO_SWITCH</HelperText>
    </div>
  </Card.Root>

  <Card.Root surface="primary" density="compact">
    <HelperText size="xs">
    Need a specific driver or GNSS constellation mask? Open the GPS section
    from the wizard footer for the expert layout.
    </HelperText>
  </Card.Root>

  <div class="flex flex-wrap gap-2">
    <Button
      shape="pill"
      tone="accent"
      variant="soft"
      testId={setupWorkspaceTestIds.wizardStepGpsApply}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handleApply}
    >
      {applyPending ? "Applying…" : "Apply and continue"}
    </Button>
  </div>
</div>

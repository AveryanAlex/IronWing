<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Alert, Card, Eyebrow, FactTile, HelperText, MonoValue } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";

// Mode 2 / AETR preset: roll=ch1, pitch=ch2, throttle=ch3, yaw=ch4.
const MODE_2_PRESET: Record<string, number> = {
  RCMAP_ROLL: 1,
  RCMAP_PITCH: 2,
  RCMAP_THROTTLE: 3,
  RCMAP_YAW: 4,
};
const RCMAP_NAMES = Object.keys(MODE_2_PRESET);

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
let rollItem = $derived(itemIndex.get("RCMAP_ROLL") ?? null);
let pitchItem = $derived(itemIndex.get("RCMAP_PITCH") ?? null);
let throttleItem = $derived(itemIndex.get("RCMAP_THROTTLE") ?? null);
let yawItem = $derived(itemIndex.get("RCMAP_YAW") ?? null);

let signalLive = $derived(view.rcReceiver.signalState === "live");
let signalMalformed = $derived(view.rcReceiver.hasMalformedChannels);
let continueDisabled = $derived(
  !signalLive || signalMalformed || view.checkpoint.blocksActions,
);
let firstFourChannels = $derived(view.rcReceiver.channels.slice(0, 4));

async function handlePreset() {
  if (applyPending) {
    return;
  }

  failureMessage = null;

  for (const [name, nextValue] of Object.entries(MODE_2_PRESET)) {
    const item = itemIndex.get(name);
    if (!item || item.readOnly) {
      continue;
    }

    if (item.value === nextValue && !params.stagedEdits[name]) {
      continue;
    }

    paramsStore.stageParameterEdit(item, nextValue);
  }

  applyPending = true;
  try {
    await paramsStore.applyStagedEdits(RCMAP_NAMES);
  } finally {
    applyPending = false;
  }

  const snapshot = get(paramsStore);
  const retainedFailureMessages = RCMAP_NAMES
    .map((name) => snapshot.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null)
    .map((failure) => `${failure.name}: ${failure.message}`);

  if (retainedFailureMessages.length > 0) {
    failureMessage = retainedFailureMessages.join(" · ");
  } else if (snapshot.applyPhase === "failed" || snapshot.applyPhase === "partial-failure") {
    failureMessage = snapshot.applyError ?? "Applying RCMAP preset failed.";
  }
}

function handleContinue() {
  if (continueDisabled) {
    return;
  }

  onAdvance();
}
</script>

<div class="space-y-4">
  <HelperText>
    Confirm the transmitter is broadcasting live RC input and apply the Mode 2 channel-order preset.
    Continue once the wizard shows a live receiver signal.
  </HelperText>

  <Card.Root class="grid md:grid-cols-2" surface="primary" density="compact" gap="compact" testId={setupWorkspaceTestIds.wizardStepRcSummary}>
    <div>
      <Eyebrow tracking="widest">Signal state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary">{view.rcReceiver.statusText}</p>
      <Eyebrow class="mt-1" tracking="widest">
        {view.rcReceiver.signalState}{view.rcReceiver.rssiText ? ` · ${view.rcReceiver.rssiText}` : ""}
      </Eyebrow>
    </div>
    <div>
      <Eyebrow tracking="widest">Current RCMAP</Eyebrow>
      <MonoValue class="mt-2 block" size="xs" tone="secondary" wrap>
        ROLL={rollItem?.valueText ?? "--"} · PITCH={pitchItem?.valueText ?? "--"} ·
        THROTTLE={throttleItem?.valueText ?? "--"} · YAW={yawItem?.valueText ?? "--"}
      </MonoValue>
    </div>
  </Card.Root>

  {#if firstFourChannels.length > 0}
    <Card.Root class="grid gap-2 md:grid-cols-4" surface="primary" density="compact">
      {#each firstFourChannels as channel (channel.channel)}
        <FactTile label={`CH${channel.channel}`} value={channel.pwm} density="compact" />
      {/each}
    </Card.Root>
  {/if}

  {#if !signalLive || signalMalformed}
    <Alert
      variant="warning"
      density="compact"
      shadow={false}
      description={signalMalformed
        ? "The vehicle reported a malformed RC payload. Fix the transmitter link before continuing."
        : "No live RC signal yet. Bind your transmitter, then wait for live channel bars before continuing."}
      testId={setupWorkspaceTestIds.wizardStepRcWarning}
    />
  {/if}

  <SetupWizardApplyError message={failureMessage} prefix="Preset apply failed." />

  <SetupWizardActions
    primaryLabel="Continue"
    primaryDisabled={continueDisabled}
    primaryTestId={setupWorkspaceTestIds.wizardStepRcContinue}
    onPrimary={handleContinue}
    secondaryLabel="Apply Mode 2 preset"
    secondaryPendingLabel="Applying…"
    secondaryPending={applyPending}
    secondaryDisabled={view.checkpoint.blocksActions}
    secondaryTestId={setupWorkspaceTestIds.wizardStepRcPreset}
    secondaryPosition="before"
    onSecondary={handlePreset}
  />
</div>

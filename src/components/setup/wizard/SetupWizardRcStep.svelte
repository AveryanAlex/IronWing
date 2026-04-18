<script lang="ts">
import { fromStore, get } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import {
  buildParameterItemIndex,
} from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

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
  <p class="text-sm text-text-secondary">
    Confirm the transmitter is broadcasting live RC input and apply the Mode 2 channel-order preset.
    Continue once the wizard shows a live receiver signal.
  </p>

  <div
    class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-2"
    data-testid={setupWorkspaceTestIds.wizardStepRcSummary}
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Signal state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{view.rcReceiver.statusText}</p>
      <p class="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">
        {view.rcReceiver.signalState}{view.rcReceiver.rssiText ? ` · ${view.rcReceiver.rssiText}` : ""}
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Current RCMAP</p>
      <p class="mt-2 font-mono text-xs text-text-secondary">
        ROLL={rollItem?.valueText ?? "--"} · PITCH={pitchItem?.valueText ?? "--"} ·
        THROTTLE={throttleItem?.valueText ?? "--"} · YAW={yawItem?.valueText ?? "--"}
      </p>
    </div>
  </div>

  {#if firstFourChannels.length > 0}
    <div class="grid gap-2 rounded-lg border border-border bg-bg-primary/60 p-3 md:grid-cols-4">
      {#each firstFourChannels as channel (channel.channel)}
        <div class="rounded-xl border border-border bg-bg-secondary/70 px-3 py-2 text-xs text-text-secondary">
          <p class="font-mono font-semibold uppercase tracking-[0.18em] text-text-muted">
            CH{channel.channel}
          </p>
          <p class="mt-1 font-mono text-sm font-semibold text-text-primary">{channel.pwm}</p>
        </div>
      {/each}
    </div>
  {/if}

  {#if !signalLive || signalMalformed}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={setupWorkspaceTestIds.wizardStepRcWarning}
    >
      {signalMalformed
        ? "The vehicle reported a malformed RC payload. Fix the transmitter link before continuing."
        : "No live RC signal yet. Bind your transmitter, then wait for live channel bars before continuing."}
    </div>
  {/if}

  {#if failureMessage}
    <div class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      Preset apply failed. {failureMessage}
    </div>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={setupWorkspaceTestIds.wizardStepRcPreset}
      disabled={view.checkpoint.blocksActions || applyPending}
      onclick={handlePreset}
      type="button"
    >
      {applyPending ? "Applying…" : "Apply Mode 2 preset"}
    </button>
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepRcContinue}
      disabled={continueDisabled}
      onclick={handleContinue}
      type="button"
    >
      Continue
    </button>
  </div>
</div>

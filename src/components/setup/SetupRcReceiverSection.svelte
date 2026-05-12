<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../lib/stores/setup-workspace";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const PRESETS = [
  {
    id: "aetr",
    label: "AETR",
    values: {
      RCMAP_ROLL: 1,
      RCMAP_PITCH: 2,
      RCMAP_THROTTLE: 3,
      RCMAP_YAW: 4,
    },
  },
  {
    id: "taer",
    label: "TAER",
    values: {
      RCMAP_ROLL: 2,
      RCMAP_PITCH: 3,
      RCMAP_THROTTLE: 1,
      RCMAP_YAW: 4,
    },
  },
] as const;

const CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, index) => ({
  value: String(index + 1),
  label: `Channel ${index + 1}`,
}));

let { view }: { view: SetupWorkspaceStoreState } = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let docsUrl = $derived(resolveDocsUrl("radio_calibration"));
let retainedFailures = $derived(
  ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"]
    .map((name) => params.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null),
);
let rollItem = $derived(itemIndex.get("RCMAP_ROLL") ?? null);
let pitchItem = $derived(itemIndex.get("RCMAP_PITCH") ?? null);
let throttleItem = $derived(itemIndex.get("RCMAP_THROTTLE") ?? null);
let yawItem = $derived(itemIndex.get("RCMAP_YAW") ?? null);
let rollDraft = $derived(String(params.stagedEdits.RCMAP_ROLL?.nextValue ?? rollItem?.value ?? ""));
let pitchDraft = $derived(String(params.stagedEdits.RCMAP_PITCH?.nextValue ?? pitchItem?.value ?? ""));
let throttleDraft = $derived(String(params.stagedEdits.RCMAP_THROTTLE?.nextValue ?? throttleItem?.value ?? ""));
let yawDraft = $derived(String(params.stagedEdits.RCMAP_YAW?.nextValue ?? yawItem?.value ?? ""));
let currentPreset = $derived.by(() => {
  const currentValues = {
    RCMAP_ROLL: resolveDraftNumber(rollDraft) ?? rollItem?.value ?? null,
    RCMAP_PITCH: resolveDraftNumber(pitchDraft) ?? pitchItem?.value ?? null,
    RCMAP_THROTTLE: resolveDraftNumber(throttleDraft) ?? throttleItem?.value ?? null,
    RCMAP_YAW: resolveDraftNumber(yawDraft) ?? yawItem?.value ?? null,
  };

  return PRESETS.find((preset) => (
    currentValues.RCMAP_ROLL === preset.values.RCMAP_ROLL
    && currentValues.RCMAP_PITCH === preset.values.RCMAP_PITCH
    && currentValues.RCMAP_THROTTLE === preset.values.RCMAP_THROTTLE
    && currentValues.RCMAP_YAW === preset.values.RCMAP_YAW
  )) ?? null;
});

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canStage(item: ParameterItemModel | null, draftValue: string): boolean {
  if (view.checkpoint.blocksActions) {
    return false;
  }

  const nextValue = resolveDraftNumber(draftValue);
  return Boolean(
    item
      && nextValue !== null
      && item.readOnly !== true
      && item.value !== nextValue
      && params.stagedEdits[item.name]?.nextValue !== nextValue,
  );
}

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || view.checkpoint.blocksActions) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}

function stagePreset(preset: (typeof PRESETS)[number]) {
  if (view.checkpoint.blocksActions) {
    return;
  }

  for (const [name, nextValue] of Object.entries(preset.values) as Array<[string, number]>) {
    const item = itemIndex.get(name) ?? null;
    if (!item || item.readOnly === true || item.value === nextValue) {
      continue;
    }

    paramsStore.stageParameterEdit(item, nextValue);
  }
}
</script>

<SetupSectionShell
  eyebrow="RC receiver"
  title="Check live channel bars and queue receiver mapping changes"
  description="Watch live PWM movement here, then queue channel-order changes in the review tray. This section shows receiver motion and mapping without applying changes on its own."
  testId={setupWorkspaceTestIds.rcSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.rcDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        RC calibration docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
    <div class="setup-rc-body">
      <div class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Live receiver state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.rcSignal}>
        {view.rcReceiver.statusText}
      </p>
      <p class="mt-1 text-sm text-text-secondary" data-testid={setupWorkspaceTestIds.rcDetail}>
        {view.rcReceiver.detailText}
      </p>
    </div>

    <div class="rounded-lg border border-border bg-bg-secondary/70 px-4 py-3 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.rcRssi}>
      {view.rcReceiver.rssiText}
    </div>
  </div>

  {#if retainedFailures.length > 0}
    <div
      class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm leading-6 text-danger"
      data-testid={setupWorkspaceTestIds.rcFailure}
    >
      <p class="font-semibold text-text-primary">The shared review tray is still retaining RC mapping failures.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Live channel bars</p>
      <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {view.rcReceiver.signalState}
      </span>
      {#if currentPreset}
        <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          {currentPreset.label}
        </span>
      {/if}
    </div>

    {#if view.rcReceiver.channels.length === 0}
      <div class="mt-4 rounded-lg border border-border bg-bg-secondary/70 px-4 py-4 text-sm leading-6 text-text-secondary">
        {view.rcReceiver.detailText}
      </div>
    {:else}
      <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {#each view.rcReceiver.channels as channel (channel.channel)}
          <article
            class={`rounded-lg border px-3 py-3 ${channel.stale ? "border-warning/40 bg-warning/10" : "border-border bg-bg-secondary/70"}`}
            data-testid={`${setupWorkspaceTestIds.rcBarPrefix}-${channel.channel}`}
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">CH{channel.channel}</p>
              <p class="font-mono text-sm font-semibold text-text-primary">{channel.pwm}</p>
            </div>
            <div class="relative mt-3 h-2.5 overflow-hidden rounded-full bg-bg-primary/90">
              <div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80"></div>
              <div class="absolute top-0 h-full w-1 rounded-full bg-accent" style:left={`calc(${channel.percent}% - 2px)`}></div>
            </div>
            {#if channel.stale}
              <p class="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">Stale sample</p>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </div>

  <div class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Channel-order presets</p>
      <span class="text-sm text-text-secondary">Start with a known transmitter order, then fine-tune individual axes if needed.</span>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      {#each PRESETS as preset (preset.id)}
        <button
          class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${currentPreset?.id === preset.id ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-primary hover:border-accent hover:text-accent"}`}
          data-testid={`${setupWorkspaceTestIds.rcPresetPrefix}-${preset.id}`}
          disabled={view.checkpoint.blocksActions}
          onclick={() => stagePreset(preset)}
          type="button"
        >
          {preset.label}
        </button>
      {/each}
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article class="rounded-lg border border-border bg-bg-secondary/70 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">RCMAP_ROLL</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Roll</h4>
        <p class="mt-2 text-sm text-text-secondary">Map the primary roll axis to the receiver channel that is moving for roll.</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_ROLL`}>
          Current · {rollItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.RCMAP_ROLL}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_ROLL`}>
            Queued · {params.stagedEdits.RCMAP_ROLL.nextValueText}
          </p>
        {/if}
        <select
          bind:value={rollDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_ROLL`}
          disabled={view.checkpoint.blocksActions}
        >
          {#each CHANNEL_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.rcStageButtonPrefix}-RCMAP_ROLL`}
          disabled={!canStage(rollItem, rollDraft)}
          onclick={() => stage(rollItem, rollDraft)}
          type="button"
        >
          {params.stagedEdits.RCMAP_ROLL ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article class="rounded-lg border border-border bg-bg-secondary/70 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">RCMAP_PITCH</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Pitch</h4>
        <p class="mt-2 text-sm text-text-secondary">Map the primary pitch axis to the receiver channel that is moving for pitch.</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_PITCH`}>
          Current · {pitchItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.RCMAP_PITCH}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_PITCH`}>
            Queued · {params.stagedEdits.RCMAP_PITCH.nextValueText}
          </p>
        {/if}
        <select
          bind:value={pitchDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_PITCH`}
          disabled={view.checkpoint.blocksActions}
        >
          {#each CHANNEL_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.rcStageButtonPrefix}-RCMAP_PITCH`}
          disabled={!canStage(pitchItem, pitchDraft)}
          onclick={() => stage(pitchItem, pitchDraft)}
          type="button"
        >
          {params.stagedEdits.RCMAP_PITCH ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article class="rounded-lg border border-border bg-bg-secondary/70 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">RCMAP_THROTTLE</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Throttle</h4>
        <p class="mt-2 text-sm text-text-secondary">Map the primary throttle axis to the receiver channel that is moving for throttle.</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_THROTTLE`}>
          Current · {throttleItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.RCMAP_THROTTLE}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_THROTTLE`}>
            Queued · {params.stagedEdits.RCMAP_THROTTLE.nextValueText}
          </p>
        {/if}
        <select
          bind:value={throttleDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_THROTTLE`}
          disabled={view.checkpoint.blocksActions}
        >
          {#each CHANNEL_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.rcStageButtonPrefix}-RCMAP_THROTTLE`}
          disabled={!canStage(throttleItem, throttleDraft)}
          onclick={() => stage(throttleItem, throttleDraft)}
          type="button"
        >
          {params.stagedEdits.RCMAP_THROTTLE ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article class="rounded-lg border border-border bg-bg-secondary/70 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">RCMAP_YAW</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Yaw</h4>
        <p class="mt-2 text-sm text-text-secondary">Map the primary yaw axis to the receiver channel that is moving for yaw.</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_YAW`}>
          Current · {yawItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.RCMAP_YAW}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_YAW`}>
            Queued · {params.stagedEdits.RCMAP_YAW.nextValueText}
          </p>
        {/if}
        <select
          bind:value={yawDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_YAW`}
          disabled={view.checkpoint.blocksActions}
        >
          {#each CHANNEL_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-primary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.rcStageButtonPrefix}-RCMAP_YAW`}
          disabled={!canStage(yawItem, yawDraft)}
          onclick={() => stage(yawItem, yawDraft)}
          type="button"
        >
          {params.stagedEdits.RCMAP_YAW ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>
    </div>
  </div>
    </div>
  {/snippet}
</SetupSectionShell>

<style>
.setup-rc-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>

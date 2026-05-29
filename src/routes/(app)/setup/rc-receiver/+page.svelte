<script lang="ts">
import { Activity, GitBranch, Radio } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { Badge, Button, EmptyState, HelperText, NativeSelect } from "../../../../components/ui";
import PwmChannelStrip from "../../../../features/telemetry/components/PwmChannelStrip.svelte";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParameterRow from "../../../../features/setup/shared/SetupParameterRow.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import { getSetupWorkspaceRouteContext } from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);

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

  return (
    PRESETS.find(
      (preset) =>
        currentValues.RCMAP_ROLL === preset.values.RCMAP_ROLL &&
        currentValues.RCMAP_PITCH === preset.values.RCMAP_PITCH &&
        currentValues.RCMAP_THROTTLE === preset.values.RCMAP_THROTTLE &&
        currentValues.RCMAP_YAW === preset.values.RCMAP_YAW,
    ) ?? null
  );
});
let rcChannelItems = $derived(
  view.rcReceiver.channels.map((channel) => ({
    index: channel.channel,
    value: channel.pwm,
    stale: channel.stale,
  })),
);
let mappingAvailable = $derived(Boolean(rollItem || pitchItem || throttleItem || yawItem));

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || view.checkpoint.blocksActions) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}

function unstage(name: string) {
  paramsStore.discardStagedEdit(name);
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
  sectionId="rc_receiver"
  eyebrow="RC receiver"
  title="Check live channel bars and queue receiver mapping changes"
  description="Watch live PWM movement, identify roll/pitch/throttle/yaw channels, then stage receiver mapping changes for review before applying them."
  testId={setupWorkspaceTestIds.rcSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.rcDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard icon={Radio} title="Live receiver state" surface="elevated">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p class="text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.rcSignal}>
            {view.rcReceiver.statusText}
          </p>
          <HelperText class="mt-1" testId={setupWorkspaceTestIds.rcDetail}>
            {view.rcReceiver.detailText}
          </HelperText>
        </div>

        <div class="rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.rcRssi}>
          {view.rcReceiver.rssiText}
        </div>
      </div>
    </SetupSectionCard>

  {#if retainedFailures.length > 0}
    <SetupNotice tone="danger" testId={setupWorkspaceTestIds.rcFailure}>
      <p class="font-semibold text-text-primary">RC mapping changes could not be staged.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </SetupNotice>
  {/if}

  {#snippet channelStatus()}
    <div class="flex flex-wrap items-center gap-2">
        <Badge variant="muted" size="sm" case="normal" shape="pill">
          {view.rcReceiver.signalState}
        </Badge>
        {#if currentPreset}
          <Badge variant="accent" size="sm" case="normal" shape="pill">
            {currentPreset.label}
          </Badge>
        {/if}
      </div>
  {/snippet}

  <SetupSectionCard icon={Activity} title="Live channel monitor" description="Move each stick and switch to confirm the channel that changes." surface="elevated" status={channelStatus}>

    {#if view.rcReceiver.channels.length === 0}
      <EmptyState title="No live channel bars" description={view.rcReceiver.detailText} />
    {:else}
      <div>
        <PwmChannelStrip items={rcChannelItems} labelPrefix="CH" testIdPrefix={setupWorkspaceTestIds.rcBarPrefix} />
      </div>
    {/if}
  </SetupSectionCard>

  <SetupSectionCard icon={GitBranch} title="Channel mapping" description="Start with a known transmitter order, then fine-tune individual axes if needed." surface="elevated">
    <div class="flex flex-wrap gap-2">
      {#each PRESETS as preset (preset.id)}
        <Button
          tone="accent"
          testId={`${setupWorkspaceTestIds.rcPresetPrefix}-${preset.id}`}
          disabled={view.checkpoint.blocksActions}
          onclick={() => stagePreset(preset)}
          variant={currentPreset?.id === preset.id ? "soft" : "outline"}
        >
          {preset.label}
        </Button>
      {/each}
    </div>

    {#if mappingAvailable}
      <SetupFieldStack class="mt-2" divided>
        {#if rollItem}
          <SetupParameterRow
            id="setup-rc-map-roll"
            label="Roll"
            description="Map roll to the receiver channel that moves with the roll stick."
            stagedName={params.stagedEdits.RCMAP_ROLL ? "RCMAP_ROLL" : undefined}
            stagedTestId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_ROLL`}
            onUnstage={unstage}
            controlWidth="narrow"
          >
            <NativeSelect
              bind:value={rollDraft}
              disabled={view.checkpoint.blocksActions}
              onchange={(event) => stage(rollItem, (event.currentTarget as HTMLSelectElement).value)}
              options={CHANNEL_OPTIONS}
              testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_ROLL`}
            />
          </SetupParameterRow>
        {/if}

        {#if pitchItem}
          <SetupParameterRow
            id="setup-rc-map-pitch"
            label="Pitch"
            description="Map pitch to the receiver channel that moves with the pitch stick."
            stagedName={params.stagedEdits.RCMAP_PITCH ? "RCMAP_PITCH" : undefined}
            stagedTestId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_PITCH`}
            onUnstage={unstage}
            controlWidth="narrow"
          >
            <NativeSelect
              bind:value={pitchDraft}
              disabled={view.checkpoint.blocksActions}
              onchange={(event) => stage(pitchItem, (event.currentTarget as HTMLSelectElement).value)}
              options={CHANNEL_OPTIONS}
              testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_PITCH`}
            />
          </SetupParameterRow>
        {/if}

        {#if throttleItem}
          <SetupParameterRow
            id="setup-rc-map-throttle"
            label="Throttle"
            description="Map throttle to the receiver channel that moves with the throttle stick."
            stagedName={params.stagedEdits.RCMAP_THROTTLE ? "RCMAP_THROTTLE" : undefined}
            stagedTestId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_THROTTLE`}
            onUnstage={unstage}
            controlWidth="narrow"
          >
            <NativeSelect
              bind:value={throttleDraft}
              disabled={view.checkpoint.blocksActions}
              onchange={(event) => stage(throttleItem, (event.currentTarget as HTMLSelectElement).value)}
              options={CHANNEL_OPTIONS}
              testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_THROTTLE`}
            />
          </SetupParameterRow>
        {/if}

        {#if yawItem}
          <SetupParameterRow
            id="setup-rc-map-yaw"
            label="Yaw"
            description="Map yaw to the receiver channel that moves with the yaw stick."
            stagedName={params.stagedEdits.RCMAP_YAW ? "RCMAP_YAW" : undefined}
            stagedTestId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_YAW`}
            onUnstage={unstage}
            controlWidth="narrow"
          >
            <NativeSelect
              bind:value={yawDraft}
              disabled={view.checkpoint.blocksActions}
              onchange={(event) => stage(yawItem, (event.currentTarget as HTMLSelectElement).value)}
              options={CHANNEL_OPTIONS}
              testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_YAW`}
            />
          </SetupParameterRow>
        {/if}
      </SetupFieldStack>
    {:else}
      <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
    {/if}
  </SetupSectionCard>

  <SetupGuideCard title="Receiver mapping check" description="Use the live channel monitor before changing mapping.">
    <p>Move one stick at a time, confirm the changing PWM channel, then stage the matching roll, pitch, throttle, and yaw channel numbers.</p>
  </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

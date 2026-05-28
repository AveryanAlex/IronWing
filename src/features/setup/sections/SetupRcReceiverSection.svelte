<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Alert, Badge, Button, Card, EmptyState, Eyebrow, HelperText, NativeSelect, StagedBadge as SetupStagedBadge } from "../../../components/ui";
import PwmChannelStrip from "../../telemetry/components/PwmChannelStrip.svelte";
import SetupSectionShell from "../components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

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
let rcChannelItems = $derived(view.rcReceiver.channels.map((channel) => ({
  index: channel.channel,
  value: channel.pwm,
  stale: channel.stale,
})));

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
  description="Watch live PWM movement here, then queue channel-order changes in the review tray. This section shows receiver motion and mapping without applying changes on its own."
  testId={setupWorkspaceTestIds.rcSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.rcDocsLink }]}
>
  {#snippet body()}
      <Card.Root class="grid md:grid-cols-[minmax(0,1fr)_auto]" density="compact" gap="compact" surface="elevated">
    <div>
      <Eyebrow tracking="widest">Live receiver state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.rcSignal}>
        {view.rcReceiver.statusText}
      </p>
      <HelperText class="mt-1" testId={setupWorkspaceTestIds.rcDetail}>
        {view.rcReceiver.detailText}
      </HelperText>
    </div>

    <Card.Root class="px-4 text-sm font-semibold" density="compact" justify="center" surface="muted" testId={setupWorkspaceTestIds.rcRssi}>
      {view.rcReceiver.rssiText}
    </Card.Root>
  </Card.Root>

  {#if retainedFailures.length > 0}
    <Alert variant="danger" density="compact" shadow={false} testId={setupWorkspaceTestIds.rcFailure}>
      <p class="font-semibold text-text-primary">The shared review tray is still retaining RC mapping failures.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </Alert>
  {/if}

  <Card.Root density="compact" surface="elevated">
    <div class="flex flex-wrap items-center gap-2">
      <Eyebrow tracking="widest">Live channel bars</Eyebrow>
      <Badge variant="muted" size="sm" case="normal" shape="pill">
        {view.rcReceiver.signalState}
      </Badge>
      {#if currentPreset}
        <Badge variant="accent" size="sm" case="normal" shape="pill">
          {currentPreset.label}
        </Badge>
      {/if}
    </div>

    {#if view.rcReceiver.channels.length === 0}
      <EmptyState class="mt-4" title="No live channel bars" description={view.rcReceiver.detailText} />
    {:else}
      <div class="mt-4">
        <PwmChannelStrip items={rcChannelItems} labelPrefix="CH" testIdPrefix={setupWorkspaceTestIds.rcBarPrefix} />
      </div>
    {/if}
  </Card.Root>

  <Card.Root density="compact" surface="elevated">
    <div class="flex flex-wrap items-center gap-2">
      <Eyebrow tracking="widest">Channel-order presets</Eyebrow>
      <HelperText as="span">Start with a known transmitter order, then fine-tune individual axes if needed.</HelperText>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
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

    <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card.Root as="article" density="compact" surface="muted">
        <h4 class="text-base font-semibold text-text-primary">Roll</h4>
        <HelperText class="mt-2">Map the primary roll axis to the receiver channel that is moving for roll.</HelperText>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_ROLL`}>
          Current · {rollItem?.valueText ?? "Unavailable"}
        </Eyebrow>
        {#if params.stagedEdits.RCMAP_ROLL}
          <p class="mt-2">
            <SetupStagedBadge name="RCMAP_ROLL" onUnstage={unstage} testId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_ROLL`} />
          </p>
        {/if}
        <NativeSelect
          bind:value={rollDraft}
          class="mt-4"
          disabled={view.checkpoint.blocksActions}
          onchange={(event) => stage(rollItem, (event.currentTarget as HTMLSelectElement).value)}
          options={CHANNEL_OPTIONS}
          testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_ROLL`}
        />
      </Card.Root>

      <Card.Root as="article" density="compact" surface="muted">
        <h4 class="text-base font-semibold text-text-primary">Pitch</h4>
        <HelperText class="mt-2">Map the primary pitch axis to the receiver channel that is moving for pitch.</HelperText>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_PITCH`}>
          Current · {pitchItem?.valueText ?? "Unavailable"}
        </Eyebrow>
        {#if params.stagedEdits.RCMAP_PITCH}
          <p class="mt-2">
            <SetupStagedBadge name="RCMAP_PITCH" onUnstage={unstage} testId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_PITCH`} />
          </p>
        {/if}
        <NativeSelect
          bind:value={pitchDraft}
          class="mt-4"
          disabled={view.checkpoint.blocksActions}
          onchange={(event) => stage(pitchItem, (event.currentTarget as HTMLSelectElement).value)}
          options={CHANNEL_OPTIONS}
          testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_PITCH`}
        />
      </Card.Root>

      <Card.Root as="article" density="compact" surface="muted">
        <h4 class="text-base font-semibold text-text-primary">Throttle</h4>
        <HelperText class="mt-2">Map the primary throttle axis to the receiver channel that is moving for throttle.</HelperText>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_THROTTLE`}>
          Current · {throttleItem?.valueText ?? "Unavailable"}
        </Eyebrow>
        {#if params.stagedEdits.RCMAP_THROTTLE}
          <p class="mt-2">
            <SetupStagedBadge name="RCMAP_THROTTLE" onUnstage={unstage} testId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_THROTTLE`} />
          </p>
        {/if}
        <NativeSelect
          bind:value={throttleDraft}
          class="mt-4"
          disabled={view.checkpoint.blocksActions}
          onchange={(event) => stage(throttleItem, (event.currentTarget as HTMLSelectElement).value)}
          options={CHANNEL_OPTIONS}
          testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_THROTTLE`}
        />
      </Card.Root>

      <Card.Root as="article" density="compact" surface="muted">
        <h4 class="text-base font-semibold text-text-primary">Yaw</h4>
        <HelperText class="mt-2">Map the primary yaw axis to the receiver channel that is moving for yaw.</HelperText>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.rcCurrentPrefix}-RCMAP_YAW`}>
          Current · {yawItem?.valueText ?? "Unavailable"}
        </Eyebrow>
        {#if params.stagedEdits.RCMAP_YAW}
          <p class="mt-2">
            <SetupStagedBadge name="RCMAP_YAW" onUnstage={unstage} testId={`${setupWorkspaceTestIds.rcStagedPrefix}-RCMAP_YAW`} />
          </p>
        {/if}
        <NativeSelect
          bind:value={yawDraft}
          class="mt-4"
          disabled={view.checkpoint.blocksActions}
          onchange={(event) => stage(yawItem, (event.currentTarget as HTMLSelectElement).value)}
          options={CHANNEL_OPTIONS}
          testId={`${setupWorkspaceTestIds.rcInputPrefix}-RCMAP_YAW`}
        />
      </Card.Root>
    </div>
  </Card.Root>
  {/snippet}
</SetupSectionShell>

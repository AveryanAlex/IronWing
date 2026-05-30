<script lang="ts">
import {
  Activity,
  Crosshair,
  Gauge,
  GitBranch,
  ListChecks,
  MoveVertical,
  Radio,
  Settings2,
  SlidersHorizontal,
} from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { Badge, Button, EmptyState, HelperText } from "../../../../components/ui";
import PwmChannelStrip from "../../../../features/telemetry/components/PwmChannelStrip.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import CopterAngleModeTiltEditor from "../../../../features/setup/components/CopterAngleModeTiltEditor.svelte";
import CopterThrottleClimbResponseEditor from "../../../../features/setup/components/CopterThrottleClimbResponseEditor.svelte";
import RcCalibrationEditor from "../../../../features/setup/components/RcCalibrationEditor.svelte";
import RcReceiverSettingsEditor from "../../../../features/setup/components/RcReceiverSettingsEditor.svelte";
import RcOptionAssignmentEditor from "../../../../features/setup/components/RcOptionAssignmentEditor.svelte";
import RssiSourceEditor from "../../../../features/setup/components/RssiSourceEditor.svelte";
import RateCurveEditor from "../../../../features/setup/components/rates/RateCurveEditor.svelte";
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
  code: index + 1,
  label: `Channel ${index + 1}`,
}));

const COMMON_MAPPING_AXIS_NAMES = ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"] as const;

const MAPPING_AXES = [
  {
    name: "RCMAP_ROLL",
    id: "setup-rc-map-roll",
    label: "Roll",
    description: "Map roll to the receiver channel that moves with the roll stick.",
  },
  {
    name: "RCMAP_PITCH",
    id: "setup-rc-map-pitch",
    label: "Pitch",
    description: "Map pitch to the receiver channel that moves with the pitch stick.",
  },
  {
    name: "RCMAP_THROTTLE",
    id: "setup-rc-map-throttle",
    label: "Throttle",
    description: "Map throttle to the receiver channel that moves with the throttle stick.",
  },
  {
    name: "RCMAP_YAW",
    id: "setup-rc-map-yaw",
    label: "Yaw",
    description: "Map yaw to the receiver channel that moves with the yaw stick.",
  },
  {
    name: "RCMAP_FORWARD",
    id: "setup-rc-map-forward",
    label: "Sub forward",
    description: "Map Sub forward motion to its receiver channel when supported by this firmware.",
  },
  {
    name: "RCMAP_LATERAL",
    id: "setup-rc-map-lateral",
    label: "Sub lateral",
    description: "Map Sub lateral motion to its receiver channel when supported by this firmware.",
  },
] as const;

type CommonMappingAxisName = (typeof COMMON_MAPPING_AXIS_NAMES)[number];

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let docsUrl = $derived(resolveDocsUrl("radio_calibration"));
let retainedFailures = $derived(
  MAPPING_AXES.map((axis) => params.retainedFailures[axis.name]).filter(
    (failure): failure is NonNullable<typeof failure> => failure != null,
  ),
);
let mappingRows = $derived.by(() =>
  MAPPING_AXES.flatMap((axis) => {
    const item = itemIndex.get(axis.name) ?? null;
    if (!item) {
      return [];
    }

    return [
      {
        ...axis,
        item,
        draft: resolveMappingDraft(axis.name, item),
        stagedName: params.stagedEdits[axis.name] ? axis.name : undefined,
        disabled: view.checkpoint.blocksActions || item.readOnly,
      },
    ];
  }),
);
let currentPreset = $derived.by(() => {
  const currentValues = {
    RCMAP_ROLL: resolveMappingNumber("RCMAP_ROLL"),
    RCMAP_PITCH: resolveMappingNumber("RCMAP_PITCH"),
    RCMAP_THROTTLE: resolveMappingNumber("RCMAP_THROTTLE"),
    RCMAP_YAW: resolveMappingNumber("RCMAP_YAW"),
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
let mappingAvailable = $derived(mappingRows.length > 0);

function resolveMappingDraft(name: string, item: ParameterItemModel | null): string {
  return String(params.stagedEdits[name]?.nextValue ?? item?.value ?? "");
}

function resolveMappingNumber(name: CommonMappingAxisName): number | null {
  const item = itemIndex.get(name) ?? null;
  return resolveDraftNumber(resolveMappingDraft(name, item)) ?? item?.value ?? null;
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || item.readOnly || nextValue === null || view.checkpoint.blocksActions) {
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

  for (const [name, nextValue] of Object.entries(preset.values) as Array<[CommonMappingAxisName, number]>) {
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
  title="Review live RC input and queue setup changes"
  description="Watch live PWM movement, stage channel mapping and calibration, then tune available RC stick-response settings before applying them."
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

  <SetupSectionCard
    icon={Settings2}
    title="Receiver protocols, options, and timeouts"
    description="Review global ArduPilot receiver detection, behavior flags, override timeout, and RC-loss failsafe timeout settings."
    surface="elevated"
  >
    <RcReceiverSettingsEditor
      {itemIndex}
      metadata={params.metadata}
      stagedEdits={params.stagedEdits}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
      onResetParameter={(name) => paramsStore.discardStagedEdit(name)}
    />
  </SetupSectionCard>

  <SetupSectionCard
    icon={Radio}
    title="RSSI signal source"
    description="Select the native ArduPilot RSSI source, preview available live signal data, and stage only that source's calibration settings."
    surface="elevated"
  >
    <RssiSourceEditor
      {itemIndex}
      metadata={params.metadata}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      rssiText={view.rcReceiver.rssiText}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
      onResetParameter={(name) => paramsStore.discardStagedEdit(name)}
    />
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

    <HelperText class="mt-3">RCMAP channel changes take effect after vehicle reboot.</HelperText>

    {#if mappingAvailable}
      <SetupParamEditGrid class="mt-3">
        {#each mappingRows as mapping (mapping.name)}
          <SetupParamEditCard
            item={mapping.item}
            inputId={mapping.id}
            label={mapping.label}
            description={mapping.description}
            type="enum"
            value={mapping.draft}
            options={CHANNEL_OPTIONS}
            disabled={mapping.disabled}
            stagedName={mapping.stagedName}
            stagedTestId={`${setupWorkspaceTestIds.rcStagedPrefix}-${mapping.name}`}
            onUnstage={unstage}
            inputTestId={`${setupWorkspaceTestIds.rcInputPrefix}-${mapping.name}`}
            onValueChange={(value) => typeof value === "string" && stage(mapping.item, value)}
          />
        {/each}
      </SetupParamEditGrid>
    {:else}
      <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
    {/if}
  </SetupSectionCard>

  <SetupSectionCard
    icon={ListChecks}
    title="Auxiliary channel functions"
    description="Review firmware-specific RCx_OPTION assignments, confirm switch motion with live PWM, and stage selected-channel changes."
    surface="elevated"
  >
    <RcOptionAssignmentEditor
      {itemIndex}
      metadata={params.metadata}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
      onResetParameter={(name) => paramsStore.discardStagedEdit(name)}
    />
  </SetupSectionCard>

  <SetupSectionCard
    icon={Crosshair}
    title="Channel calibration and deadzone"
    description="Preview and stage per-channel ArduPilot receiver endpoint, trim, deadzone, and reversal parameters."
    surface="elevated"
  >
    <RcCalibrationEditor
      {itemIndex}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
      onResetParameter={(name) => paramsStore.discardStagedEdit(name)}
    />
  </SetupSectionCard>

  <SetupSectionCard
    icon={MoveVertical}
    title="AltHold throttle / climb response"
    description="Preview and stage Copter throttle-command deadband, climb limits, and vertical response feel."
    surface="elevated"
  >
    <CopterThrottleClimbResponseEditor
      {itemIndex}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
    />
  </SetupSectionCard>

  <SetupSectionCard
    icon={Gauge}
    title="Angle-mode tilt envelope"
    description="Preview and stage Copter roll / pitch target-tilt caps separately from rate curves."
    surface="elevated"
  >
    <CopterAngleModeTiltEditor
      {itemIndex}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
    />
  </SetupSectionCard>

  <SetupSectionCard
    icon={SlidersHorizontal}
    title="Rate curves"
    description="Preview and stage native ArduPilot stick-to-rate parameters for the detected vehicle model."
    surface="elevated"
  >
    <RateCurveEditor
      {itemIndex}
      stagedEdits={params.stagedEdits}
      channels={view.rcReceiver.channels}
      disabled={view.checkpoint.blocksActions}
      onStageParameter={(item, value) => paramsStore.stageParameterEdit(item, value)}
    />
  </SetupSectionCard>

  <SetupGuideCard title="Receiver mapping check" description="Use the live channel monitor before changing mapping.">
    <p>Move one stick at a time, confirm the changing PWM channel, then stage the matching common axes and any available Sub axes.</p>
  </SetupGuideCard>
  {/snippet}
</SetupSectionShell>

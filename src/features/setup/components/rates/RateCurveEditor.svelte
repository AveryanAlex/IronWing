<script lang="ts">
import { SlidersHorizontal } from "lucide-svelte";

import { Badge, EmptyState, HelperText, SegmentedControl } from "../../../../components/ui";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  clampParameterDraft,
  discoverRateCurveModels,
  type RateCurveModel,
  type RateCurveParameterControl,
} from "../../../../lib/setup/rate-curve-adapters";
import { formatRateValue, interpolateRateCurve } from "../../../../lib/setup/rate-curves";
import { resolveRcStickMarker, type RcChannelSample } from "../../../../lib/setup/rc-input-normalization";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";
import SetupNotice from "../../shared/SetupNotice.svelte";
import RateAxisCard from "./RateAxisCard.svelte";
import RateParameterPreview from "./RateParameterPreview.svelte";

type StagedEdit = { nextValue: number };

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  stagedEdits: Record<string, StagedEdit | undefined>;
  channels: RcChannelSample[];
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
};

let {
  itemIndex,
  stagedEdits,
  channels,
  disabled = false,
  onStageParameter,
}: Props = $props();

let activeModelId = $state<string | null>(null);
let draftOverrides = $state<Record<string, number>>({});

function resolveValue(name: string): number | null {
  const item = itemIndex.get(name);
  const value = draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? item?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDraftValue(name: string, item: ParameterItemModel): number {
  return draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? item.value;
}

let models = $derived(discoverRateCurveModels({ itemIndex, getDraftValue }));
let activeModel = $derived(resolveActiveModel(models, activeModelId));
let modelOptions = $derived(models.map((model) => ({
  value: model.id,
  label: model.shortLabel,
  testId: `${setupWorkspaceTestIds.rcRatesType}-${model.id}`,
})));
let activeControls = $derived(activeModel ? uniqueControls(activeModel) : []);

function resolveActiveModel(models: RateCurveModel[], requestedId: string | null): RateCurveModel | null {
  return models.find((model) => model.id === requestedId) ?? models[0] ?? null;
}

function uniqueControls(model: RateCurveModel): RateCurveParameterControl[] {
  const controls: RateCurveParameterControl[] = [];
  for (const axis of model.axes) {
    for (const control of axis.controls) {
      if (!controls.some((entry) => entry.name === control.name)) {
        controls.push(control);
      }
    }
  }

  return controls;
}

function updateControl(name: string, value: number) {
  const item = itemIndex.get(name);
  if (!item || disabled) {
    return;
  }

  draftOverrides = {
    ...draftOverrides,
    [name]: clampParameterDraft(item, value),
  };
}

function resetDraft() {
  draftOverrides = {};
}

function stageDraft() {
  if (!activeModel || disabled) {
    return;
  }

  for (const control of activeControls) {
    if (!control.changed || control.readOnly) {
      continue;
    }

    onStageParameter(control.item, control.draftValue);
  }
}

function buildMarker(axis: RateCurveModel["axes"][number]) {
  if (!axis.rcInput) {
    return null;
  }

  const marker = resolveRcStickMarker({
    role: axis.rcInput.role,
    mode: axis.rcInput.mode,
    channels,
    itemIndex,
    resolveValue,
  });
  if (!marker) {
    return null;
  }

  const rateDegS = interpolateRateCurve(axis.draftPoints, marker.stick);
  if (rateDegS == null) {
    return null;
  }

  return {
    ...marker,
    rateDegS,
  };
}

function formatMarkerSummary(axis: RateCurveModel["axes"][number], marker: ReturnType<typeof buildMarker>): string {
  if (!marker) {
    return "Live stick unavailable";
  }

  return `CH${marker.channel} ${Math.round(marker.pwm)}µs · stick ${Math.round(marker.stick * 100)}% · ${formatRateValue(marker.rateDegS, axis.unit)}${marker.stale ? " · stale" : ""}`;
}

</script>

{#if !activeModel}
  <EmptyState
    title="No native rate model detected"
    description="This firmware did not expose a known ArduPilot Acro or steering-rate parameter set. The regular parameter list remains available for manual edits."
    testId={setupWorkspaceTestIds.rcRatesUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcRatesCard}>
    <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={16} class="text-accent" aria-hidden="true" />
          <p class="text-sm font-semibold text-text-primary">Native ArduPilot rate model</p>
          <Badge variant="accent" size="sm" case="normal" shape="pill">{activeModel.label}</Badge>
        </div>
        <HelperText class="mt-2">
          {activeModel.description}
        </HelperText>
      </div>

      {#if modelOptions.length > 1}
        <SegmentedControl
          value={activeModel.id}
          options={modelOptions}
          ariaLabel="Select native rate model"
          disabled={disabled}
          size="sm"
          testId={setupWorkspaceTestIds.rcRatesType}
          onValueChange={(value) => {
            activeModelId = value;
          }}
        />
      {/if}
    </div>

    {#if activeModel.notices.length > 0}
      <div class="space-y-2">
        {#each activeModel.notices as notice (notice.id)}
          <SetupNotice tone={notice.tone} testId={`${setupWorkspaceTestIds.rcRatesWarningPrefix}-${notice.id}`}>
            {notice.text}
          </SetupNotice>
        {/each}
      </div>
    {/if}

    <div class="grid min-w-0 gap-4">
      <div class="grid min-w-0 gap-3">
        {#each activeModel.axes as axis (axis.id)}
          {@const marker = buildMarker(axis)}
          {@const markerSummary = formatMarkerSummary(axis, marker)}
          <RateAxisCard
            {axis}
            {marker}
            {markerSummary}
            {disabled}
            graphTestId={`${setupWorkspaceTestIds.rcRatesGraphPrefix}-${axis.id}`}
            markerTestId={`${setupWorkspaceTestIds.rcRatesMarkerPrefix}-${axis.id}`}
            inputTestIdPrefix={`${setupWorkspaceTestIds.rcRatesInputPrefix}-${axis.id}`}
            onChange={updateControl}
          />
        {/each}
      </div>

      <RateParameterPreview
        controls={activeControls}
        {disabled}
        stageTestId={setupWorkspaceTestIds.rcRatesStage}
        resetTestId={setupWorkspaceTestIds.rcRatesReset}
        onStage={stageDraft}
        onReset={resetDraft}
      />
    </div>
  </div>
{/if}

<script lang="ts">
import { RotateCcw, Search, SlidersHorizontal } from "lucide-svelte";

import { Badge, Button, EmptyState, HelperText, Input, MonoValue, NativeSelect, NumberInput, SelectableCard, StagedBadge } from "../../../components/ui";
import type { ParamMetadataMap } from "../../../param-metadata";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  clampRcOptionDraftValue,
  discoverRcOptionAssignments,
  filterRcFunctionOptions,
  normalizeRcFunctionOptions,
  preserveSelectedRcFunctionOption,
  resolveRcFunctionOptionLabel,
  type RcOptionAssignment,
  type RcOptionStagedEdits,
} from "../../../lib/setup/rc-option-assignment";
import type { RcChannelSample } from "../../../lib/setup/rc-input-normalization";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  metadata: ParamMetadataMap | null;
  stagedEdits: RcOptionStagedEdits;
  channels: RcChannelSample[];
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
  onResetParameter?: (name: string) => void;
};

let {
  itemIndex,
  metadata,
  stagedEdits,
  channels,
  disabled = false,
  onStageParameter,
  onResetParameter,
}: Props = $props();

let selectedChannelNumber = $state<number | null>(null);
let search = $state("");
let draftOverrides = $state<Record<string, string>>({});

let assignments = $derived(discoverRcOptionAssignments(itemIndex, stagedEdits, channels));
let selectedAssignment = $derived(assignments.find((assignment) => assignment.channel === selectedChannelNumber) ?? assignments[0] ?? null);
let selectedOptions = $derived(normalizeRcFunctionOptions(selectedAssignment ? metadata?.get(selectedAssignment.name)?.values : undefined));
let selectedDraftText = $derived(selectedAssignment ? resolveDraftText(selectedAssignment) : "");
let selectedDraftNumber = $derived(resolveDraftNumber(selectedDraftText));
let selectedStageValue = $derived.by(() => {
  if (!selectedAssignment || selectedDraftNumber === null) {
    return null;
  }

  return selectedOptions.length === 0 ? clampRcOptionDraftValue(selectedAssignment.item, selectedDraftNumber) : selectedDraftNumber;
});
let filteredOptions = $derived(filterRcFunctionOptions(selectedOptions, search));
let pickerOptions = $derived(
  preserveSelectedRcFunctionOption(filteredOptions, selectedOptions, selectedDraftNumber).map((option) => ({
    value: String(option.code),
    label: `${formatParamValue(option.code)} · ${option.label}${option.preserved ? " (selected; hidden by search)" : ""}`,
  })),
);
let hasDraftOverride = $derived(Boolean(selectedAssignment && Object.prototype.hasOwnProperty.call(draftOverrides, selectedAssignment.name)));
let draftAdjusted = $derived(selectedDraftNumber !== null && selectedStageValue !== null && selectedDraftNumber !== selectedStageValue);
let stageDisabled = $derived(
  disabled
  || !selectedAssignment
  || selectedAssignment.item.readOnly
  || selectedStageValue === null
  || sameParameterValue(selectedStageValue, selectedAssignment.value, selectedAssignment.item.increment),
);
let resetDisabled = $derived(disabled || !selectedAssignment || (!hasDraftOverride && !selectedAssignment.staged));

function resolveDraftText(assignment: RcOptionAssignment): string {
  return draftOverrides[assignment.name] ?? formatParamValue(assignment.value, assignment.item.increment);
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameParameterValue(left: number, right: number, increment: number | null): boolean {
  return Math.abs(left - right) <= Math.max(1e-6, (increment ?? 1) * 0.001);
}

function setDraft(value: string) {
  if (!selectedAssignment || disabled || selectedAssignment.item.readOnly) {
    return;
  }

  draftOverrides = { ...draftOverrides, [selectedAssignment.name]: value };
}

function selectChannel(channel: number) {
  selectedChannelNumber = channel;
  search = "";
}

function selectPickerOption(event: Event) {
  setDraft((event.currentTarget as HTMLSelectElement).value);
}

function updateNumericDraft(event: Event) {
  setDraft((event.currentTarget as HTMLInputElement).value);
}

function stageDraft() {
  if (!selectedAssignment || stageDisabled || selectedStageValue === null) {
    return;
  }

  onStageParameter(selectedAssignment.item, selectedStageValue);
  draftOverrides = { ...draftOverrides, [selectedAssignment.name]: formatParamValue(selectedStageValue, selectedAssignment.item.increment) };
}

function resetDraft() {
  if (!selectedAssignment || resetDisabled) {
    return;
  }

  draftOverrides = Object.fromEntries(Object.entries(draftOverrides).filter(([name]) => name !== selectedAssignment.name));
  if (selectedAssignment.staged) {
    onResetParameter?.(selectedAssignment.name);
  }
}

function assignmentLabel(assignment: RcOptionAssignment): string {
  const options = normalizeRcFunctionOptions(metadata?.get(assignment.name)?.values);
  const label = resolveRcFunctionOptionLabel(options, assignment.value);
  return label.startsWith("Raw assignment ") ? label : `${formatParamValue(assignment.value)} · ${label}`;
}

function formatPwm(assignment: RcOptionAssignment): string {
  return assignment.liveSample ? `${formatParamValue(assignment.liveSample.pwm, 1)}µs` : "PWM unavailable";
}

function numericMetadataText(item: ParameterItemModel): string {
  const range = item.range ? `${formatParamValue(item.range.min, item.increment)}–${formatParamValue(item.range.max, item.increment)}` : "range unavailable";
  return `${range} · step ${formatParamValue(item.increment ?? 1, item.increment ?? 1)}`;
}
</script>

{#if assignments.length === 0}
  <EmptyState
    title="Auxiliary channel assignments unavailable"
    description="This firmware did not expose any RC1_OPTION…RC16_OPTION parameters."
    testId={setupWorkspaceTestIds.rcFunctionsUnavailable}
  />
{:else if selectedAssignment}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcFunctionsCard}>
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:items-start">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={16} class="text-accent" aria-hidden="true" />
          <p class="text-sm font-semibold text-text-primary">Auxiliary RC channel function assignments</p>
        </div>
        <HelperText class="mt-2">
          Available functions are firmware-specific. RCx_OPTION typically assigns auxiliary switches or functions, but not every option is a switch.
        </HelperText>
      </div>

      <div>
        <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rc-option-assignment-channel">Selected channel</label>
        <NativeSelect
          id="rc-option-assignment-channel"
          value={String(selectedAssignment.channel)}
          options={assignments.map((assignment) => ({ value: String(assignment.channel), label: `CH${assignment.channel} · ${assignmentLabel(assignment)}` }))}
          testId={setupWorkspaceTestIds.rcFunctionsSelect}
          onchange={(event) => selectChannel(Number((event.currentTarget as HTMLSelectElement).value))}
        />
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Auxiliary RC channel assignment summary">
      {#each assignments as assignment (assignment.name)}
        <SelectableCard
          density="compact"
          selected={assignment.channel === selectedAssignment.channel}
          ariaLabel={`Select CH${assignment.channel} auxiliary assignment`}
          class="min-h-11"
          testId={`${setupWorkspaceTestIds.rcFunctionsChannelPrefix}-${assignment.channel}`}
          onSelect={() => selectChannel(assignment.channel)}
        >
          <span class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-semibold text-text-primary">CH{assignment.channel}</span>
            <span class="flex flex-wrap items-center gap-1">
              {#if assignment.staged}
                <StagedBadge name={assignment.name} />
              {/if}
              {#if assignment.duplicateChannels.length > 0}
                <Badge variant="warning" size="xs" case="normal" testId={`${setupWorkspaceTestIds.rcFunctionsDuplicatePrefix}-${assignment.channel}`}>duplicate</Badge>
              {/if}
            </span>
          </span>
          <span class="mt-1 block truncate text-xs text-text-secondary">{assignmentLabel(assignment)}</span>
          <span class="mt-1 flex flex-wrap items-center gap-1 text-xs text-text-muted" data-testid={`${setupWorkspaceTestIds.rcFunctionsPwmPrefix}-${assignment.channel}`}>
            {formatPwm(assignment)}
            {#if assignment.liveSample?.stale}
              <Badge variant="muted" size="xs" case="normal">stale</Badge>
            {/if}
          </span>
        </SelectableCard>
      {/each}
    </div>

    <div class="grid gap-3 rounded-lg border border-border bg-bg-primary/70 p-3">
      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-text-primary">CH{selectedAssignment.channel} function</p>
          <p class="mt-1 text-xs text-text-secondary">Stage or reset this selected channel explicitly. Duplicate enabled assignments stay allowed for intentional configurations.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#if selectedAssignment.item.readOnly}
            <Badge variant="muted" size="sm" case="normal">Read only</Badge>
          {/if}
          {#if selectedAssignment.duplicateChannels.length > 0}
            <Badge variant="warning" size="sm" case="normal">Also assigned on CH{selectedAssignment.duplicateChannels.filter((channel) => channel !== selectedAssignment.channel).join(", CH")}</Badge>
          {/if}
          <MonoValue size="xs" tone="muted">{selectedAssignment.name}</MonoValue>
        </div>
      </div>

      {#if selectedOptions.length > 0}
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rc-option-assignment-search">Search functions</label>
            <Input
              id="rc-option-assignment-search"
              type="search"
              bind:value={search}
              placeholder="Filter by label or code"
              disabled={disabled || selectedAssignment.item.readOnly}
              testId={setupWorkspaceTestIds.rcFunctionsSearch}
            >
              {#snippet left()}<Search size={16} aria-hidden="true" />{/snippet}
            </Input>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rc-option-assignment-picker">Function</label>
            <NativeSelect
              id="rc-option-assignment-picker"
              value={selectedDraftText}
              options={pickerOptions}
              disabled={disabled || selectedAssignment.item.readOnly}
              testId={setupWorkspaceTestIds.rcFunctionsPicker}
              onchange={selectPickerOption}
            />
          </div>
        </div>
        {#if filteredOptions.length === 0}
          <HelperText>No metadata options match this search. The selected assignment remains visible until you choose a different match.</HelperText>
        {/if}
      {:else}
        <div>
          <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rc-option-assignment-numeric">Raw numeric assignment</label>
          <NumberInput
            id="rc-option-assignment-numeric"
            value={selectedDraftNumber ?? undefined}
            min={selectedAssignment.item.range?.min}
            max={selectedAssignment.item.range?.max}
            step={selectedAssignment.item.increment ?? 1}
            disabled={disabled || selectedAssignment.item.readOnly}
            testId={setupWorkspaceTestIds.rcFunctionsNumeric}
            oninput={updateNumericDraft}
            onchange={updateNumericDraft}
          />
          <HelperText class="mt-2">
            Enum labels are unavailable for this parameter. Current raw assignment: {formatParamValue(selectedAssignment.value, selectedAssignment.item.increment)} · metadata {numericMetadataText(selectedAssignment.item)}.
          </HelperText>
          {#if draftAdjusted && selectedStageValue !== null}
            <HelperText class="mt-1">Staging will use {formatParamValue(selectedStageValue, selectedAssignment.item.increment)} after applying metadata range and increment.</HelperText>
          {/if}
        </div>
      {/if}

      <div class="flex flex-wrap gap-2">
        <Button disabled={stageDisabled} onclick={stageDraft} testId={setupWorkspaceTestIds.rcFunctionsStage}>Stage assignment</Button>
        <Button tone="neutral" variant="outline" disabled={resetDisabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcFunctionsReset}>
          <RotateCcw size={16} aria-hidden="true" />
          Reset selected
        </Button>
      </div>
    </div>
  </div>
{/if}

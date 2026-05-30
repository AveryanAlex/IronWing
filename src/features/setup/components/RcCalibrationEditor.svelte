<script lang="ts">
import { Crosshair, RotateCcw } from "lucide-svelte";

import { Badge, Button, Card, EmptyState, Eyebrow, HelperText, MonoValue, NativeSelect, NumberInput, Switch } from "../../../components/ui";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  calculateRcCalibrationRange,
  clampRcCalibrationDraftValue,
  discoverRcCalibrationChannels,
  rcCalibrationParamName,
  resolveRcCalibrationValues,
  type RcCalibrationNumericParamKey,
  validateRcCalibrationDraft,
} from "../../../lib/setup/rc-calibration-editor";
import type { RcChannelSample } from "../../../lib/setup/rc-input-normalization";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupNotice from "../shared/SetupNotice.svelte";

type StagedEdit = { nextValue: number };

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  stagedEdits: Record<string, StagedEdit | undefined>;
  channels: RcChannelSample[];
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
  onResetParameter?: (name: string) => void;
};

type NumericSpec = {
  key: RcCalibrationNumericParamKey;
  label: string;
  description: string;
};

type NumericControl = NumericSpec & {
  item: ParameterItemModel;
  currentValue: number;
  draftValue: number;
  step: number;
  changed: boolean;
  inRange: boolean;
};

const NUMERIC_SPECS: NumericSpec[] = [
  { key: "min", label: "Minimum endpoint", description: "Lowest PWM observed at full travel." },
  { key: "trim", label: "Trim / center", description: "Neutral PWM used as the normalized-input center." },
  { key: "max", label: "Maximum endpoint", description: "Highest PWM observed at full travel." },
  { key: "deadZone", label: "Deadzone", description: "PWM width on each side of trim treated as neutral." },
];

let {
  itemIndex,
  stagedEdits,
  channels,
  disabled = false,
  onStageParameter,
  onResetParameter,
}: Props = $props();

let selectedChannelNumber = $state<number | null>(null);
let draftOverrides = $state<Record<string, number>>({});

function resolveValue(name: string): number | null {
  const value = draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? itemIndex.get(name)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

let availableChannels = $derived(discoverRcCalibrationChannels(itemIndex, resolveValue));
let selectedChannel = $derived(availableChannels.find((channel) => channel.channel === selectedChannelNumber) ?? availableChannels[0] ?? null);
let channelOptions = $derived(availableChannels.map((channel) => ({ value: String(channel.channel), label: channel.optionLabel })));
let calibrationValues = $derived(selectedChannel ? resolveRcCalibrationValues(selectedChannel.channel, itemIndex, resolveValue) : null);
let validation = $derived(calibrationValues ? validateRcCalibrationDraft(calibrationValues) : { valid: false, messages: [] });
let liveSample = $derived(selectedChannel ? channels.find((sample) => sample.channel === selectedChannel.channel && Number.isFinite(sample.pwm)) ?? null : null);
let freshLiveSample = $derived(liveSample?.stale === true ? null : liveSample);
let range = $derived(calibrationValues ? calculateRcCalibrationRange(calibrationValues, liveSample?.pwm ?? null) : null);
let numericControls = $derived.by(() => {
  if (!selectedChannel) {
    return [];
  }

  return NUMERIC_SPECS.flatMap((spec): NumericControl[] => {
    const item = itemIndex.get(rcCalibrationParamName(selectedChannel.channel, spec.key));
    if (!item) {
      return [];
    }

    const draftValue = resolveValue(item.name) ?? item.value;
    return [{
      ...spec,
      item,
      currentValue: item.value,
      draftValue,
      step: item.increment ?? 1,
      changed: !sameParameterValue(draftValue, item.value, item.increment),
      inRange: !item.range || (draftValue >= item.range.min && draftValue <= item.range.max),
    }];
  });
});
let reversedItem = $derived(selectedChannel ? itemIndex.get(rcCalibrationParamName(selectedChannel.channel, "reversed")) ?? null : null);
let reversedValue = $derived(calibrationValues?.reversed ?? false);
let reversedChanged = $derived(Boolean(reversedItem && reversedValue !== (reversedItem.value >= 0.5)));
let changedControls = $derived(numericControls.filter((control) => control.changed));
let missingLabels = $derived(NUMERIC_SPECS.filter((spec) => !numericControls.some((control) => control.key === spec.key)).map((spec) => spec.label));
let rangeMessages = $derived(numericControls.filter((control) => !control.inRange).map((control) => `${control.item.name} must stay within its metadata range.`));
let stageDisabled = $derived(disabled || !validation.valid || rangeMessages.length > 0 || (changedControls.length === 0 && !reversedChanged));

function sameParameterValue(left: number, right: number, increment: number | null): boolean {
  return Math.abs(left - right) <= Math.max(1e-6, (increment ?? 1) * 0.001);
}

function selectChannel(event: Event) {
  const nextValue = Number((event.currentTarget as HTMLSelectElement).value);
  if (Number.isInteger(nextValue)) {
    selectedChannelNumber = nextValue;
  }
}

function updateControl(control: NumericControl, value: number) {
  if (disabled || control.item.readOnly || !Number.isFinite(value)) {
    return;
  }

  draftOverrides = {
    ...draftOverrides,
    [control.item.name]: clampRcCalibrationDraftValue(control.item, value),
  };
}

function handleNumberInput(control: NumericControl, event: Event) {
  updateControl(control, Number((event.currentTarget as HTMLInputElement).value));
}

function captureLive(control: NumericControl) {
  if (!freshLiveSample || control.key === "deadZone") {
    return;
  }

  updateControl(control, freshLiveSample.pwm);
}

function updateReversed(checked: boolean) {
  if (!reversedItem || disabled || reversedItem.readOnly) {
    return;
  }

  draftOverrides = { ...draftOverrides, [reversedItem.name]: checked ? 1 : 0 };
}

function stageDraft() {
  if (stageDisabled) {
    return;
  }

  for (const control of changedControls) {
    if (!control.item.readOnly) {
      onStageParameter(control.item, control.draftValue);
    }
  }

  if (reversedItem && reversedChanged && !reversedItem.readOnly) {
    onStageParameter(reversedItem, reversedValue ? 1 : 0);
  }
}

function resetDraft() {
  if (!selectedChannel || disabled) {
    return;
  }

  const names = [...NUMERIC_SPECS.map((spec) => rcCalibrationParamName(selectedChannel.channel, spec.key)), rcCalibrationParamName(selectedChannel.channel, "reversed")];
  draftOverrides = Object.fromEntries(Object.entries(draftOverrides).filter(([name]) => !names.includes(name)));
  for (const name of names) {
    if (stagedEdits[name]) {
      onResetParameter?.(name);
    }
  }
}

function formatPwm(value: number): string {
  return `${formatParamValue(value, 1)}µs`;
}

function formatMetadata(control: NumericControl): string {
  const rangeText = control.item.range ? `${formatParamValue(control.item.range.min, control.step)}–${formatParamValue(control.item.range.max, control.step)}` : "firmware range unavailable";
  return `${control.item.name} · ${rangeText} · step ${formatParamValue(control.step, control.step)}`;
}
</script>

{#snippet parameterControl(control: NumericControl)}
  <div class="grid min-w-0 gap-3 rounded-lg border border-border bg-bg-primary/70 p-3">
    <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <label class="text-sm font-medium text-text-primary" for={`rc-calibration-${control.item.name}`}>{control.label}</label>
        <p class="mt-1 text-xs text-text-secondary">{control.description}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if control.item.readOnly}
          <Badge variant="muted" size="sm" case="normal" shape="pill">Read only</Badge>
        {/if}
        <MonoValue size="xs" tone="muted">{control.item.name}</MonoValue>
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <NumberInput
        id={`rc-calibration-${control.item.name}`}
        value={control.draftValue}
        min={control.item.range?.min}
        max={control.item.range?.max}
        step={control.step}
        unit="µs"
        invalid={!control.inRange}
        disabled={disabled || control.item.readOnly}
        testId={`${setupWorkspaceTestIds.rcCalibrationInputPrefix}-${control.item.name}`}
        oninput={(event) => handleNumberInput(control, event)}
        onchange={(event) => handleNumberInput(control, event)}
      />
      {#if control.key !== "deadZone"}
        <Button
          size="default"
          tone="neutral"
          variant="outline"
          disabled={disabled || control.item.readOnly || !freshLiveSample}
          onclick={() => captureLive(control)}
          testId={`${setupWorkspaceTestIds.rcCalibrationCapturePrefix}-${control.item.name}`}
        >
          Capture live
        </Button>
      {/if}
    </div>

    <p class="text-xs text-text-muted">{formatMetadata(control)}</p>
  </div>
{/snippet}

{#if !selectedChannel || !calibrationValues}
  <EmptyState
    title="RC calibration parameters unavailable"
    description="This firmware did not expose any RC1..RC16 endpoint, trim, deadzone, or reversal parameters."
    testId={setupWorkspaceTestIds.rcCalibrationUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcCalibrationCard}>
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] lg:items-start">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <Crosshair size={16} class="text-accent" aria-hidden="true" />
          <p class="text-sm font-semibold text-text-primary">Per-channel normalized input calibration</p>
          {#if selectedChannel.roleLabel}
            <Badge variant="accent" size="sm" case="normal" shape="pill">{selectedChannel.roleLabel}</Badge>
          {/if}
        </div>
        <HelperText class="mt-2">
          Calibration changes how ArduPilot turns receiver PWM into normalized inputs. The live markers in the control editors below use these endpoint, trim, deadzone, and reversal values.
        </HelperText>
      </div>

      <div>
        <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rc-calibration-channel">Channel</label>
        <NativeSelect
          id="rc-calibration-channel"
          class="mt-2 w-full"
          value={String(selectedChannel.channel)}
          options={channelOptions}
          onchange={selectChannel}
          testId={setupWorkspaceTestIds.rcCalibrationSelect}
        />
      </div>
    </div>

    {#if range}
      <div
        class="rounded-lg border border-border bg-bg-secondary p-3"
        role="img"
        aria-label={`CH${selectedChannel.channel} calibration strip: minimum ${formatPwm(calibrationValues.min)}, trim ${formatPwm(calibrationValues.trim)}, maximum ${formatPwm(calibrationValues.max)}, deadzone ${formatPwm(calibrationValues.deadZone)}${liveSample ? `, ${liveSample.stale ? "stale" : "live"} marker ${formatPwm(liveSample.pwm)}` : ", no live marker"}`}
        data-testid={setupWorkspaceTestIds.rcCalibrationStrip}
      >
        <div class="relative mx-3 h-16">
          <div class="absolute inset-x-0 top-7 h-2 rounded-full border border-border-light bg-bg-input"></div>
          <div
            class="absolute top-7 h-2 rounded-full border border-accent/40 bg-accent/25"
            style:left={`${range.deadZoneStartPct}%`}
            style:width={`${range.deadZoneEndPct - range.deadZoneStartPct}%`}
          ></div>
          <div class="absolute top-5 h-6 w-0.5 bg-text-secondary" style:left="0%"></div>
          <div class="absolute top-4 h-8 w-0.5 bg-accent" style:left={`${range.trimPct}%`}></div>
          <div class="absolute top-5 h-6 w-0.5 bg-text-secondary" style:left="100%"></div>
          {#if range.livePct !== null}
            <div
              class="absolute top-1 -translate-x-1/2 text-center"
              style:left={`${range.livePct}%`}
              data-testid={setupWorkspaceTestIds.rcCalibrationMarker}
            >
              <span class="block text-xs font-semibold {liveSample?.stale ? 'text-warning' : 'text-accent'}">{Math.round(liveSample?.pwm ?? 0)}</span>
              <span class="mx-auto mt-1 block size-3 rounded-full border-2 border-bg-primary {liveSample?.stale ? 'bg-warning' : 'bg-accent'}"></span>
            </div>
          {/if}
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs text-text-secondary">
          <span><strong class="text-text-primary">MIN</strong> {formatPwm(calibrationValues.min)}</span>
          <span class="text-center"><strong class="text-accent">TRIM</strong> {formatPwm(calibrationValues.trim)}<br />DZ ±{formatPwm(calibrationValues.deadZone)}</span>
          <span class="text-right"><strong class="text-text-primary">MAX</strong> {formatPwm(calibrationValues.max)}</span>
        </div>
        <p class="mt-3 text-xs text-text-muted">
          {liveSample ? `${liveSample.stale ? "Last retained" : "Live"} CH${selectedChannel.channel} sample: ${formatPwm(liveSample.pwm)}${liveSample.stale ? " · stale samples cannot be captured" : ""}` : `No live CH${selectedChannel.channel} PWM sample is available.`}
        </p>
      </div>
    {/if}

    {#if validation.messages.length > 0 || rangeMessages.length > 0}
      <div class="space-y-2">
        {#each [...validation.messages, ...rangeMessages] as message, index (`${index}-${message}`)}
          <SetupNotice tone="danger" testId={`${setupWorkspaceTestIds.rcCalibrationWarningPrefix}-${index}`}>{message}</SetupNotice>
        {/each}
      </div>
    {/if}

    {#if missingLabels.length > 0}
      <HelperText>
        This firmware omits {missingLabels.join(", ")} for CH{selectedChannel.channel}; the preview uses ArduPilot-compatible fallback values for missing fields and only exposes available parameters for editing.
      </HelperText>
    {/if}

    <div class="grid gap-3 md:grid-cols-2">
      {#each numericControls as control (control.item.name)}
        {@render parameterControl(control)}
      {/each}
    </div>

    {#if reversedItem}
      <div class="rounded-lg border border-border bg-bg-primary/70 p-3">
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <Switch
            checked={reversedValue}
            disabled={disabled || reversedItem.readOnly}
            label="Reverse normalized input"
            description="Invert this channel after endpoint, trim, and deadzone normalization."
            onCheckedChange={updateReversed}
            testId={`${setupWorkspaceTestIds.rcCalibrationInputPrefix}-${reversedItem.name}`}
          />
          <div class="flex flex-wrap items-center gap-2">
            {#if reversedItem.readOnly}
              <Badge variant="muted" size="sm" case="normal" shape="pill">Read only</Badge>
            {/if}
            <MonoValue size="xs" tone="muted">{reversedItem.name}</MonoValue>
          </div>
        </div>
      </div>
    {/if}

    <Card.Root surface="default" density="compact" tone="info" appearance="solid">
      <div class="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <Eyebrow>Staged native parameters</Eyebrow>
          <p class="mt-1 text-sm text-text-secondary">
            {changedControls.length + Number(reversedChanged) === 0
              ? "No RC calibration changes in the draft."
              : `${changedControls.length + Number(reversedChanged)} parameter${changedControls.length + Number(reversedChanged) === 1 ? "" : "s"} will be staged for review.`}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" tone="accent" variant="soft" disabled={stageDisabled} onclick={stageDraft} testId={setupWorkspaceTestIds.rcCalibrationStage}>
            Stage calibration
          </Button>
          <Button size="sm" tone="neutral" variant="ghost" disabled={disabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcCalibrationReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset channel
          </Button>
        </div>
      </div>
    </Card.Root>
  </div>
{/if}

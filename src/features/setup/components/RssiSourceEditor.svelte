<script lang="ts">
import { RadioTower, RotateCcw } from "lucide-svelte";

import { Badge, Button, Card, EmptyState, Eyebrow, HelperText, MonoValue, NativeSelect, NumberInput, StagedBadge } from "../../../components/ui";
import type { ParamMetadataMap } from "../../../param-metadata";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import type { RcChannelSample } from "../../../lib/setup/rc-input-normalization";
import {
  clampRssiDraftValue,
  requiredRssiSourceParameterNames,
  resolveRssiChannelPwm,
  resolveRssiSourceOptions,
  resolveRssiSourceType,
  rssiCalibrationParameterNames,
  RSSI_TYPE_PARAM_NAME,
  scaleRssiPwmToPercent,
  type RssiStagedEdits,
} from "../../../lib/setup/rssi-source-editor";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupNotice from "../shared/SetupNotice.svelte";

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  metadata: ParamMetadataMap | null;
  stagedEdits: RssiStagedEdits;
  channels: RcChannelSample[];
  rssiText: string;
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
  onResetParameter?: (name: string) => void;
};

type SettingSpec = {
  label: string;
  description: string;
  fallbackUnit?: string;
};

type SettingControl = SettingSpec & {
  item: ParameterItemModel;
  draftValue: number;
  step: number;
  unit?: string;
  changed: boolean;
};

const SETTING_SPECS: Record<string, SettingSpec> = {
  RSSI_ANA_PIN: {
    label: "Input pin",
    description: "Analog pin source, or PWM input pin when that source is selected.",
  },
  RSSI_PIN_LOW: {
    label: "Analog low calibration",
    description: "Analog-pin reading that maps to zero percent signal strength.",
  },
  RSSI_PIN_HIGH: {
    label: "Analog high calibration",
    description: "Analog-pin reading that maps to one hundred percent signal strength.",
  },
  RSSI_CHANNEL: {
    label: "RC source channel",
    description: "Receiver channel whose PWM value carries RSSI.",
  },
  RSSI_CHAN_LOW: {
    label: "PWM low calibration",
    description: "PWM input that maps to zero percent signal strength.",
    fallbackUnit: "µs",
  },
  RSSI_CHAN_HIGH: {
    label: "PWM high calibration",
    description: "PWM input that maps to one hundred percent signal strength.",
    fallbackUnit: "µs",
  },
};

const ALL_RSSI_SETTING_NAMES = Object.keys(SETTING_SPECS);

let {
  itemIndex,
  metadata,
  stagedEdits,
  channels,
  rssiText,
  disabled = false,
  onStageParameter,
  onResetParameter,
}: Props = $props();

let draftOverrides = $state<Record<string, number>>({});

function resolveValue(name: string): number | null {
  const value = draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? itemIndex.get(name)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sameParameterValue(left: number, right: number, increment: number | null): boolean {
  return Math.abs(left - right) <= Math.max(1e-6, (increment ?? 1) * 0.001);
}

function buildSettingControl(name: string): SettingControl | null {
  const item = itemIndex.get(name);
  const spec = SETTING_SPECS[name];
  if (!item || !spec) {
    return null;
  }

  const draftValue = resolveValue(name) ?? item.value;
  return {
    ...spec,
    item,
    draftValue,
    step: item.increment ?? 1,
    unit: item.units ?? spec.fallbackUnit,
    changed: !sameParameterValue(draftValue, item.value, item.increment),
  };
}

let typeItem = $derived(itemIndex.get(RSSI_TYPE_PARAM_NAME) ?? null);
let sourceValue = $derived(resolveValue(RSSI_TYPE_PARAM_NAME));
let sourceType = $derived(resolveRssiSourceType(sourceValue));
let sourceOptions = $derived(resolveRssiSourceOptions(metadata?.get(RSSI_TYPE_PARAM_NAME)?.values, sourceValue));
let requiredSettingNames = $derived(requiredRssiSourceParameterNames(sourceType));
let settingControls = $derived(requiredSettingNames.map(buildSettingControl).filter((control): control is SettingControl => control != null));
let missingSettingNames = $derived(requiredSettingNames.filter((name) => !itemIndex.has(name)));
let changedControls = $derived(settingControls.filter((control) => control.changed));
let typeChanged = $derived(Boolean(typeItem && sourceValue !== null && !sameParameterValue(sourceValue, typeItem.value, typeItem.increment)));
let typeOptionItems = $derived(sourceOptions.map((option) => ({ value: String(option.code), label: `${formatParamValue(option.code)} · ${option.label}` })));
let calibrationNames = $derived(rssiCalibrationParameterNames(sourceType));
let calibrationPreview = $derived.by(() => {
  if (!calibrationNames) {
    return null;
  }

  const low = resolveValue(calibrationNames.low);
  const high = resolveValue(calibrationNames.high);
  return low === null || high === null ? null : { low, high, equalRange: low === high, inverted: low > high };
});
let liveChannelPwm = $derived(sourceType === 2
  ? resolveRssiChannelPwm({ channelValue: resolveValue("RSSI_CHANNEL"), channels })
  : null);
let liveScalePreview = $derived(liveChannelPwm && calibrationPreview
  ? scaleRssiPwmToPercent(liveChannelPwm.pwm, calibrationPreview.low, calibrationPreview.high)
  : null);
let allEditorNames = $derived([RSSI_TYPE_PARAM_NAME, ...ALL_RSSI_SETTING_NAMES]);
let hasStagedEdits = $derived(allEditorNames.some((name) => stagedEdits[name] != null));
let stageDisabled = $derived(disabled || (!typeChanged && changedControls.length === 0));
let resetDisabled = $derived(disabled || (Object.keys(draftOverrides).length === 0 && !hasStagedEdits));

function updateDraft(item: ParameterItemModel, value: number) {
  if (disabled || item.readOnly || !Number.isFinite(value)) {
    return;
  }

  draftOverrides = { ...draftOverrides, [item.name]: clampRssiDraftValue(item, value) };
}

function updateType(event: Event) {
  if (!typeItem) {
    return;
  }

  updateDraft(typeItem, Number((event.currentTarget as HTMLSelectElement).value));
}

function updateSetting(control: SettingControl, event: Event) {
  updateDraft(control.item, Number((event.currentTarget as HTMLInputElement).value));
}

function stageDraft() {
  if (stageDisabled) {
    return;
  }

  if (typeItem && typeChanged && !typeItem.readOnly && sourceValue !== null) {
    onStageParameter(typeItem, sourceValue);
  }

  for (const control of changedControls) {
    if (!control.item.readOnly) {
      onStageParameter(control.item, control.draftValue);
    }
  }
}

function resetDraft() {
  if (resetDisabled) {
    return;
  }

  draftOverrides = {};
  for (const name of allEditorNames) {
    if (stagedEdits[name]) {
      onResetParameter?.(name);
    }
  }
}

function formatMetadata(control: SettingControl): string {
  const range = control.item.range
    ? `${formatParamValue(control.item.range.min, control.step)}–${formatParamValue(control.item.range.max, control.step)}`
    : "range unavailable";
  return `${control.item.name} · ${range} · step ${formatParamValue(control.step, control.step)}${control.unit ? ` ${control.unit}` : ""}`;
}

function sourceDescription(): string {
  switch (sourceType) {
    case 0:
      return "RSSI reporting is disabled. The vehicle may still expose a retained live RSSI status value.";
    case 2:
      return "This source uses a receiver-channel PWM sample, so the selected channel can be previewed from the live RC monitor when available.";
    case null:
      return "This firmware value is not one of the known AP_RSSI sources. No source-specific settings are assumed.";
    default:
      return "Raw samples for this RSSI source may not be available in the RC channel monitor. Use the live RSSI status value to confirm vehicle reporting.";
  }
}
</script>

{#snippet settingControl(control: SettingControl)}
  <div class="grid min-w-0 gap-3 rounded-lg border border-border bg-bg-primary/70 p-3">
    <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <label class="text-sm font-medium text-text-primary" for={`rssi-source-${control.item.name}`}>{control.label}</label>
        <p class="mt-1 text-xs text-text-secondary">{control.description}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if stagedEdits[control.item.name]}
          <StagedBadge name={control.item.name} />
        {/if}
        {#if control.item.readOnly}
          <Badge variant="muted" size="sm" case="normal" shape="pill">Read only</Badge>
        {/if}
        <MonoValue size="xs" tone="muted">{control.item.name}</MonoValue>
      </div>
    </div>

    <NumberInput
      id={`rssi-source-${control.item.name}`}
      value={control.draftValue}
      min={control.item.range?.min}
      max={control.item.range?.max}
      step={control.step}
      unit={control.unit}
      disabled={disabled || control.item.readOnly}
      testId={`${setupWorkspaceTestIds.rcRssiSourceInputPrefix}-${control.item.name}`}
      oninput={(event) => updateSetting(control, event)}
      onchange={(event) => updateSetting(control, event)}
    />
    <p class="text-xs text-text-muted">{formatMetadata(control)}</p>
  </div>
{/snippet}

{#if !typeItem}
  <EmptyState
    class="p-4"
    title="RSSI source settings unavailable"
    description="This firmware did not expose RSSI_TYPE. Live RSSI status remains visible in the receiver state card."
    testId={setupWorkspaceTestIds.rcRssiSourceUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcRssiSourceCard}>
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,20rem)] lg:items-start">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <RadioTower size={16} class="text-accent" aria-hidden="true" />
          <p class="text-sm font-semibold text-text-primary">RSSI source and calibration</p>
        </div>
        <HelperText class="mt-2">{sourceDescription()}</HelperText>
      </div>

      <div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="rssi-source-type">Source</label>
          <div class="flex flex-wrap items-center gap-2">
            {#if stagedEdits[RSSI_TYPE_PARAM_NAME]}
              <StagedBadge name={RSSI_TYPE_PARAM_NAME} />
            {/if}
            {#if typeItem.readOnly}
              <Badge variant="muted" size="sm" case="normal" shape="pill">Read only</Badge>
            {/if}
          </div>
        </div>
        <NativeSelect
          id="rssi-source-type"
          class="mt-2"
          value={sourceValue === null ? "" : String(sourceValue)}
          options={typeOptionItems}
          disabled={disabled || typeItem.readOnly}
          testId={setupWorkspaceTestIds.rcRssiSourceType}
          onchange={updateType}
        />
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-lg border border-border bg-bg-secondary p-3" data-testid={setupWorkspaceTestIds.rcRssiSourceLive}>
        <Eyebrow>Vehicle live RSSI</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{rssiText}</p>
      </div>
      {#if sourceType === 2}
        <div class="rounded-lg border border-border bg-bg-secondary p-3" data-testid={setupWorkspaceTestIds.rcRssiSourcePwm}>
          <Eyebrow>RC channel PWM preview</Eyebrow>
          {#if liveChannelPwm}
            <p class="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
              CH{liveChannelPwm.channel} · {formatParamValue(liveChannelPwm.pwm, 1)}µs
              {#if liveChannelPwm.stale}<Badge variant="muted" size="xs" case="normal">stale</Badge>{/if}
            </p>
            {#if liveScalePreview?.percent !== null && liveScalePreview?.percent !== undefined}
              <div
                class="mt-3"
                role="img"
                aria-label={`Scaled RSSI preview ${Math.round(liveScalePreview.percent)} percent`}
                data-testid={setupWorkspaceTestIds.rcRssiSourcePreview}
              >
                <div class="h-2 overflow-hidden rounded-full border border-border-light bg-bg-input">
                  <div class="h-full rounded-full bg-accent" style:width={`${liveScalePreview.percent}%`}></div>
                </div>
                <p class="mt-2 text-xs text-text-secondary">Preview {Math.round(liveScalePreview.percent)}%{liveScalePreview.clipped ? " · clipped" : ""}{liveScalePreview.inverted ? " · inverted calibration" : ""}</p>
              </div>
            {/if}
          {:else}
            <p class="mt-1 text-xs text-text-secondary">No live PWM sample is available for the selected RSSI channel.</p>
          {/if}
        </div>
      {/if}
    </div>

    {#if calibrationPreview?.equalRange}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.rcRssiSourceWarningPrefix}-equal-range`}>
        Low and high RSSI calibration are equal. Choose distinct values for meaningful scaling; intentionally inverted ranges remain supported.
      </SetupNotice>
    {:else if calibrationPreview?.inverted}
      <HelperText>Low and high RSSI calibration are intentionally inverted. Scaling and clipping remain supported.</HelperText>
    {/if}

    {#if missingSettingNames.length > 0}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.rcRssiSourceWarningPrefix}-missing-settings`}>
        This RSSI source expects {missingSettingNames.join(", ")}, but this firmware did not expose {missingSettingNames.length === 1 ? "that parameter" : "those parameters"}. Only available settings can be staged.
      </SetupNotice>
    {/if}

    {#if settingControls.length > 0}
      <div class="grid gap-3 md:grid-cols-2">
        {#each settingControls as control (control.item.name)}
          {@render settingControl(control)}
        {/each}
      </div>
    {:else if requiredSettingNames.length === 0}
      <HelperText>No source-specific RSSI settings are required for this selection.</HelperText>
    {:else}
      <HelperText>No expected source-specific RSSI settings are available to edit.</HelperText>
    {/if}

    <Card.Root surface="default" density="compact" tone="info" appearance="solid">
      <div class="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <Eyebrow>Staged native parameters</Eyebrow>
          <p class="mt-1 text-sm text-text-secondary">
            {typeChanged || changedControls.length > 0
              ? `${Number(typeChanged) + changedControls.length} RSSI parameter${Number(typeChanged) + changedControls.length === 1 ? "" : "s"} will be staged for review.`
              : "No RSSI source changes in the draft."}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" tone="accent" variant="soft" disabled={stageDisabled} onclick={stageDraft} testId={setupWorkspaceTestIds.rcRssiSourceStage}>
            Stage RSSI settings
          </Button>
          <Button size="sm" tone="neutral" variant="ghost" disabled={resetDisabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcRssiSourceReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset RSSI
          </Button>
        </div>
      </div>
    </Card.Root>
  </div>
{/if}

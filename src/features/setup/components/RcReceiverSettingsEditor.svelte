<script lang="ts">
import { RotateCcw, Settings2 } from "lucide-svelte";

import { Badge, Button, Card, Checkbox, EmptyState, Eyebrow, HelperText, NumberInput } from "../../../components/ui";
import type { ParamMetadataMap } from "../../../param-metadata";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  clampRcReceiverSettingDraftValue,
  discoverRcReceiverSettings,
  isRcReceiverBitEnabled,
  isRcReceiverSettingOutsideRange,
  resolveRcReceiverBitmaskOptions,
  resolveRcReceiverNumericConfig,
  resolveRcReceiverSettingEditState,
  toggleRcReceiverBit,
  type RcReceiverBitmaskOption,
  type RcReceiverSetting,
  type RcReceiverSettingEditState,
  type RcReceiverSettingsStagedEdits,
} from "../../../lib/setup/rc-receiver-settings-editor";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupParamEditCard from "../shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../shared/SetupParamEditGrid.svelte";

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  metadata: ParamMetadataMap | null;
  stagedEdits: RcReceiverSettingsStagedEdits;
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
  onResetParameter?: (name: string) => void;
};

type ReceiverSettingControl = RcReceiverSetting & {
  state: RcReceiverSettingEditState;
  range: { min: number; max: number } | null;
  step: number;
  unit: string | undefined;
  bitmaskOptions: RcReceiverBitmaskOption[];
  showBitmaskCheckboxes: boolean;
  outsideRange: boolean;
};

let {
  itemIndex,
  metadata,
  stagedEdits,
  disabled = false,
  onStageParameter,
  onResetParameter,
}: Props = $props();

let draftOverrides = $state<Record<string, number>>({});

function buildControl(setting: RcReceiverSetting): ReceiverSettingControl {
  const config = resolveRcReceiverNumericConfig(setting.item);
  const state = resolveRcReceiverSettingEditState(setting.item, stagedEdits, draftOverrides);
  const bitmaskOptions = setting.kind === "bitmask"
    ? resolveRcReceiverBitmaskOptions(setting.name, metadata?.get(setting.name)?.bitmask)
    : [];

  return {
    ...setting,
    state,
    range: config.range,
    step: config.increment,
    unit: setting.item.units ?? (setting.kind === "number" ? "s" : undefined),
    bitmaskOptions,
    showBitmaskCheckboxes: bitmaskOptions.length > 0 && Number.isSafeInteger(state.draftValue) && state.draftValue >= 0,
    outsideRange: isRcReceiverSettingOutsideRange(setting.item, state.draftValue),
  };
}

let settings = $derived(discoverRcReceiverSettings(itemIndex));
let controls = $derived(settings.map(buildControl));
let pendingControls = $derived(controls.filter((control) => control.state.pendingStage));
let stagedControls = $derived(controls.filter((control) => control.state.staged));
let hasLocalDrafts = $derived(controls.some((control) => control.state.locallyEdited));
let stageDisabled = $derived(disabled || pendingControls.length === 0);
let resetDisabled = $derived(disabled || (!hasLocalDrafts && stagedControls.length === 0));

function updateDraft(control: ReceiverSettingControl, value: number) {
  if (disabled || control.item.readOnly || !Number.isFinite(value)) {
    return;
  }

  draftOverrides = {
    ...draftOverrides,
    [control.name]: clampRcReceiverSettingDraftValue(control.item, value),
  };
}

function updateNumber(control: ReceiverSettingControl, event: Event) {
  updateDraft(control, (event.currentTarget as HTMLInputElement).valueAsNumber);
}

function toggleBitmaskOption(control: ReceiverSettingControl, option: RcReceiverBitmaskOption, checked: boolean) {
  updateDraft(control, toggleRcReceiverBit(control.state.draftValue, option.bit, checked));
}

function stageDraft() {
  if (stageDisabled) {
    return;
  }

  for (const control of pendingControls) {
    if (!control.item.readOnly) {
      onStageParameter(control.item, control.state.draftValue);
    }
  }
  draftOverrides = {};
}

function resetDraft() {
  if (resetDisabled) {
    return;
  }

  draftOverrides = {};
  for (const control of stagedControls) {
    onResetParameter?.(control.name);
  }
}

function formatRange(control: ReceiverSettingControl): string {
  if (!control.range) {
    return "range unavailable";
  }

  return `${formatParamValue(control.range.min, control.step)}–${formatParamValue(control.range.max, control.step)}`;
}

function rangeWarning(control: ReceiverSettingControl): string {
  if (control.name === "RC_OVERRIDE_TIME" && control.state.draftValue === -1) {
    return "RC_OVERRIDE_TIME is set to the documented -1 never-timeout value. It is preserved even though the advertised range starts at 0.";
  }

  return `${control.name} is outside the advertised ${formatRange(control)} range. The retained value is preserved until you edit this setting.`;
}
</script>

{#snippet numberControl(control: ReceiverSettingControl)}
  <NumberInput
    id={`rc-receiver-setting-${control.name}`}
    value={control.state.draftValue}
    min={control.range?.min}
    max={control.range?.max}
    step={control.step}
    unit={control.unit}
    invalid={control.outsideRange}
    disabled={disabled || control.item.readOnly}
    testId={`${setupWorkspaceTestIds.rcReceiverSettingsInputPrefix}-${control.name}`}
    oninput={(event) => updateNumber(control, event)}
    onchange={(event) => updateNumber(control, event)}
  />
{/snippet}

{#snippet bitmaskControl(control: ReceiverSettingControl)}
  {#if control.showBitmaskCheckboxes}
    <div class="grid gap-2 sm:grid-cols-2">
      {#each control.bitmaskOptions as option (option.bit)}
        <div class="rounded-md border border-border bg-bg-secondary p-3">
          <Checkbox
            id={option.bit === control.bitmaskOptions[0]?.bit ? `rc-receiver-setting-${control.name}` : undefined}
            checked={isRcReceiverBitEnabled(control.state.draftValue, option.bit)}
            disabled={disabled || control.item.readOnly}
            label={`${option.label} · bit ${option.bit}`}
            testId={`${setupWorkspaceTestIds.rcReceiverSettingsBitPrefix}-${control.name}-${option.bit}`}
            onCheckedChange={(checked) => toggleBitmaskOption(control, option, checked)}
          />
        </div>
      {/each}
    </div>
  {:else}
    <div class="grid gap-2">
      <HelperText size="xs">Bit labels are unavailable for this value. Edit the integer mask directly.</HelperText>
      {@render numberControl(control)}
    </div>
  {/if}
{/snippet}

{#snippet settingControl(control: ReceiverSettingControl)}
  {#snippet badges()}
    <Badge variant={control.level === "Advanced" ? "warning" : "muted"} size="sm" case="normal" shape="pill">{control.level}</Badge>
  {/snippet}

  {#snippet footer()}
    {#if control.outsideRange}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.rcReceiverSettingsWarningPrefix}-${control.name}`}>
        {rangeWarning(control)}
      </SetupNotice>
    {/if}
  {/snippet}

  {#if control.kind === "bitmask"}
    <SetupParamEditCard
      item={control.item}
      inputId={`rc-receiver-setting-${control.name}`}
      label={control.label}
      description={control.description}
      type="custom"
      value={control.state.draftValue}
      {disabled}
      metadata={`Integer mask ${formatParamValue(control.state.draftValue, 1)} · checkbox labels ${metadata?.get(control.name)?.bitmask?.length ? "from firmware metadata" : "from source fallback"}`}
      stagedName={control.state.staged ? control.name : undefined}
      {badges}
      {footer}
    >
      {@render bitmaskControl(control)}
      {#if control.name === "RC_PROTOCOLS"}
        <HelperText size="xs">All means broad protocol auto-detection. Specific protocol bits narrow detection only when All is cleared.</HelperText>
      {/if}
    </SetupParamEditCard>
  {:else}
    <SetupParamEditCard
      item={control.item}
      inputId={`rc-receiver-setting-${control.name}`}
      label={control.label}
      description={control.description}
      value={control.state.draftValue}
      min={control.range?.min}
      max={control.range?.max}
      step={control.step}
      unit={control.unit}
      invalid={control.outsideRange}
      {disabled}
      metadata={`${control.name} · ${formatRange(control)} · step ${formatParamValue(control.step, control.step)}${control.unit ? ` ${control.unit}` : ""}`}
      stagedName={control.state.staged ? control.name : undefined}
      inputTestId={`${setupWorkspaceTestIds.rcReceiverSettingsInputPrefix}-${control.name}`}
      {badges}
      {footer}
      onValueChange={(value) => typeof value === "number" && updateDraft(control, value)}
    />
  {/if}
{/snippet}

{#if controls.length === 0}
  <EmptyState
    class="p-4"
    title="Receiver settings unavailable"
    description="This firmware did not expose global RC protocol, option, or timeout parameters."
    testId={setupWorkspaceTestIds.rcReceiverSettingsUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcReceiverSettingsCard}>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <Settings2 size={16} class="text-accent" aria-hidden="true" />
          <p class="text-sm font-semibold text-text-primary">Global receiver settings</p>
        </div>
        <HelperText class="mt-1" size="xs">Only settings exposed by the active firmware are shown. Edits remain local until staged for review.</HelperText>
      </div>
      <Badge variant="muted" size="sm" case="normal" shape="pill">{controls.length} available</Badge>
    </div>

    <SetupParamEditGrid>
      {#each controls as control (control.name)}
        {@render settingControl(control)}
      {/each}
    </SetupParamEditGrid>

    <Card.Root surface="default" density="compact" tone="info" appearance="solid">
      <div class="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <Eyebrow>Staged native parameters</Eyebrow>
          <p class="mt-1 text-sm text-text-secondary">
            {pendingControls.length > 0
              ? `${pendingControls.length} receiver setting${pendingControls.length === 1 ? "" : "s"} will be staged for review.`
              : stagedControls.length > 0
                ? `${stagedControls.length} receiver setting${stagedControls.length === 1 ? " is" : "s are"} already staged.`
                : "No receiver setting changes in the draft."}
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" tone="accent" variant="soft" disabled={stageDisabled} onclick={stageDraft} testId={setupWorkspaceTestIds.rcReceiverSettingsStage}>
            Stage receiver settings
          </Button>
          <Button size="sm" tone="neutral" variant="ghost" disabled={resetDisabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcReceiverSettingsReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset receiver settings
          </Button>
        </div>
      </div>
    </Card.Root>
  </div>
{/if}

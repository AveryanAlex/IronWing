<script lang="ts">
import type { Snippet } from "svelte";

import {
  Badge,
  MonoValue,
  NumberInput,
  ParameterBooleanSwitch,
  RebootRequiredBadge,
  Slider,
  StagedBadge,
  Tooltip,
} from "../../../components/ui";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupParamEnumControl from "./SetupParamEnumControl.svelte";

type ControlType = "number" | "enum" | "boolean" | "custom";

type Option = {
  code: number;
  label: string;
};

type Props = {
  item: ParameterItemModel;
  inputId?: string;
  label?: string;
  description?: string | null;
  type?: ControlType;
  value?: string | number | boolean;
  options?: readonly Option[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  unitText?: string | null;
  invalid?: boolean;
  disabled?: boolean;
  offLabel?: string;
  onLabel?: string;
  metadata?: string;
  stagedName?: string;
  stagedTestId?: string;
  onUnstage?: (name: string) => void;
  class?: string;
  testId?: string;
  inputTestId?: string;
  onValueChange?: (value: string | number | boolean) => void;
  badges?: Snippet;
  children?: Snippet;
  trailingAction?: Snippet;
  footer?: Snippet;
};

let {
  item,
  inputId = `setup-param-edit-${item.name}`,
  label = item.label,
  description = item.description,
  type = "number",
  value = item.value,
  options = [],
  min = item.range?.min,
  max = item.range?.max,
  step = item.increment ?? 1,
  unit = item.units,
  unitText,
  invalid = false,
  disabled = false,
  offLabel = "Disabled",
  onLabel = "Enabled",
  metadata,
  stagedName,
  stagedTestId,
  onUnstage,
  class: className = "",
  testId,
  inputTestId,
  onValueChange,
  badges,
  children,
  trailingAction,
  footer,
}: Props = $props();

let controlDisabled = $derived(disabled || item.readOnly);
let resolvedMetadata = $derived(metadata ?? formatMetadata());
let enumValue = $derived(String(value));
let numberValue = $derived(typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : undefined);
let booleanValue = $derived(typeof value === "boolean" ? value : Number(value) !== 0);
let resolvedUnitText = $derived(unitText === undefined && unit === item.units ? item.unitText : unitText);
let hasSlider = $derived(
  type === "number"
    && typeof numberValue === "number"
    && Number.isFinite(numberValue)
    && typeof min === "number"
    && Number.isFinite(min)
    && typeof max === "number"
    && Number.isFinite(max)
    && max > min,
);

function formatMetadata(): string {
  const parts = [item.name];
  if (type === "number" && min !== undefined && max !== undefined) {
    parts.push(`${formatParamValue(min, step)}–${formatParamValue(max, step)}`);
  }
  if (type === "number" && step !== undefined) {
    parts.push(`step ${formatParamValue(step, step)}`);
  }
  return parts.join(" · ");
}

function updateNumber(event: Event) {
  const nextValue = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (Number.isFinite(nextValue)) {
    onValueChange?.(nextValue);
  }
}
</script>

{#snippet title()}
  <label class="cursor-help text-sm font-medium text-text-primary underline decoration-border-light decoration-dotted underline-offset-4" for={inputId}>
    {label}
  </label>
{/snippet}

{#snippet control()}
  {#if children}
    {@render children()}
  {:else if type === "enum"}
    <SetupParamEnumControl
      id={inputId}
      value={enumValue}
      options={[...options]}
      disabled={controlDisabled}
      testId={inputTestId}
      onChange={(nextValue) => onValueChange?.(nextValue)}
    />
  {:else if type === "boolean"}
    <ParameterBooleanSwitch
      id={inputId}
      checked={booleanValue}
      disabled={controlDisabled}
      {offLabel}
      {onLabel}
      testId={inputTestId}
      onToggle={(checked) => onValueChange?.(checked)}
    />
  {:else if hasSlider}
    <div class="setup-param-numeric-control grid min-w-0 gap-2">
      <Slider
        id={`${inputId}-slider`}
        value={numberValue}
        {min}
        {max}
        {step}
        disabled={controlDisabled}
        ariaLabel={label}
        testId={inputTestId ? `${inputTestId}-slider` : undefined}
        onValueChange={(nextValue) => onValueChange?.(nextValue)}
      />
      <NumberInput
        id={inputId}
        value={numberValue}
        {min}
        {max}
        {step}
        unit={unit ?? undefined}
        unitTooltip={resolvedUnitText}
        {invalid}
        disabled={controlDisabled}
        testId={inputTestId}
        oninput={updateNumber}
        onchange={updateNumber}
      />
    </div>
  {:else}
    <NumberInput
      id={inputId}
      value={numberValue}
      {min}
      {max}
      {step}
      unit={unit ?? undefined}
      unitTooltip={resolvedUnitText}
      {invalid}
      disabled={controlDisabled}
      testId={inputTestId}
      oninput={updateNumber}
      onchange={updateNumber}
    />
  {/if}
{/snippet}

<div class={`setup-param-edit-card grid min-w-0 gap-3 rounded-lg border border-border bg-bg-primary/70 p-3 ${className}`} data-testid={testId}>
  <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
    {#if description}
      <Tooltip description={description} align="start" clickToToggle triggerClass="min-w-0 max-w-full">
        {@render title()}
      </Tooltip>
    {:else}
      {@render title()}
    {/if}

    <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {@render badges?.()}
      {#if stagedName}
        <StagedBadge name={stagedName} {onUnstage} testId={stagedTestId} />
      {/if}
      {#if item.readOnly}
        <Badge variant="muted" size="sm" case="normal" shape="pill">Read only</Badge>
      {/if}
      {#if item.rebootRequired}
        <RebootRequiredBadge />
      {/if}
      <MonoValue size="xs" tone="muted" wrap>{resolvedMetadata}</MonoValue>
    </div>
  </div>

  {#if trailingAction}
    <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      {@render control()}
      {@render trailingAction()}
    </div>
  {:else}
    {@render control()}
  {/if}

  {@render footer?.()}
</div>

<style>
  .setup-param-edit-card {
    container-type: inline-size;
  }

  .setup-param-numeric-control {
    grid-template-columns: minmax(0, 1fr);
  }

  @container (min-width: 28rem) {
    .setup-param-numeric-control {
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 15rem);
      align-items: center;
    }
  }
</style>

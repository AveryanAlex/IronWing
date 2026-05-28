<script lang="ts">
import { Slider as Bits } from "bits-ui";
import type { ClassValue } from "clsx";
import { cn } from "../../lib/utils";

type Props = {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
  label?: string;
  showValue?: boolean;
  unit?: string;
  testId?: string;
  ariaLabel?: string;
  class?: ClassValue;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
};

const generatedId = $props.id();

let {
  value = $bindable(0),
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  id,
  label,
  showValue = false,
  unit = "",
  testId,
  ariaLabel,
  class: className,
  onValueChange,
  onValueCommit,
}: Props = $props();

let labelId = $derived(label ? `${generatedId}-label` : undefined);
let displayValue = $derived(`${value}${unit}`);
let rootClass = $derived(
  cn(
    "relative flex h-5 w-full touch-none select-none items-center rounded-full disabled:opacity-50 data-[disabled]:opacity-50",
    className,
  ),
);
</script>

<div class="grid w-full gap-2" data-ui-slider-field>
  {#if label || showValue}
    <div class="flex items-center justify-between gap-3">
      {#if label}
        <span class="text-sm font-medium text-text-primary" id={labelId}>{label}</span>
      {/if}
      {#if showValue}
        <span class="ml-auto text-xs font-medium text-text-secondary">{displayValue}</span>
      {/if}
    </div>
  {/if}
  <Bits.Root
    bind:value
    class={rootClass}
    type="single"
    {id}
    {min}
    {max}
    {step}
    {disabled}
    data-testid={testId}
    aria-label={label ? undefined : (ariaLabel ?? "Slider")}
    aria-labelledby={labelId}
    {onValueChange}
    {onValueCommit}
  >
    <span class="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-bg-input" aria-hidden="true"></span>
    <Bits.Range class="absolute h-2 rounded-full bg-accent" />
    <Bits.Thumb
      class="block size-5 rounded-full border border-accent bg-bg-primary shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:pointer-events-none disabled:opacity-50"
      index={0}
    />
  </Bits.Root>
</div>

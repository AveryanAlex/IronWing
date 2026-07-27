<script lang="ts">
import { Slider as Bits } from "bits-ui";
import type { ClassValue } from "clsx";
import {
  LOG_SLIDER_POSITION_MAX,
  LOG_SLIDER_POSITION_MIN,
  logSliderPositionForValue,
  resolveSliderScale,
  snapSliderValue,
  valueForLogSliderPosition,
  type SliderScale,
} from "../../lib/slider-scale";
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
  scale?: SliderScale;
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
  scale = "linear",
  class: className,
  onValueChange,
  onValueCommit,
}: Props = $props();

let labelId = $derived(label ? `${generatedId}-label` : undefined);
let displayValue = $derived(`${value}${unit}`);
let activeScale = $derived(resolveSliderScale(scale, min, max));
let sliderValue = $derived(activeScale === "log" ? logSliderPositionForValue(value, min, max) : value);
let sliderMin = $derived(activeScale === "log" ? LOG_SLIDER_POSITION_MIN : min);
let sliderMax = $derived(activeScale === "log" ? LOG_SLIDER_POSITION_MAX : max);
let sliderStep = $derived(activeScale === "log" ? 1 : step);
let rootClass = $derived(
  cn(
    "relative flex h-5 w-full touch-none select-none items-center rounded-full disabled:opacity-50 data-[disabled]:opacity-50",
    className,
  ),
);

function rawValueForSliderValue(nextValue: number): number {
  return activeScale === "log"
    ? valueForLogSliderPosition(nextValue, min, max, step)
    : nextValue;
}

function updateValue(nextSliderValue: number) {
  const nextValue = rawValueForSliderValue(nextSliderValue);
  if (nextValue === value) {
    return;
  }

  value = nextValue;
  onValueChange?.(nextValue);
}

function commitValue(nextSliderValue: number) {
  onValueCommit?.(rawValueForSliderValue(nextSliderValue));
}

function handleThumbKeydown(event: KeyboardEvent, bitsHandler: unknown) {
  const forwardToBits = () => {
    if (typeof bitsHandler === "function") {
      bitsHandler(event);
    }
  };

  if (activeScale !== "log" || disabled) {
    forwardToBits();
    return;
  }

  let nextValue: number | null = null;
  if (event.key === "Home") {
    nextValue = min;
  } else if (event.key === "End") {
    nextValue = max;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    nextValue = event.metaKey ? min : snapSliderValue(value - step, min, max, step);
  } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    nextValue = event.metaKey ? max : snapSliderValue(value + step, min, max, step);
  }

  if (nextValue === null) {
    forwardToBits();
    return;
  }

  event.preventDefault();
  if (nextValue === value) {
    return;
  }

  value = nextValue;
  onValueChange?.(nextValue);
}
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
    value={sliderValue}
    class={rootClass}
    type="single"
    {id}
    min={sliderMin}
    max={sliderMax}
    step={sliderStep}
    {disabled}
    data-testid={testId}
    aria-label={label ? undefined : (ariaLabel ?? "Slider")}
    aria-labelledby={labelId}
    onValueChange={updateValue}
    onValueCommit={commitValue}
  >
    <span class="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-bg-input" aria-hidden="true"></span>
    <Bits.Range class="absolute h-2 rounded-full bg-accent" />
    <Bits.Thumb index={0}>
      {#snippet child({ props })}
        <span
          {...props}
          class="block size-5 rounded-full border border-accent bg-bg-primary shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:pointer-events-none disabled:opacity-50"
          aria-label={label ? undefined : (ariaLabel ?? "Slider")}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={displayValue}
          onkeydown={(event) => handleThumbKeydown(event, props.onkeydown)}
        ></span>
      {/snippet}
    </Bits.Thumb>
  </Bits.Root>
</div>

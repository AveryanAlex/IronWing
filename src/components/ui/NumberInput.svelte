<script lang="ts">
import type { ClassValue } from "clsx";
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";
import Tooltip from "./Tooltip.svelte";

type InputSize = "sm" | "default" | "lg";

type Props = Omit<HTMLInputAttributes, "class" | "size" | "type" | "value"> & {
  value?: number | undefined;
  unit?: string;
  unitTooltip?: string | null;
  size?: InputSize;
  invalid?: boolean;
  class?: ClassValue;
  wrapperClass?: ClassValue;
  testId?: string;
  inputTestId?: string;
};

const wrapperSizeClasses: Record<InputSize, string> = {
  sm: "h-8 text-xs",
  default: "h-9 text-sm",
  lg: "h-10 text-base",
};

let {
  value = $bindable(),
  unit,
  unitTooltip,
  size = "default",
  invalid = false,
  class: className,
  wrapperClass,
  testId,
  inputTestId,
  "aria-invalid": ariaInvalid,
  ...rest
}: Props = $props();

let wrapperClassName = $derived(
  cn(
    "flex min-w-0 w-full items-center overflow-hidden rounded-md border border-border-light bg-bg-input shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/35 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
    wrapperSizeClasses[size],
    invalid && "border-danger/70 focus-within:border-danger focus-within:ring-danger/25",
    wrapperClass,
  ),
);

let inputClass = $derived(
  cn(
    "min-w-0 flex-1 bg-transparent px-3 text-text-primary placeholder:text-text-muted outline-none disabled:cursor-not-allowed",
    unit && "pr-2",
    className,
  ),
);

let hasUnitTooltip = $derived(Boolean(unitTooltip && unitTooltip !== unit));
</script>

{#snippet unitLabel()}
  <span class="min-w-0 truncate pr-3 text-xs font-medium text-text-muted">{unit}</span>
{/snippet}

<div class={wrapperClassName} data-ui-number-input data-disabled={rest.disabled ? "true" : undefined}>
  <input
    {...rest}
    bind:value
    class={inputClass}
    type="number"
    data-testid={inputTestId ?? testId}
    aria-invalid={invalid ? "true" : ariaInvalid}
  />
  {#if unit}
    {#if hasUnitTooltip}
      <Tooltip description={unitTooltip ?? undefined} clickToToggle triggerClass="min-w-0 overflow-hidden cursor-help">
        {@render unitLabel()}
      </Tooltip>
    {:else}
      {@render unitLabel()}
    {/if}
  {/if}
</div>
